from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app import models, database
from app.security import verify_password, create_token

router = APIRouter(prefix="/auth", tags=["Auth"])

# Login antigo (o login.html atual ainda usa essa rota). Agora ele confere
# contra os projetos do banco, com a senha guardada em hash. O login novo,
# por projeto, é POST /projects/{id}/login.


class LoginData(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(data: LoginData, db: Session = Depends(database.get_db)):
    projects = db.query(models.Project).filter(models.Project.username == data.username.strip()).all()

    for project in projects:
        if verify_password(data.password, project.password_hash):
            return {"success": True, "project_id": project.id, "token": create_token(project.id)}

    raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")
