from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import models, database

router = APIRouter(prefix="/nodes", tags=["Nodes"])


# Criar novo nó
@router.post("/")
def create_node(name: str, image: str, x: float = 0, y: float = 0, db: Session = Depends(database.get_db)):
    existing = db.query(models.Node).filter(models.Node.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Já existe um nó com esse nome.")
    
    node = models.Node(name=name, image=image, x=x, y=y)
    db.add(node)
    db.commit()
    db.refresh(node)
    return {"message": "Nó criado com sucesso!", "node": node}


# Listar todos os nós
@router.get("/")
def list_nodes(db: Session = Depends(database.get_db)):
    return db.query(models.Node).all()


# Obter um nó específico pelo ID
@router.get("/{node_id}")
def get_node(node_id: int, db: Session = Depends(database.get_db)):
    node = db.query(models.Node).filter(models.Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Nó não encontrado.")
    return node


    # Atualizar um nó existente
@router.put("/{node_id}")
def update_node(node_id: int, name: str = None, image: str = None, x: float = None, y: float = None, db: Session = Depends(database.get_db)):
    node = db.query(models.Node).filter(models.Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Nó não encontrado.")

    if name is not None:
        node.name = name
    if image is not None:
        node.image = image
    if x is not None:
        node.x = x
    if y is not None:
        node.y = y

    db.commit()
    db.refresh(node)
    return {"message": "Nó atualizado com sucesso!", "node": node}


@router.delete("/{node_id}")
def delete_node(node_id: int, db: Session = Depends(database.get_db)):
    node = db.query(models.Node).filter(models.Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Nó não encontrado.")
    db.delete(node)
    db.commit()
    return {"message": "Nó deletado com sucesso!"}


