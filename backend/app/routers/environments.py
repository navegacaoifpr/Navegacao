from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, aliased
from pydantic import BaseModel
import shutil
import os

from app import models, database
from app.routers.folders import safe_filename, unique_filename, generate_thumbnail

router = APIRouter(prefix="/environments", tags=["Environments"])

# tipos que o administrador pode criar (o mapa é criado sozinho)
KINDS = set(models.PHOTO_KINDS)

MAX_COVER_BYTES = 10 * 1024 * 1024  # 10 MB


# MODELOS

class EnvironmentCreate(BaseModel):
    project_id: int
    name: str
    kind: str = models.KIND_COMUM
    description: str | None = None


class EnvironmentUpdate(BaseModel):
    name: str | None = None
    kind: str | None = None
    description: str | None = None
    cover_image: str | None = None
    start_node_id: int | None = None


# FUNÇÕES DE APOIO (também usadas em projects.py)

MAP_NAME = "Mapa de ligação"


def check_image_upload(file: UploadFile):
    """Só aceita imagem de até 10 MB como capa."""
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="O arquivo precisa ser uma imagem (JPG, PNG...).")

    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)

    if size > MAX_COVER_BYTES:
        raise HTTPException(status_code=400, detail="A foto é grande demais (máximo 10 MB).")


def ensure_project_map(db: Session, project_id: int) -> models.Environment:
    """Cada projeto tem UM mapa de ligação (o "quebra-cabeça" dos ambientes).
    Cria se ainda não existir."""
    env = db.query(models.Environment).filter(
        models.Environment.project_id == project_id,
        models.Environment.kind == models.KIND_MAPA,
    ).order_by(models.Environment.id).first()

    if env:
        return env

    env = models.Environment(
        project_id=project_id,
        name=MAP_NAME,
        kind=models.KIND_MAPA,
        position=0,
    )
    db.add(env)
    db.commit()
    db.refresh(env)
    return env


def environment_links(db: Session, project_id: int) -> dict[int, set[int]]:
    """Para cada ambiente, os outros ambientes ligados a ele por passagens
    (as ligações feitas no mapa ou pelas portas no editor)."""
    source = aliased(models.Node)
    target = aliased(models.Node)

    rows = (
        db.query(source.environment_id, target.environment_id)
        .select_from(models.IntersectionLink)
        .join(source, models.IntersectionLink.source_node_id == source.id)
        .join(target, models.IntersectionLink.target_node_id == target.id)
        .join(models.Environment, models.Environment.id == models.IntersectionLink.intersection_id)
        .filter(models.Environment.project_id == project_id)
        .distinct()
        .all()
    )

    links: dict[int, set[int]] = {}

    for a, b in rows:
        if a and b and a != b:
            links.setdefault(a, set()).add(b)
            links.setdefault(b, set()).add(a)

    return links


def resolve_start_node(db: Session, env: models.Environment):
    """Foto de partida: a escolhida pelo admin; se não houver (ou tiver
    sido apagada), a primeira foto posicionada no mapa; senão, a primeira foto."""
    if env.start_node_id:
        node = db.query(models.Node).filter(
            models.Node.id == env.start_node_id,
            models.Node.environment_id == env.id,
        ).first()
        if node:
            return node

    placed = db.query(models.Node).filter(
        models.Node.environment_id == env.id,
        models.Node.x.isnot(None),
        models.Node.y.isnot(None),
    ).order_by(models.Node.id).first()

    if placed:
        return placed

    return db.query(models.Node).filter(
        models.Node.environment_id == env.id
    ).order_by(models.Node.id).first()


def serialize_environment(db: Session, env: models.Environment, links: dict[int, set[int]], kinds: dict[int, str]):
    start = resolve_start_node(db, env)
    linked = sorted(links.get(env.id, set()))

    return {
        "id": env.id,
        "project_id": env.project_id,
        "name": env.name,
        "kind": env.kind,
        "description": env.description,
        "position": env.position,
        # sem capa escolhida, o card usa a foto de partida
        "cover_image": env.cover_image or (start.image if start else None),
        "start_node_id": start.id if start else None,
        "image_count": db.query(models.Node).filter(models.Node.environment_id == env.id).count(),
        "folder_count": db.query(models.Folder).filter(models.Folder.environment_id == env.id).count(),
        # bolinhas amarelas embaixo do card
        "linked_intersections": [i for i in linked if kinds.get(i) == models.KIND_INTERSECAO],
        # todos os ambientes ligados (usado no grafo de intersecção)
        "linked_environments": linked,
    }


def serialize_project_environments(db: Session, project_id: int):
    envs = db.query(models.Environment).filter(
        models.Environment.project_id == project_id
    ).order_by(models.Environment.position, models.Environment.id).all()

    links = environment_links(db, project_id)
    kinds = {e.id: e.kind for e in envs}

    return [serialize_environment(db, e, links, kinds) for e in envs]


def get_environment_or_404(db: Session, environment_id: int) -> models.Environment:
    env = db.query(models.Environment).filter(models.Environment.id == environment_id).first()

    if not env:
        raise HTTPException(status_code=404, detail="Ambiente não encontrado.")

    return env


def delete_environment_cascade(db: Session, env: models.Environment):
    """Apaga o ambiente e tudo que depende dele: fotos, pastas, conexões entre
    fotos, ligações do mapa e os cards dele nos mapas. (Não faz commit.)
    Os arquivos de imagem continuam na pasta do servidor."""
    from app.routers.intersections import cleanup_node_references, delete_link_and_edges

    # ligações feitas dentro deste ambiente (quando ele é um mapa)
    for link in db.query(models.IntersectionLink).filter(
        models.IntersectionLink.intersection_id == env.id
    ).all():
        delete_link_and_edges(db, link)

    node_ids = [n.id for n in db.query(models.Node.id).filter(models.Node.environment_id == env.id)]

    # ligações e conexões que apontam para as fotos deste ambiente
    cleanup_node_references(db, node_ids)
    db.flush()

    db.query(models.Node).filter(models.Node.environment_id == env.id).delete(synchronize_session=False)
    db.query(models.Folder).filter(models.Folder.environment_id == env.id).delete(synchronize_session=False)

    db.query(models.IntersectionMember).filter(
        (models.IntersectionMember.intersection_id == env.id)
        | (models.IntersectionMember.environment_id == env.id)
    ).delete(synchronize_session=False)

    db.flush()
    db.delete(env)


# CRIAR AMBIENTE
@router.post("/")
def create_environment(data: EnvironmentCreate, db: Session = Depends(database.get_db)):
    project = db.query(models.Project).filter(models.Project.id == data.project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    name = data.name.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Informe o nome do ambiente.")

    if data.kind not in KINDS:
        raise HTTPException(
            status_code=400,
            detail="Escolha ambiente comum ou ambiente de intersecção (o mapa de ligação já existe).",
        )

    existing = db.query(models.Environment).filter(
        models.Environment.project_id == data.project_id,
        models.Environment.name == name,
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Já existe um ambiente com esse nome nesse projeto.")

    env = models.Environment(
        project_id=data.project_id,
        name=name,
        kind=data.kind,
        description=data.description,
        position=db.query(models.Environment).filter(
            models.Environment.project_id == data.project_id
        ).count(),
    )

    db.add(env)
    db.commit()
    db.refresh(env)

    return {"environment": serialize_environment(db, env, {}, {})}


# BUSCAR UM AMBIENTE
@router.get("/{environment_id}")
def get_environment(environment_id: int, db: Session = Depends(database.get_db)):
    env = get_environment_or_404(db, environment_id)

    links = environment_links(db, env.project_id)
    kinds = {
        e.id: e.kind
        for e in db.query(models.Environment).filter(models.Environment.project_id == env.project_id)
    }

    return serialize_environment(db, env, links, kinds)


# EDITAR AMBIENTE (nome, tipo, capa, foto de partida)
@router.put("/{environment_id}")
def update_environment(environment_id: int, data: EnvironmentUpdate, db: Session = Depends(database.get_db)):
    env = get_environment_or_404(db, environment_id)

    if data.name is not None:
        name = data.name.strip()

        if not name:
            raise HTTPException(status_code=400, detail="Informe o nome do ambiente.")

        clash = db.query(models.Environment).filter(
            models.Environment.project_id == env.project_id,
            models.Environment.name == name,
            models.Environment.id != env.id,
        ).first()

        if clash:
            raise HTTPException(status_code=400, detail="Já existe um ambiente com esse nome nesse projeto.")

        env.name = name

    if data.kind is not None and data.kind != env.kind:
        # comum <-> intersecção pode trocar (os dois têm fotos); o mapa não
        if data.kind not in KINDS or env.kind not in KINDS:
            raise HTTPException(status_code=400, detail="Esse tipo de ambiente não pode ser trocado.")
        env.kind = data.kind

    if data.description is not None:
        env.description = data.description

    if data.cover_image is not None:
        env.cover_image = data.cover_image or None

    if data.start_node_id is not None:
        node = db.query(models.Node).filter(
            models.Node.id == data.start_node_id,
            models.Node.environment_id == env.id,
        ).first()

        if not node:
            raise HTTPException(status_code=400, detail="Essa foto não pertence a esse ambiente.")

        env.start_node_id = node.id

    db.commit()

    return get_environment(env.id, db)


# ENVIAR FOTO DE CAPA DO CARD
@router.post("/{environment_id}/cover")
def upload_environment_cover(
    environment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
):
    env = get_environment_or_404(db, environment_id)
    check_image_upload(file)

    upload_dir = "app/images"
    thumb_dir = os.path.join(upload_dir, "thumbs")
    os.makedirs(thumb_dir, exist_ok=True)

    filename = unique_filename(upload_dir, safe_filename(file.filename))
    file_path = os.path.join(upload_dir, filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    generate_thumbnail(file_path, os.path.join(thumb_dir, filename))

    env.cover_image = filename
    db.commit()

    return get_environment(env.id, db)


# EXCLUIR AMBIENTE (apaga junto as pastas, fotos, conexões e ligações dele)
@router.delete("/{environment_id}")
def delete_environment(environment_id: int, db: Session = Depends(database.get_db)):
    env = get_environment_or_404(db, environment_id)

    if env.kind == models.KIND_MAPA:
        raise HTTPException(status_code=400, detail="O mapa de ligação não pode ser excluído.")

    delete_environment_cascade(db, env)
    db.commit()

    return {"message": "Ambiente excluído com sucesso!"}


# PORTAS DO AMBIENTE: fotos daqui que levam a outro ambiente (e pra onde)
@router.get("/{environment_id}/doors")
def list_doors(environment_id: int, db: Session = Depends(database.get_db)):
    env = get_environment_or_404(db, environment_id)

    env_node_ids = [
        n.id for n in db.query(models.Node.id).filter(models.Node.environment_id == env.id)
    ]

    if not env_node_ids:
        return []

    links = db.query(models.IntersectionLink).filter(
        models.IntersectionLink.source_node_id.in_(env_node_ids)
        | models.IntersectionLink.target_node_id.in_(env_node_ids)
    ).all()

    opposite = {"north": "south", "south": "north", "east": "west", "west": "east"}
    doors = []

    for link in links:
        # vista sempre "daqui pra lá": se a ligação foi feita do outro lado,
        # inverte origem/destino e a direção
        if link.source_node_id in env_node_ids:
            here_id, there_id, direction = link.source_node_id, link.target_node_id, link.direction
        else:
            here_id, there_id, direction = link.target_node_id, link.source_node_id, opposite.get(link.direction)

        there = db.query(models.Node).filter(models.Node.id == there_id).first()

        if not there:
            continue

        there_env = db.query(models.Environment).filter(models.Environment.id == there.environment_id).first()

        doors.append({
            "link_id": link.id,
            "map_id": link.intersection_id,
            "node_id": here_id,
            "direction": direction,
            "to_environment_id": there.environment_id,
            "to_environment_name": there_env.name if there_env else None,
            "to_node_id": there.id,
            "to_node_name": there.name,
            "to_node_image": there.image,
        })

    return doors
