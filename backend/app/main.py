from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from app import models, database
from app.seed import adicionar_colunas_faltantes, migrar_dados_antigos, unificar_mapas_de_ligacao
from app.routers import nodes, edges, folders, projects, environments, intersections

# pasta onde este arquivo está (backend/app) — funciona no PC e na Vercel
BASE_DIR = Path(__file__).resolve().parent

# cria as tabelas que não existem, adiciona colunas novas nas que já
# existem e, na primeira vez, passa os dados antigos pro projeto IFPR
models.Base.metadata.create_all(bind=database.engine)
adicionar_colunas_faltantes()
migrar_dados_antigos()
unificar_mapas_de_ligacao()

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

# ✅ monta pastas estáticas (caminho absoluto)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static", html=True), name="static")
app.mount("/images", StaticFiles(directory=BASE_DIR / "images"), name="images")


# ✅ endereço principal ("/") leva para a tela inicial
@app.get("/", include_in_schema=False)
def inicio():
    return RedirectResponse("/static/")


# ✅ inclui as rotas
# (o antigo /auth/login saiu: o login agora é feito no Supabase)
app.include_router(nodes.router)
app.include_router(edges.router)
app.include_router(folders.router)
app.include_router(projects.router)
app.include_router(environments.router)
app.include_router(intersections.router)
