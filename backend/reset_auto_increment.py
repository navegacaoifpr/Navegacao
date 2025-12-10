##from app.database import engine

with engine.connect() as conn:
    conn.execute("ALTER TABLE nodes AUTO_INCREMENT = 1;")
    conn.execute("ALTER TABLE edges AUTO_INCREMENT = 1;")
    conn.commit()

print("AUTO_INCREMENT resetado com sucesso!")
