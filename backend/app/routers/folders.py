from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from PIL import Image
import shutil
import os
import re

from app import models, database

router = APIRouter(prefix="/folders", tags=["Folders"])

THUMB_SIZE = 320

# deslocamento em pixels de um node pro próximo, seguindo a direção
# escolhida ao encadear uma pasta (eixo Y cresce pra baixo na tela,
# por isso "north" diminui Y)
DIRECTION_OFFSETS = {
    "north": (0, -140),
    "south": (0, 140),
    "east": (140, 0),
    "west": (-140, 0),
}

DIRECTION_OPPOSITE = {
    "north": "south",
    "south": "north",
    "east": "west",
    "west": "east",
}


def generate_thumbnail(source_path: str, thumb_path: str):
    try:
        with Image.open(source_path) as img:
            img = img.convert("RGB")
            img.thumbnail((THUMB_SIZE, THUMB_SIZE))
            img.save(thumb_path, "JPEG", quality=82)
    except Exception:
        pass



def safe_filename(original: str) -> str:
    # o navegador pode mandar "Pasta/sub/foto.jpg" ao importar uma pasta
    # inteira; aqui fica só o nome do arquivo, sem caminho
    name = os.path.basename((original or "").replace("\\", "/"))
    # remove caracteres que o Windows não aceita em nome de arquivo
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    return name or "imagem.jpg"


def unique_filename(directory: str, filename: str) -> str:
    # evita sobrescrever uma imagem que já existe com o mesmo nome
    base, ext = os.path.splitext(filename)
    candidate = filename
    counter = 1

    while os.path.exists(os.path.join(directory, candidate)):
        candidate = f"{base}_{counter}{ext}"
        counter += 1

    return candidate



# espaço entre o que já está no mapa e a pasta nova encadeada
FREE_SPACE_GAP = 300


def free_start_position(db: Session, folder_id: int, direction: str):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()
    environment_id = folder.environment_id if folder else None

    # nodes de OUTRAS pastas (ou sem pasta) do MESMO ambiente que já estão no mapa
    others = db.query(models.Node).filter(
        models.Node.x.isnot(None),
        models.Node.y.isnot(None),
        models.Node.environment_id == environment_id,
        (models.Node.folder_id != folder_id) | (models.Node.folder_id.is_(None))
    ).all()

    if not others:
        return 0, 0

    min_x = min(n.x for n in others)
    max_x = max(n.x for n in others)
    min_y = min(n.y for n in others)
    max_y = max(n.y for n in others)

    # corredores verticais nascem à direita de tudo; horizontais, embaixo.
    # o ponto de partida é escolhido pra linha crescer "pra fora" do que já existe
    if direction == "north":
        return max_x + FREE_SPACE_GAP, max_y
    if direction == "south":
        return max_x + FREE_SPACE_GAP, min_y
    if direction == "east":
        return min_x, max_y + FREE_SPACE_GAP
    return max_x, max_y + FREE_SPACE_GAP  # west

def sort_nodes_for_chain(nodes):
    return sorted(
        nodes,
        key=lambda n: (
            n.chain_order is None,
            n.chain_order if n.chain_order is not None else 0,
            n.image or "",
        ),
    )


# MODELOS

class FolderCreate(BaseModel):
    name: str
    color: str | None = None
    environment_id: int | None = None


class FolderUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class ReorderItem(BaseModel):
    id: int
    position: int


class ImageOrderItem(BaseModel):
    id: int
    chain_order: int


class ChainRequest(BaseModel):
    direction: str


# CRIAR PASTA
@router.post("/")
def create_folder(folder: FolderCreate, db: Session = Depends(database.get_db)):
    if folder.environment_id is not None:
        env = db.query(models.Environment).filter(models.Environment.id == folder.environment_id).first()
        if not env:
            raise HTTPException(status_code=404, detail="Ambiente não encontrado.")

    # o nome só precisa ser único dentro do mesmo ambiente
    existing = db.query(models.Folder).filter(
        models.Folder.name == folder.name,
        models.Folder.environment_id == folder.environment_id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Já existe uma pasta com esse nome.")

    next_position = db.query(models.Folder).filter(
        models.Folder.environment_id == folder.environment_id
    ).count()

    new_folder = models.Folder(
        name=folder.name,
        color=folder.color,
        position=next_position,
        environment_id=folder.environment_id
    )

    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)

    return {"folder": new_folder}


# LISTAR PASTAS (com contagem de imagens)
@router.get("/")
def list_folders(
    environment_id: int | None = Query(default=None),
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Folder)

    if environment_id is not None:
        query = query.filter(models.Folder.environment_id == environment_id)

    folders = query.order_by(models.Folder.position).all()

    return [
        {
            "id": f.id,
            "name": f.name,
            "color": f.color,
            "position": f.position,
            "environment_id": f.environment_id,
            "image_count": len(f.nodes)
        }
        for f in folders
    ]


# REORDENAR PASTAS (essa rota precisa vir ANTES de /{folder_id})
@router.put("/reorder")
def reorder_folders(items: List[ReorderItem], db: Session = Depends(database.get_db)):
    for item in items:
        folder = db.query(models.Folder).filter(models.Folder.id == item.id).first()
        if folder:
            folder.position = item.position

    db.commit()

    return {"message": "Ordem atualizada com sucesso!"}


# IMAGENS DE UMA PASTA (inclui as ainda não posicionadas no grafo, x/y nulos)
@router.get("/{folder_id}/images")
def get_folder_images(folder_id: int, db: Session = Depends(database.get_db)):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()

    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")

    return db.query(models.Node).filter(models.Node.folder_id == folder_id).all()


# REORDENAR AS IMAGENS DENTRO DA PASTA (define a ordem do "corredor")
@router.put("/{folder_id}/reorder-images")
def reorder_images(
    folder_id: int,
    items: List[ImageOrderItem],
    db: Session = Depends(database.get_db)
):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()

    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")

    for item in items:
        node = db.query(models.Node).filter(
            models.Node.id == item.id,
            models.Node.folder_id == folder_id
        ).first()

        if node:
            node.chain_order = item.chain_order

    db.commit()

    return {"message": "Ordem das imagens atualizada."}


# ENCADEAR PASTA: cria as conexões entre as imagens em sequência,
# numa única direção, e já reposiciona os nodes em linha reta no mapa
@router.post("/{folder_id}/chain")
def chain_folder(
    folder_id: int,
    data: ChainRequest,
    db: Session = Depends(database.get_db)
):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()

    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")

    if data.direction not in DIRECTION_OFFSETS:
        raise HTTPException(status_code=400, detail="Direção inválida.")

    nodes = db.query(models.Node).filter(models.Node.folder_id == folder_id).all()

    if len(nodes) < 2:
        raise HTTPException(
            status_code=400,
            detail="A pasta precisa de pelo menos 2 imagens pra encadear."
        )

    nodes = sort_nodes_for_chain(nodes)

    forward = data.direction
    backward = DIRECTION_OPPOSITE[forward]
    dx, dy = DIRECTION_OFFSETS[forward]

    # ponto de partida: usa a posição do primeiro node se ele já estiver
    # no mapa; senão, procura um espaço livre ao lado do que já existe
    if nodes[0].x is not None and nodes[0].y is not None:
        start_x, start_y = nodes[0].x, nodes[0].y
    else:
        start_x, start_y = free_start_position(db, folder_id, forward)

    for i, node in enumerate(nodes):
        node.x = start_x + dx * i
        node.y = start_y + dy * i

    created = 0

    for i in range(len(nodes) - 1):
        source = nodes[i]
        target = nodes[i + 1]

        exists = db.query(models.Edge).filter(
            models.Edge.source_id == source.id,
            models.Edge.target_id == target.id
        ).first()

        if not exists:
            db.add(models.Edge(source_id=source.id, target_id=target.id, direction=forward))
            created += 1

        reverse_exists = db.query(models.Edge).filter(
            models.Edge.source_id == target.id,
            models.Edge.target_id == source.id
        ).first()

        if not reverse_exists:
            db.add(models.Edge(source_id=target.id, target_id=source.id, direction=backward))

    db.commit()

    return {
        "message": f"Pasta encadeada! {created} conexão(ões) nova(s) em {len(nodes)} imagens.",
        "count": len(nodes)
    }


# TIRAR PASTA DO GRAFO (as imagens continuam na biblioteca e as
# conexões ficam guardadas; ao arrastar a pasta de volta, as setas voltam)
@router.post("/{folder_id}/unplace")
def unplace_folder(folder_id: int, db: Session = Depends(database.get_db)):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()

    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")

    count = 0

    for node in folder.nodes:
        if node.x is not None or node.y is not None:
            node.x = None
            node.y = None
            count += 1

    db.commit()

    return {"message": f"{count} imagem(ns) retirada(s) do grafo.", "count": count}


# RENOMEAR / MUDAR COR DA PASTA
@router.put("/{folder_id}")
def update_folder(folder_id: int, data: FolderUpdate, db: Session = Depends(database.get_db)):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()

    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")

    if data.name is not None:
        folder.name = data.name
    if data.color is not None:
        folder.color = data.color

    db.commit()
    db.refresh(folder)

    return {"folder": folder}


# EXCLUIR PASTA (apaga junto as imagens, as conexões e os arquivos)
@router.delete("/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(database.get_db)):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()

    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")

    nodes = list(folder.nodes)
    node_ids = [node.id for node in nodes]
    image_files = {node.image for node in nodes if node.image}

    if node_ids:
        # conexões e ligações de intersecção que saem ou chegam nessas
        # imagens precisam sair antes dos nodes
        from app.routers.intersections import cleanup_node_references
        cleanup_node_references(db, node_ids)

        for node in nodes:
            db.delete(node)

    db.delete(folder)
    db.commit()

    # só apaga o arquivo do disco se nenhum outro node ainda usa essa imagem
    # (a opção "Copiar" pode fazer duas pastas usarem o mesmo arquivo)
    for image in image_files:
        still_used = db.query(models.Node).filter(models.Node.image == image).first()
        if still_used:
            continue

        for path in (os.path.join("app/images", image), os.path.join("app/images/thumbs", image)):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError:
                pass

    return {"message": f"Pasta excluída com sucesso, junto com {len(node_ids)} imagem(ns)."}


# UPLOAD DE IMAGENS PRA DENTRO DA PASTA
@router.post("/{folder_id}/upload")
def upload_images_to_folder(
    folder_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(database.get_db)
):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id).first()

    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")

    upload_dir = "app/images"
    thumb_dir = os.path.join(upload_dir, "thumbs")

    os.makedirs(upload_dir, exist_ok=True)
    os.makedirs(thumb_dir, exist_ok=True)

    created_nodes = []

    for file in files:
        filename = unique_filename(upload_dir, safe_filename(file.filename))
        file_path = os.path.join(upload_dir, filename)

        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except OSError as erro:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Não foi possível salvar a imagem '{filename}': {erro}"
            )

        generate_thumbnail(file_path, os.path.join(thumb_dir, filename))

        base_name = os.path.splitext(filename)[0]
        name = base_name
        suffix = 1

        while db.query(models.Node).filter(models.Node.name == name).first():
            name = f"{base_name} ({suffix})"
            suffix += 1

        new_node = models.Node(
            name=name,
            image=filename,
            x=None,
            y=None,
            folder_id=folder_id,
            environment_id=folder.environment_id
        )

        db.add(new_node)
        created_nodes.append(new_node)

    db.commit()

    for node in created_nodes:
        db.refresh(node)

    return {"nodes": created_nodes}
