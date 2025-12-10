from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Node(Base):
    __tablename__ = "nodes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50))
    image = Column(String(255))
    x = Column(Integer)
    y = Column(Integer)

    edges_from = relationship("Edge", back_populates="source", foreign_keys="Edge.source_id")
    edges_to = relationship("Edge", back_populates="target", foreign_keys="Edge.target_id")


class Edge(Base):
    __tablename__ = "edges"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("nodes.id"))
    target_id = Column(Integer, ForeignKey("nodes.id"))
    direction = Column(String(10))  # 👈 ADICIONA ESTA LINHA

    source = relationship("Node", foreign_keys=[source_id], back_populates="edges_from")
    target = relationship("Node", foreign_keys=[target_id], back_populates="edges_to")
