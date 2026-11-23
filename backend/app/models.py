from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


# tipos de ambiente
KIND_COMUM = "comum"  # lugar com fotos que vira card pro visitante (B1, Biblioteca...)
KIND_INTERSECAO = "intersecao"  # caminho com fotos entre dois ambientes; não vira card de partida
KIND_MAPA = "mapa"  # o mapa de ligação do projeto (um só); não tem fotos

# tipos que têm fotos e são editados no editor de fotos
PHOTO_KINDS = (KIND_COMUM, KIND_INTERSECAO)


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(80), nullable=False, unique=True)
    description = Column(String(255), nullable=True)
    cover_image = Column(String(255), nullable=True)

    username = Column(String(80), nullable=False)
    # e-mail da conta dona do projeto (só para mostrar)
    email = Column(String(120), nullable=True)
    # id do usuário dono no Supabase. Só o dono edita o projeto.
    owner_id = Column(String(64), nullable=True)
    # nunca a senha em texto puro: "salt$hash" (ver app/security.py)
    password_hash = Column(String(255), nullable=False)

    environments = relationship("Environment", back_populates="project")


class Environment(Base):
    __tablename__ = "environments"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String(80), nullable=False)
    kind = Column(String(20), nullable=False, default=KIND_COMUM)
    description = Column(String(255), nullable=True)
    cover_image = Column(String(255), nullable=True)
    position = Column(Integer, default=0)

    # foto onde o visitante começa ao escolher esse ambiente. Sem
    # ForeignKey de propósito: Node também aponta pra Environment, e a
    # referência circular complica criar/apagar no SQLite.
    start_node_id = Column(Integer, nullable=True)

    project = relationship("Project", back_populates="environments")
    folders = relationship("Folder", back_populates="environment")
    nodes = relationship("Node", back_populates="environment")


class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(80), nullable=False)
    color = Column(String(20), nullable=True)
    position = Column(Integer, default=0)
    environment_id = Column(Integer, ForeignKey("environments.id"), nullable=True)

    nodes = relationship("Node", back_populates="folder")
    environment = relationship("Environment", back_populates="folders")


class Node(Base):
    __tablename__ = "nodes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50))
    image = Column(String(255))
    x = Column(Integer, nullable=True)
    y = Column(Integer, nullable=True)
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    environment_id = Column(Integer, ForeignKey("environments.id"), nullable=True)

    # ordem manual dentro do "corredor" da pasta (usada por "Encadear
    # pasta"). Se ficar None, a ordem cai pro nome do arquivo.
    chain_order = Column(Integer, nullable=True)

    folder = relationship("Folder", back_populates="nodes")
    environment = relationship("Environment", back_populates="nodes")
    edges_from = relationship("Edge", back_populates="source", foreign_keys="Edge.source_id")
    edges_to = relationship("Edge", back_populates="target", foreign_keys="Edge.target_id")


class Edge(Base):
    __tablename__ = "edges"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("nodes.id"))
    target_id = Column(Integer, ForeignKey("nodes.id"))
    direction = Column(String(10))

    source = relationship("Node", foreign_keys=[source_id], back_populates="edges_from")
    target = relationship("Node", foreign_keys=[target_id], back_populates="edges_to")


class IntersectionMember(Base):
    """Um ambiente colocado como card dentro do mapa de uma intersecção."""
    __tablename__ = "intersection_members"

    id = Column(Integer, primary_key=True, index=True)
    intersection_id = Column(Integer, ForeignKey("environments.id"), nullable=False)
    environment_id = Column(Integer, ForeignKey("environments.id"), nullable=False)
    x = Column(Integer, nullable=True)
    y = Column(Integer, nullable=True)


class IntersectionLink(Base):
    """Ligação entre dois ambientes dentro de uma intersecção. Guarda de qual
    foto sai e em qual entra, e as duas conexões (ida e volta) que ela criou
    entre as fotos — é por elas que o visitante atravessa de um ambiente pro outro."""
    __tablename__ = "intersection_links"

    id = Column(Integer, primary_key=True, index=True)
    intersection_id = Column(Integer, ForeignKey("environments.id"), nullable=False)
    source_node_id = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    target_node_id = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    direction = Column(String(10), nullable=False)

    # conexões criadas por esta ligação (None se já existiam antes)
    edge_id = Column(Integer, nullable=True)
    reverse_edge_id = Column(Integer, nullable=True)
