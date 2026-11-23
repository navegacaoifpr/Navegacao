from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app import models, database

# Rotas do MAPA DE LIGAÇÃO (o endereço continua /intersections pra não
# quebrar o que já existe; o ambiente usado aqui é sempre o do tipo "mapa")
router = APIRouter(prefix="/intersections", tags=["Mapa de ligação"])

OPPOSITE = {"north": "south", "south": "north", "east": "west", "west": "east"}


# MODELOS

class MemberCreate(BaseModel):
    environment_id: int
    x: int | None = None
    y: int | None = None


class MemberPosition(BaseModel):
    x: int
    y: int


class LinkCreate(BaseModel):
    source_node_id: int
    target_node_id: int
    direction: str


# FUNÇÕES DE APOIO

def get_intersection_or_404(db: Session, intersection_id: int) -> models.Environment:
    inter = db.query(models.Environment).filter(models.Environment.id == intersection_id).first()

    if not inter:
        raise HTTPException(status_code=404, detail="Mapa de ligação não encontrado.")

    if inter.kind != models.KIND_MAPA:
        raise HTTPException(status_code=400, detail="Esse ambiente não é o mapa de ligação.")

    return inter


def get_member(db: Session, intersection_id: int, environment_id: int):
    return db.query(models.IntersectionMember).filter(
        models.IntersectionMember.intersection_id == intersection_id,
        models.IntersectionMember.environment_id == environment_id,
    ).first()


def ensure_member(db: Session, intersection_id: int, environment_id: int):
    member = get_member(db, intersection_id, environment_id)

    if member:
        return member

    # sem posição escolhida: coloca ao lado dos cards que já estão no mapa
    count = db.query(models.IntersectionMember).filter(
        models.IntersectionMember.intersection_id == intersection_id
    ).count()

    member = models.IntersectionMember(
        intersection_id=intersection_id,
        environment_id=environment_id,
        x=(count % 4) * 240,
        y=(count // 4) * 180,
    )
    db.add(member)
    db.flush()
    return member


def delete_link_and_edges(db: Session, link: models.IntersectionLink):
    """Apaga a ligação e as conexões entre fotos que ELA criou
    (as que já existiam antes da ligação ficam)."""
    for edge_id in (link.edge_id, link.reverse_edge_id):
        if not edge_id:
            continue

        # outra ligação usando a mesma conexão? então não apaga
        shared = db.query(models.IntersectionLink).filter(
            models.IntersectionLink.id != link.id,
            (models.IntersectionLink.edge_id == edge_id) | (models.IntersectionLink.reverse_edge_id == edge_id),
        ).first()

        if shared:
            continue

        db.query(models.Edge).filter(models.Edge.id == edge_id).delete(synchronize_session=False)

    db.delete(link)


def cleanup_node_references(db: Session, node_ids: list[int]):
    """Antes de apagar fotos: remove as ligações de intersecção e as conexões
    que apontam pra elas (senão o banco recusa, por causa das ForeignKey)."""
    if not node_ids:
        return

    links = db.query(models.IntersectionLink).filter(
        models.IntersectionLink.source_node_id.in_(node_ids)
        | models.IntersectionLink.target_node_id.in_(node_ids)
    ).all()

    for link in links:
        delete_link_and_edges(db, link)

    db.query(models.Edge).filter(
        models.Edge.source_id.in_(node_ids) | models.Edge.target_id.in_(node_ids)
    ).delete(synchronize_session=False)


def serialize_graph(db: Session, inter: models.Environment):
    from app.routers.environments import resolve_start_node

    members = db.query(models.IntersectionMember).filter(
        models.IntersectionMember.intersection_id == inter.id
    ).all()

    envs = {
        e.id: e for e in db.query(models.Environment).filter(
            models.Environment.id.in_([m.environment_id for m in members])
        )
    }

    member_list = []

    for m in members:
        env = envs.get(m.environment_id)
        if not env:
            continue

        start = resolve_start_node(db, env)

        member_list.append({
            "environment_id": env.id,
            "name": env.name,
            "kind": env.kind,
            "cover_image": env.cover_image or (start.image if start else None),
            "x": m.x,
            "y": m.y,
        })

    links = db.query(models.IntersectionLink).filter(
        models.IntersectionLink.intersection_id == inter.id
    ).all()

    node_ids = {l.source_node_id for l in links} | {l.target_node_id for l in links}
    nodes = {n.id: n for n in db.query(models.Node).filter(models.Node.id.in_(node_ids))} if node_ids else {}

    link_list = []

    for l in links:
        source = nodes.get(l.source_node_id)
        target = nodes.get(l.target_node_id)
        if not source or not target:
            continue

        link_list.append({
            "id": l.id,
            "direction": l.direction,
            "source_environment_id": source.environment_id,
            "target_environment_id": target.environment_id,
            "source_node_id": source.id,
            "source_node_name": source.name,
            "target_node_id": target.id,
            "target_node_name": target.name,
        })

    return {
        "intersection": {"id": inter.id, "name": inter.name, "project_id": inter.project_id},
        "members": member_list,
        "links": link_list,
    }


# MAPA DA INTERSECÇÃO (cards dos ambientes + ligações)
@router.get("/{intersection_id}/graph")
def get_graph(intersection_id: int, db: Session = Depends(database.get_db)):
    inter = get_intersection_or_404(db, intersection_id)
    return serialize_graph(db, inter)


# COLOCAR UM AMBIENTE NO MAPA
@router.post("/{intersection_id}/members")
def add_member(intersection_id: int, data: MemberCreate, db: Session = Depends(database.get_db)):
    inter = get_intersection_or_404(db, intersection_id)

    env = db.query(models.Environment).filter(models.Environment.id == data.environment_id).first()

    if not env or env.project_id != inter.project_id:
        raise HTTPException(status_code=404, detail="Ambiente não encontrado nesse projeto.")

    if env.kind not in models.PHOTO_KINDS:
        raise HTTPException(status_code=400, detail="Só ambientes comuns e de intersecção entram no mapa.")

    member = ensure_member(db, inter.id, env.id)

    if data.x is not None and data.y is not None:
        member.x = data.x
        member.y = data.y

    db.commit()
    return serialize_graph(db, inter)


# MOVER O CARD DE UM AMBIENTE NO MAPA
@router.put("/{intersection_id}/members/{environment_id}")
def move_member(
    intersection_id: int,
    environment_id: int,
    data: MemberPosition,
    db: Session = Depends(database.get_db),
):
    get_intersection_or_404(db, intersection_id)
    member = get_member(db, intersection_id, environment_id)

    if not member:
        raise HTTPException(status_code=404, detail="Esse ambiente não está no mapa.")

    member.x = data.x
    member.y = data.y
    db.commit()

    return {"message": "Posição salva."}


# TIRAR UM AMBIENTE DO MAPA (e as ligações dele nesta intersecção)
@router.delete("/{intersection_id}/members/{environment_id}")
def remove_member(intersection_id: int, environment_id: int, db: Session = Depends(database.get_db)):
    inter = get_intersection_or_404(db, intersection_id)
    member = get_member(db, intersection_id, environment_id)

    if not member:
        raise HTTPException(status_code=404, detail="Esse ambiente não está no mapa.")

    env_node_ids = [n.id for n in db.query(models.Node.id).filter(models.Node.environment_id == environment_id)]

    if env_node_ids:
        links = db.query(models.IntersectionLink).filter(
            models.IntersectionLink.intersection_id == inter.id,
            models.IntersectionLink.source_node_id.in_(env_node_ids)
            | models.IntersectionLink.target_node_id.in_(env_node_ids),
        ).all()

        for link in links:
            delete_link_and_edges(db, link)

    db.delete(member)
    db.commit()

    return serialize_graph(db, inter)


# LIGAR DOIS AMBIENTES (foto de saída -> foto de entrada)
@router.post("/{intersection_id}/links")
def create_link(intersection_id: int, data: LinkCreate, db: Session = Depends(database.get_db)):
    inter = get_intersection_or_404(db, intersection_id)

    if data.direction not in OPPOSITE:
        raise HTTPException(status_code=400, detail="Direção inválida.")

    source = db.query(models.Node).filter(models.Node.id == data.source_node_id).first()
    target = db.query(models.Node).filter(models.Node.id == data.target_node_id).first()

    if not source or not target:
        raise HTTPException(status_code=404, detail="Foto não encontrada.")

    if not source.environment_id or not target.environment_id:
        raise HTTPException(status_code=400, detail="As duas fotos precisam pertencer a um ambiente.")

    if source.environment_id == target.environment_id:
        raise HTTPException(status_code=400, detail="Escolha fotos de ambientes diferentes.")

    envs = db.query(models.Environment).filter(
        models.Environment.id.in_([source.environment_id, target.environment_id])
    ).all()

    if len(envs) != 2 or any(e.project_id != inter.project_id for e in envs):
        raise HTTPException(status_code=400, detail="Os dois ambientes precisam ser deste projeto.")

    duplicate = db.query(models.IntersectionLink).filter(
        models.IntersectionLink.intersection_id == inter.id,
        models.IntersectionLink.source_node_id == source.id,
        models.IntersectionLink.target_node_id == target.id,
    ).first()

    if duplicate:
        raise HTTPException(status_code=400, detail="Essa ligação já existe.")

    # os dois ambientes passam a aparecer como card no mapa
    ensure_member(db, inter.id, source.environment_id)
    ensure_member(db, inter.id, target.environment_id)

    # conexão de ida
    edge = db.query(models.Edge).filter(
        models.Edge.source_id == source.id,
        models.Edge.target_id == target.id,
    ).first()

    created_edge_id = None

    if not edge:
        edge = models.Edge(source_id=source.id, target_id=target.id, direction=data.direction)
        db.add(edge)
        db.flush()
        created_edge_id = edge.id

    # conexão de volta (direção oposta)
    reverse = db.query(models.Edge).filter(
        models.Edge.source_id == target.id,
        models.Edge.target_id == source.id,
    ).first()

    created_reverse_id = None

    if not reverse:
        reverse = models.Edge(source_id=target.id, target_id=source.id, direction=OPPOSITE[data.direction])
        db.add(reverse)
        db.flush()
        created_reverse_id = reverse.id

    db.add(models.IntersectionLink(
        intersection_id=inter.id,
        source_node_id=source.id,
        target_node_id=target.id,
        direction=data.direction,
        edge_id=created_edge_id,
        reverse_edge_id=created_reverse_id,
    ))

    db.commit()
    return serialize_graph(db, inter)


# DESFAZER UMA LIGAÇÃO
@router.delete("/{intersection_id}/links/{link_id}")
def delete_link(intersection_id: int, link_id: int, db: Session = Depends(database.get_db)):
    inter = get_intersection_or_404(db, intersection_id)

    link = db.query(models.IntersectionLink).filter(
        models.IntersectionLink.id == link_id,
        models.IntersectionLink.intersection_id == inter.id,
    ).first()

    if not link:
        raise HTTPException(status_code=404, detail="Ligação não encontrada.")

    delete_link_and_edges(db, link)
    db.commit()

    return serialize_graph(db, inter)
