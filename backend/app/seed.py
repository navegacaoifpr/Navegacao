from sqlalchemy import inspect, text

from app import models, database
from app.security import hash_password

# login do projeto IFPR criado na primeira vez (o mesmo que já existia
# no auth.py antigo). Dá pra trocar depois pela rota de editar projeto.
IFPR_USERNAME = "admin"
IFPR_PASSWORD = "ifpr2026"


def adicionar_colunas_faltantes():
    # o create_all não adiciona colunas novas em tabelas que já existem;
    # aqui conferimos cada tabela e criamos as colunas que estiverem faltando
    inspetor = inspect(database.engine)

    with database.engine.begin() as conn:
        for tabela in models.Base.metadata.sorted_tables:
            if not inspetor.has_table(tabela.name):
                continue

            existentes = {c["name"] for c in inspetor.get_columns(tabela.name)}

            for coluna in tabela.columns:
                if coluna.name not in existentes:
                    tipo = coluna.type.compile(dialect=database.engine.dialect)
                    conn.execute(text(
                        f'ALTER TABLE "{tabela.name}" ADD COLUMN "{coluna.name}" {tipo}'
                    ))
                    print(f"[banco] coluna adicionada: {tabela.name}.{coluna.name}")


def migrar_dados_antigos():
    """Na primeira vez: cria o projeto IFPR e coloca tudo que já existia
    (pastas e fotos sem ambiente) num primeiro ambiente."""
    db = database.SessionLocal()

    try:
        projeto = db.query(models.Project).filter(models.Project.name == "IFPR").first()

        if not projeto and db.query(models.Project).count() == 0:
            projeto = models.Project(
                name="IFPR",
                description="Instituto Federal do Paraná - Campus Jacarezinho",
                username=IFPR_USERNAME,
                password_hash=hash_password(IFPR_PASSWORD),
            )
            db.add(projeto)
            db.commit()
            db.refresh(projeto)
            print("[banco] projeto IFPR criado")

        if not projeto:
            return

        pastas_soltas = db.query(models.Folder).filter(models.Folder.environment_id.is_(None)).all()
        fotos_soltas = db.query(models.Node).filter(models.Node.environment_id.is_(None)).all()

        if not pastas_soltas and not fotos_soltas:
            return

        ambiente = db.query(models.Environment).filter(
            models.Environment.project_id == projeto.id,
            models.Environment.name == "Ambiente inicial",
        ).first()

        if not ambiente:
            ambiente = models.Environment(
                project_id=projeto.id,
                name="Ambiente inicial",
                kind=models.KIND_COMUM,
                position=db.query(models.Environment).filter(
                    models.Environment.project_id == projeto.id
                ).count(),
            )
            db.add(ambiente)
            db.commit()
            db.refresh(ambiente)

        for pasta in pastas_soltas:
            pasta.environment_id = ambiente.id

        for foto in fotos_soltas:
            foto.environment_id = ambiente.id

        db.commit()
        print(
            f"[banco] {len(pastas_soltas)} pasta(s) e {len(fotos_soltas)} foto(s) "
            f"movidas para '{ambiente.name}'"
        )
    finally:
        db.close()


def unificar_mapas_de_ligacao():
    """Cada projeto tem UM mapa de ligação (tipo "mapa").

    Antes, o mapa era guardado como um ambiente de intersecção sem fotos.
    Agora a intersecção é um ambiente com fotos (o caminho entre dois
    ambientes) e o mapa tem um tipo próprio. Aqui:
    - intersecções SEM fotos que têm cards ou ligações eram mapas antigos:
      a primeira vira o mapa e as outras são juntadas nele;
    - intersecções com fotos (ou vazias e sem ligações) continuam sendo
      intersecções normais."""
    from app.routers.environments import ensure_project_map, MAP_NAME

    db = database.SessionLocal()

    def tem_fotos(env_id):
        return bool(
            db.query(models.Node).filter(models.Node.environment_id == env_id).first()
            or db.query(models.Folder).filter(models.Folder.environment_id == env_id).first()
        )

    def tem_mapa(env_id):
        return bool(
            db.query(models.IntersectionMember).filter(models.IntersectionMember.intersection_id == env_id).first()
            or db.query(models.IntersectionLink).filter(models.IntersectionLink.intersection_id == env_id).first()
        )

    def juntar(origem, destino):
        for membro in db.query(models.IntersectionMember).filter(
            models.IntersectionMember.intersection_id == origem.id
        ).all():
            ja_tem = db.query(models.IntersectionMember).filter(
                models.IntersectionMember.intersection_id == destino.id,
                models.IntersectionMember.environment_id == membro.environment_id,
            ).first()

            if ja_tem:
                db.delete(membro)
            else:
                membro.intersection_id = destino.id

        for ligacao in db.query(models.IntersectionLink).filter(
            models.IntersectionLink.intersection_id == origem.id
        ).all():
            repetida = db.query(models.IntersectionLink).filter(
                models.IntersectionLink.intersection_id == destino.id,
                models.IntersectionLink.source_node_id == ligacao.source_node_id,
                models.IntersectionLink.target_node_id == ligacao.target_node_id,
            ).first()

            if repetida:
                db.delete(ligacao)
            else:
                ligacao.intersection_id = destino.id

    try:
        for project in db.query(models.Project).all():
            mapa = db.query(models.Environment).filter(
                models.Environment.project_id == project.id,
                models.Environment.kind == models.KIND_MAPA,
            ).order_by(models.Environment.id).first()

            # mapas antigos: intersecções sem fotos, mas com cards ou ligações
            antigos = [
                e for e in db.query(models.Environment).filter(
                    models.Environment.project_id == project.id,
                    models.Environment.kind == models.KIND_INTERSECAO,
                ).order_by(models.Environment.id).all()
                if not tem_fotos(e.id) and tem_mapa(e.id)
            ]

            if not mapa and antigos:
                mapa = antigos.pop(0)
                mapa.kind = models.KIND_MAPA
                print(f"[banco] '{mapa.name}' agora é o mapa de ligação de {project.name}")

            # intersecção vazia criada com o nome do mapa (versões anteriores)
            # vira o mapa, em vez de ficar duplicada ao lado dele
            if not mapa:
                pelo_nome = db.query(models.Environment).filter(
                    models.Environment.project_id == project.id,
                    models.Environment.kind == models.KIND_INTERSECAO,
                    models.Environment.name.in_(["Mapa de ligação", "Mapa de ligações"]),
                ).first()

                if pelo_nome and not tem_fotos(pelo_nome.id):
                    mapa = pelo_nome
                    mapa.kind = models.KIND_MAPA
                    print(f"[banco] '{mapa.name}' agora é o mapa de ligação de {project.name}")

            if not mapa:
                db.commit()
                ensure_project_map(db, project.id)
                print(f"[banco] mapa de ligação criado para {project.name}")
                continue

            for antigo in antigos:
                juntar(antigo, mapa)
                db.delete(antigo)
                print(f"[banco] '{antigo.name}' juntado ao mapa de ligação")

            # cards/ligações que ainda apontem pra uma intersecção com fotos
            # (versão anterior) também vão pro mapa
            for env in db.query(models.Environment).filter(
                models.Environment.project_id == project.id,
                models.Environment.kind == models.KIND_INTERSECAO,
            ).all():
                if tem_mapa(env.id):
                    juntar(env, mapa)

            if mapa.name != MAP_NAME and not db.query(models.Environment).filter(
                models.Environment.project_id == project.id,
                models.Environment.name == MAP_NAME,
                models.Environment.id != mapa.id,
            ).first():
                mapa.name = MAP_NAME

            db.commit()
    finally:
        db.close()
