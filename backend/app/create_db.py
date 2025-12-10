from app.database import Base, engine, SessionLocal
from app.models import Node, Edge

print("🔧 Criando tabelas no banco MySQL 'navegacao' ...")
Base.metadata.create_all(bind=engine)

# Inserindo alguns dados de teste
print("📥 Inserindo dados de teste ...")
db = SessionLocal()

node1 = Node(name="entrada1", image="1.jpg", x=0, y=0)
node2 = Node(name="entrada2", image="2.jpg", x=1, y=0)
node3 = Node(name="entrada3", image="3.jpg", x=2, y=0)
node1 = Node(name="entrada1", image="1.jpg", x=0, y=0)
node2 = Node(name="entrada2", image="2.jpg", x=1, y=0)
node3 = Node(name="entrada3", image="3.jpg", x=2, y=0)

db.add_all([node1, node2, node3])
db.commit()

edge1 = Edge(source_id=node1.id, target_id=node2.id)
edge2 = Edge(source_id=node2.id, target_id=node3.id)

db.add_all([edge1, edge2])
db.commit()

db.close()
print("✅ Banco e tabelas criadas com sucesso!")
