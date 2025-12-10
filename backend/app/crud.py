from . import models
from sqlalchemy.orm import Session

def get_all_nodes(db: Session):
    return db.query(models.Node).all()

def get_edges(db: Session, node_id: int):
    return db.query(models.Edge).filter(models.Edge.from_node_id == node_id).all()
