"""
Copia TODOS os dados do banco local (navegacao.db, SQLite)
para o banco online do Supabase (PostgreSQL).

Como usar (na pasta backend, com o .venv ativado):
    $env:DATABASE_URL="postgresql://...supabase...:6543/postgres"
    python copiar_dados.py

ATENÇÃO: os dados que já estão no Supabase são APAGADOS e substituídos
pelos dados do navegacao.db. O arquivo navegacao.db não é alterado.
"""
import os
import sys

from sqlalchemy import create_engine, select, text
from sqlalchemy.pool import NullPool

DESTINO = os.environ.get("DATABASE_URL", "")
if not DESTINO.startswith(("postgresql://", "postgres://")):
    sys.exit("Defina antes a variável DATABASE_URL com o endereço do Supabase.")
if DESTINO.startswith("postgres://"):
    DESTINO = DESTINO.replace("postgres://", "postgresql://", 1)

# importa os modelos só para ler a estrutura das tabelas
from app import models  # noqa: E402

origem = create_engine("sqlite:///./navegacao.db")
destino = create_engine(DESTINO, poolclass=NullPool)

tabelas = models.Base.metadata.sorted_tables  # pais antes dos filhos

# garante que todas as tabelas existem no Supabase
models.Base.metadata.create_all(bind=destino)

with origem.connect() as src, destino.begin() as dst:
    # 1) limpa o Supabase (filhos antes dos pais)
    for tabela in reversed(tabelas):
        dst.execute(tabela.delete())
        print(f"limpou    {tabela.name}")

    # 2) copia os dados (pais antes dos filhos)
    for tabela in tabelas:
        consulta = select(tabela)
        pk = list(tabela.primary_key.columns)
        if pk:
            consulta = consulta.order_by(*pk)
        linhas = [dict(r._mapping) for r in src.execute(consulta)]
        if linhas:
            dst.execute(tabela.insert(), linhas)
        print(f"copiou    {tabela.name}: {len(linhas)} linha(s)")

    # 3) acerta os contadores de id, senão o próximo cadastro dá erro
    for tabela in tabelas:
        for col in tabela.primary_key.columns:
            try:
                e_inteiro = col.type.python_type is int
            except NotImplementedError:
                e_inteiro = False
            if col.autoincrement is not False and e_inteiro:
                dst.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('\"{tabela.name}\"', '{col.name}'), "
                    f"COALESCE((SELECT MAX(\"{col.name}\") FROM \"{tabela.name}\"), 1), "
                    f"(SELECT MAX(\"{col.name}\") FROM \"{tabela.name}\") IS NOT NULL)"
                ))

print("\nPronto! Os dados do navegacao.db estão no Supabase.")
