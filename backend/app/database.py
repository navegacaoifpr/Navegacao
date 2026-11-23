import os

from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

# No PC (sem DATABASE_URL): SQLite, um arquivo só (navegacao.db).
# Na Vercel (com DATABASE_URL): PostgreSQL do Supabase.
SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./navegacao.db")

# o SQLAlchemy só aceita "postgresql://"
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        # necessário pro SQLite funcionar direito com o FastAPI, que pode
        # acessar o banco a partir de threads diferentes por request
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        # WAL: permite leitura simultânea a uma escrita, sem travar o banco inteiro
        cursor.execute("PRAGMA journal_mode=WAL")
        # garante que as ForeignKey (folder_id, source_id, target_id) sejam
        # realmente respeitadas — no SQLite isso vem desligado por padrão
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    # Na Vercel o app liga e desliga a todo momento, então não guardamos
    # conexões abertas (NullPool); o pooler do Supabase cuida disso.
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        poolclass=NullPool,
        pool_pre_ping=True,
    )


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
