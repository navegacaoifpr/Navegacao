from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app import models, database
from app.routers import nodes, edges

# cria as tabelas se não existirem
models.Base.metadata.create_all(bind=database.engine)

# instancia única do FastAPI
app = FastAPI(title="Navegação IFPR")

# ✅ adiciona CORS para permitir o front acessar a API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # em produção, substitua pelo domínio correto
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ monta pastas estáticas
app.mount("/static", StaticFiles(directory="app/static", html=True), name="static")
app.mount("/images", StaticFiles(directory="app/images"), name="images")

# ✅ inclui as rotas
app.include_router(nodes.router)
app.include_router(edges.router)
