from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app import models, database

router = APIRouter(prefix="/edges", tags=["Edges"])

@router.post("/")
def create_edge(
    source_id: int,
    target_id: int,
    direction: str,
    db: Session = Depends(database.get_db)
):

    # verifica se os nós existem
    if not db.query(models.Node).filter(models.Node.id == source_id).first():
        raise HTTPException(
            status_code=404,
            detail=f"Nó {source_id} não encontrado."
        )

    if not db.query(models.Node).filter(models.Node.id == target_id).first():
        raise HTTPException(
            status_code=404,
            detail=f"Nó {target_id} não encontrado."
        )

    # evita edge duplicada
    existing = db.query(models.Edge).filter(
        models.Edge.source_id == source_id,
        models.Edge.target_id == target_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Essa conexão já existe."
        )

    # direções opostas
    opposite = {
        "north": "south",
        "south": "north",
        "east": "west",
        "west": "east"
    }

    # edge principal
    edge = models.Edge(
        source_id=source_id,
        target_id=target_id,
        direction=direction
    )

    db.add(edge)

    # edge reversa
    reverse_direction = opposite.get(direction)

    # verifica se já existe reversa
    reverse_exists = db.query(models.Edge).filter(
        models.Edge.source_id == target_id,
        models.Edge.target_id == source_id
    ).first()

    if reverse_direction and not reverse_exists:

        reverse_edge = models.Edge(
            source_id=target_id,
            target_id=source_id,
            direction=reverse_direction
        )

        db.add(reverse_edge)

    db.commit()
    db.refresh(edge)

    return {
        "message": "Conexões criadas com sucesso!",
        "edge": edge
    }


# Listar todas as conexões
# ?environment_id=3 traz as conexões que saem OU chegam em fotos daquele
# ambiente (inclui as que ligam ele a outros ambientes)
@router.get("/")
def list_edges(
    environment_id: int | None = Query(default=None),
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Edge)

    if environment_id is not None:
        env_nodes = db.query(models.Node.id).filter(models.Node.environment_id == environment_id)
        query = query.filter(
            (models.Edge.source_id.in_(env_nodes)) | (models.Edge.target_id.in_(env_nodes))
        )

    return query.all()


# Buscar conexões a partir de um nó
@router.get("/{node_id}")
def get_edges_from_node(node_id: int, db: Session = Depends(database.get_db)):
    edges = db.query(models.Edge).filter(models.Edge.source_id == node_id).all()

    return [
        {
            "id": e.id,
            "source_id": e.source_id,
            "target_id": e.target_id,
            "direction": getattr(e, "direction", None)
        }
        for e in edges
    ]


# Atualizar conexão
@router.put("/{edge_id}")
def update_edge(
    edge_id: int,
    source_id: int = None,
    target_id: int = None,
    direction: str = None,
    db: Session = Depends(database.get_db)
):

    edge = db.query(models.Edge).filter(
        models.Edge.id == edge_id
    ).first()

    if not edge:
        raise HTTPException(
            status_code=404,
            detail="Conexão não encontrada."
        )

    if source_id is not None:
        edge.source_id = source_id

    if target_id is not None:
        edge.target_id = target_id

    if direction is not None:
        edge.direction = direction

    db.commit()
    db.refresh(edge)

    return {
        "message": "Conexão atualizada com sucesso!",
        "edge": edge
    }


@router.delete("/{edge_id}")
def delete_edge(edge_id: int, db: Session = Depends(database.get_db)):

    edge = db.query(models.Edge).filter(
        models.Edge.id == edge_id
    ).first()

    if not edge:
        raise HTTPException(
            status_code=404,
            detail="Conexão não encontrada."
        )

    db.delete(edge)
    db.commit()

    return {
        "message": "Conexão deletada com sucesso!"
    }