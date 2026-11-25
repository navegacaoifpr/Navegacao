from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
import os
import shutil
import time

from app import models, database, storage
from app.security import verify_password
from app.supabase_auth import require_user
from app.routers.folders import safe_filename, unique_filename, generate_thumbnail
from app.routers.environments import (
    serialize_project_environments,
    ensure_project_map,
    check_image_upload,
    delete_environment_cascade,
)

router = APIRouter(prefix="/projects", tags=["Projects"])

# o login agora é feito no Supabase. Cada projeto tem um DONO (owner_id =
# id do usuário no Supabase) e só o dono edita o projeto.

# proteção na reivindicação de projetos antigos (5 erros em 10 minutos)
MAX_FAILURES = 5
FAILURE_WINDOW = 10 * 60
_failures: dict[tuple[int, str], list[float]] = {}


# MODELOS

class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ClaimData(BaseModel):
    username: str
    password: str


# FUNÇÕES AUXILIARES

def public_project(p: models.Project):
    # nunca devolve dono, e-mail nem senha
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "cover_image": p.cover_image,
    }


def optional_user(authorization: str | None):
    """Quem está logado, ou None (sem token, ou token inválido). Usada onde o
    login é opcional, só para marcar 'projeto seu' na lista."""
    if not authorization:
        return None

    try:
        return require_user(authorization)
    except HTTPException:
        return None


def get_project_or_404(db: Session, project_id: int) -> models.Project:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    return project


def require_project_owner(user: dict, project: models.Project):
    if not project.owner_id:
        raise HTTPException(status_code=409, detail="Este projeto ainda não tem dono.")

    if project.owner_id != user["id"]:
        raise HTTPException(status_code=403, detail="Esta conta não é a dona deste projeto.")


def require_project_token(authorization: str | None, project_id: int):
    """Confere se quem mandou o token (Authorization: Bearer <token>) é o
    dono do projeto. Pode ser usada por outras rotas que queiram proteção."""
    user = require_user(authorization)
    db = database.SessionLocal()

    try:
        require_project_owner(user, get_project_or_404(db, project_id))
    finally:
        db.close()


# LISTAR PROJETOS (tela "projetos" do admin). Todos aparecem para todos; quem
# está logado recebe também a marca "is_mine" nos projetos da própria conta.
@router.get("/")
def list_projects(
    authorization: str | None = Header(default=None),
    db: Session = Depends(database.get_db),
):
    me = optional_user(authorization)
    result = []

    for p in db.query(models.Project).order_by(models.Project.id).all():
        item = public_project(p)
        item["is_mine"] = bool(me and p.owner_id and p.owner_id == me["id"])
        result.append(item)

    return result


# PROJETOS DA CONTA LOGADA (página "Minha conta")
@router.get("/mine")
def my_projects(
    authorization: str | None = Header(default=None),
    db: Session = Depends(database.get_db),
):
    user = require_user(authorization)

    projects = db.query(models.Project).filter(
        models.Project.owner_id == user["id"]
    ).order_by(models.Project.id).all()

    return [dict(public_project(p), is_mine=True) for p in projects]


# CADASTRAR PROJETO (card "+"): precisa estar logado; quem cria vira o dono
@router.post("/")
def create_project(
    data: ProjectCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(database.get_db),
):
    user = require_user(authorization)

    name = data.name.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Preencha o nome do projeto.")

    if db.query(models.Project).filter(models.Project.name == name).first():
        raise HTTPException(status_code=400, detail="Já existe um projeto com esse nome.")

    email = user.get("email") or ""

    project = models.Project(
        name=name,
        description=data.description,
        owner_id=user["id"],
        email=email,
        # colunas antigas (login por projeto): não são mais usadas
        username=email or "supabase",
        password_hash="supabase",
    )

    db.add(project)
    db.commit()
    db.refresh(project)

    # todo projeto nasce com o seu mapa de ligações
    ensure_project_map(db, project.id)

    return {"project": public_project(project)}


# BUSCAR UM PROJETO
@router.get("/{project_id}")
def get_project(project_id: int, db: Session = Depends(database.get_db)):
    return public_project(get_project_or_404(db, project_id))


# EDITAR PROJETO (nome e descrição; só o dono)
@router.put("/{project_id}")
def update_project(
    project_id: int,
    data: ProjectUpdate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(database.get_db),
):
    user = require_user(authorization)
    project = get_project_or_404(db, project_id)
    require_project_owner(user, project)

    if data.name is not None:
        name = data.name.strip()

        if not name:
            raise HTTPException(status_code=400, detail="Preencha o nome do projeto.")

        clash = db.query(models.Project).filter(
            models.Project.name == name,
            models.Project.id != project.id,
        ).first()

        if clash:
            raise HTTPException(status_code=400, detail="Já existe um projeto com esse nome.")

        project.name = name

    if data.description is not None:
        project.description = data.description.strip() or None

    db.commit()

    return {"project": public_project(project)}


# EXCLUIR PROJETO (só o dono): apaga junto todos os ambientes, fotos e ligações
@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    authorization: str | None = Header(default=None),
    db: Session = Depends(database.get_db),
):
    user = require_user(authorization)
    project = get_project_or_404(db, project_id)
    require_project_owner(user, project)

    for env in db.query(models.Environment).filter(models.Environment.project_id == project.id).all():
        delete_environment_cascade(db, env)

    db.flush()
    db.delete(project)
    db.commit()

    return {"message": "Projeto excluído com sucesso!"}


# "ESTA CONTA PODE ENTRAR NESSE PROJETO?" (usado pela tela de login do projeto)
@router.get("/{project_id}/access")
def project_access(
    project_id: int,
    authorization: str | None = Header(default=None),
    db: Session = Depends(database.get_db),
):
    user = require_user(authorization)
    project = get_project_or_404(db, project_id)
    require_project_owner(user, project)

    return {"success": True, "project": public_project(project)}


# REIVINDICAR UM PROJETO ANTIGO (criado antes do Supabase, sem dono):
# prova que é o responsável usando o usuário e a senha antigos do projeto,
# uma vez só. Depois disso o login é pela conta.
@router.post("/{project_id}/claim")
def claim_project(
    project_id: int,
    data: ClaimData,
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(database.get_db),
):
    user = require_user(authorization)
    project = get_project_or_404(db, project_id)

    if project.owner_id:
        raise HTTPException(status_code=400, detail="Este projeto já tem dono.")

    key = (project_id, request.client.host if request.client else "?")
    now = time.time()
    recent = [t for t in _failures.get(key, []) if now - t < FAILURE_WINDOW]
    _failures[key] = recent

    if len(recent) >= MAX_FAILURES:
        raise HTTPException(status_code=429, detail="Muitas tentativas erradas. Espere alguns minutos.")

    if data.username.strip() != project.username or not verify_password(data.password, project.password_hash):
        _failures[key].append(now)
        raise HTTPException(status_code=401, detail="Usuário ou senha antigos incorretos.")

    project.owner_id = user["id"]
    project.email = user.get("email") or project.email
    project.password_hash = "supabase"
    db.commit()
    _failures.pop(key, None)

    return {"success": True, "project": public_project(project)}


# MAPA DE LIGAÇÕES DO PROJETO (cria se ainda não existir)
@router.get("/{project_id}/map")
def get_project_map(project_id: int, db: Session = Depends(database.get_db)):
    get_project_or_404(db, project_id)
    env = ensure_project_map(db, project_id)
    return {"id": env.id, "name": env.name}


# AMBIENTES DO PROJETO (cards do admin e do visitante)
@router.get("/{project_id}/environments")
def list_project_environments(project_id: int, db: Session = Depends(database.get_db)):
    get_project_or_404(db, project_id)
    return serialize_project_environments(db, project_id)


# ENVIAR FOTO DE CAPA DO PROJETO (só o dono do projeto)
@router.post("/{project_id}/cover")
def upload_project_cover(
    project_id: int,
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
    db: Session = Depends(database.get_db),
):
    user = require_user(authorization)
    project = get_project_or_404(db, project_id)
    require_project_owner(user, project)
    check_image_upload(file)

    try:
        filename = storage.save_image(file)
    except Exception as erro:
        raise HTTPException(status_code=500, detail=f"Não foi possível salvar a capa: {erro}")

    project.cover_image = filename
    db.commit()

    return public_project(project)
