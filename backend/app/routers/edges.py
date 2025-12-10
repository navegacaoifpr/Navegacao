from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import models, database

router = APIRouter(prefix="/edges", tags=["Edges"])

# Criar nova conexão (aresta)
@router.post("/")
def create_edge(source_id: int, target_id: int, direction: str, db: Session = Depends(database.get_db)):
    # Verifica se os nós existem
    if not db.query(models.Node).filter(models.Node.id == source_id).first():
        raise HTTPException(status_code=404, detail=f"Nó {source_id} não encontrado.")
    if not db.query(models.Node).filter(models.Node.id == target_id).first():
        raise HTTPException(status_code=404, detail=f"Nó {target_id} não encontrado.")
    
    edge = models.Edge(source_id=source_id, target_id=target_id)
    edge.direction = direction
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return {"message": "Conexão criada com sucesso!", "edge": edge}


# Listar todas as conexões
@router.get("/")
def list_edges(db: Session = Depends(database.get_db)):
    edges = db.query(models.Edge).all()
    return edges


# Buscar conexões a partir de um nó
@router.get("/{node_id}")
def get_edges_from_node(node_id: int, db: Session = Depends(database.get_db)):
    edges = db.query(models.Edge).filter(models.Edge.source_id == node_id).all()
    # retorna lista (pode estar vazia) em vez de 404
    return [
        {
            "id": e.id,
            "source_id": e.source_id,
            "target_id": e.target_id,
            "direction": getattr(e, "direction", None)
        }
        for e in edges
    ]


# Atualizar uma conexão (aresta)
@router.put("/{edge_id}")
def update_edge(edge_id: int, source_id: int = None, target_id: int = None, direction: str = None, db: Session = Depends(database.get_db)):
    edge = db.query(models.Edge).filter(models.Edge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Conexão não encontrada.")

    if source_id is not None:
        edge.source_id = source_id
    if target_id is not None:
        edge.target_id = target_id
    if direction is not None:
        edge.direction = direction

    db.commit()
    db.refresh(edge)
    return {"message": "Conexão atualizada com sucesso!", "edge": edge}



@router.delete("/{edge_id}")
def delete_edge(edge_id: int, db: Session = Depends(database.get_db)):
    edge = db.query(models.Edge).filter(models.Edge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Conexão não encontrada.")
    db.delete(edge)
    db.commit()
    return {"message": "Conexão deletada com sucesso!"}

