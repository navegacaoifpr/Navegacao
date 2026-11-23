from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Antes: MySQL via XAMPP.
# Agora: SQLite — um arquivo só (navegacao.db), sem servidor de banco rodando.
SQLALCHEMY_DATABASE_URL = "sqlite:///./navegacao.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # necessário pro SQLite funcionar direito com o FastAPI, que pode
    # acessar o banco a partir de threads diferentes por request
    connect_args={"check_same_thread": False}
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


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()