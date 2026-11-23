"""
Roda esse script uma vez só, direto na pasta backend/, pra gerar as miniaturas
das imagens que já foram enviadas antes da gente implementar o sistema de thumbnails.

Uso:
    cd backend
    python generate_thumbnails.py
"""

import os
from PIL import Image

IMAGES_DIR = "app/images"
THUMBS_DIR = os.path.join(IMAGES_DIR, "thumbs")
THUMB_SIZE = 320


def main():
    if not os.path.exists(IMAGES_DIR):
        print(f"Pasta {IMAGES_DIR} não encontrada. Roda esse script de dentro de backend/.")
        return

    os.makedirs(THUMBS_DIR, exist_ok=True)

    files = [
        f for f in os.listdir(IMAGES_DIR)
        if os.path.isfile(os.path.join(IMAGES_DIR, f))
    ]

    if not files:
        print("Nenhuma imagem encontrada em", IMAGES_DIR)
        return

    print(f"Gerando miniaturas de {len(files)} imagem(ns)...")

    ok = 0
    falhou = 0

    for filename in files:
        source_path = os.path.join(IMAGES_DIR, filename)
        thumb_path = os.path.join(THUMBS_DIR, filename)

        try:
            with Image.open(source_path) as img:
                img = img.convert("RGB")
                img.thumbnail((THUMB_SIZE, THUMB_SIZE))
                img.save(thumb_path, "JPEG", quality=82)
            ok += 1
        except Exception as e:
            print(f"  falhou: {filename} ({e})")
            falhou += 1

    print(f"Pronto! {ok} miniatura(s) geradas, {falhou} falha(s).")


if __name__ == "__main__":
    main()
