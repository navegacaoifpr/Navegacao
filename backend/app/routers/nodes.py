from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app import models, database
from fastapi import UploadFile, File
from pydantic import BaseModel
from PIL import Image
import shutil
import os

router = APIRouter(prefix="/nodes", tags=["Nodes"])

THUMB_SIZE = 320


def generate_thumbnail(source_path: str, thumb_path: str):
    try:
        with Image.open(source_path) as img:
            img = img.convert("RGB")
            img.thumbnail((THUMB_SIZE, THUMB_SIZE))
            img.save(thumb_path, "JPEG", quality=82)
    except Exception:
        pass



# MODELO

class NodeCreate(BaseModel):
    name: str
    image: str
    x: float
    y: float
    environment_id: int | None = None


# CRIAR NODE
@router.post("/")
def create_node(node: NodeCreate, db: Session = Depends(database.get_db)):
    existing = db.query(models.Node).filter(models.Node.name == node.name).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Já existe um nó com esse nome.")
    
    new_node = models.Node(
        name=node.name,
        image=node.image,
        x=node.x,
        y=node.y,
        environment_id=node.environment_id
    )

    db.add(new_node)
    db.commit()
    db.refresh(new_node)

    return {"node": new_node}



# LISTAR
# ?environment_id=3 traz só as fotos daquele ambiente; sem ele, traz todas
@router.get("/")
def list_nodes(
    environment_id: int | None = Query(default=None),
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Node)

    if environment_id is not None:
        query = query.filter(models.Node.environment_id == environment_id)

    return query.all()


# GET POR ID
@router.get("/{node_id}")
def get_node(node_id: int, db: Session = Depends(database.get_db)):
    node = db.query(models.Node).filter(models.Node.id == node_id).first()
    
    if not node:
        raise HTTPException(status_code=404, detail="Nó não encontrado.")
    
    return node



# UPDATE

class NodeUpdate(BaseModel):
    name: str | None = None
    image: str | None = None
    x: float | None = None
    y: float | None = None


@router.put("/{node_id}")
def update_node(node_id: int, data: NodeUpdate, db: Session = Depends(database.get_db)):
    node = db.query(models.Node).filter(models.Node.id == node_id).first()
    
    if not node:
        raise HTTPException(status_code=404, detail="Nó não encontrado.")

    if data.name is not None:
        node.name = data.name
    if data.image is not None:
        node.image = data.image
    if data.x is not None:
        node.x = data.x
    if data.y is not None:
        node.y = data.y

    db.commit()
    db.refresh(node)

    return {"node": node}



# DELETE

@router.delete("/{node_id}")
def delete_node(node_id: int, db: Session = Depends(database.get_db)):
    node = db.query(models.Node).filter(models.Node.id == node_id).first()
    
    if not node:
        raise HTTPException(status_code=404, detail="Nó não encontrado.")

    # tira antes as conexões e ligações de intersecção dessa foto
    # (senão o banco recusa, por causa das ForeignKey)
    from app.routers.intersections import cleanup_node_references
    cleanup_node_references(db, [node.id])

    db.delete(node)
    db.commit()

    return {"message": "Nó deletado com sucesso!"}


# UPLOAD DE IMAGEM
@router.post("/upload")
def upload_image(file: UploadFile = File(...)):

    upload_dir = "app/images"
    thumb_dir = os.path.join(upload_dir, "thumbs")

    if not os.path.exists(upload_dir):
        os.makedirs(upload_dir)

    if not os.path.exists(thumb_dir):
        os.makedirs(thumb_dir)

    file_path = os.path.join(upload_dir, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    generate_thumbnail(file_path, os.path.join(thumb_dir, file.filename))

    return {"filename": file.filename}