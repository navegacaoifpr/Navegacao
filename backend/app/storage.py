"""
Onde as imagens ficam guardadas.

- Com a variável SUPABASE_SERVICE_ROLE_KEY definida (Vercel): as imagens vão
  para o Storage do Supabase, no bucket "images" (público).
- Sem ela (no seu PC): tudo continua como antes, na pasta app/images.

As miniaturas (thumbs) ficam em "thumbs/<nome>" nos dois casos.
"""
import io
import json
import os
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageOps

from app.config import SUPABASE_URL

BUCKET = "images"
THUMB_SIZE = 320

SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
REMOTE = bool(SERVICE_KEY)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(BASE_DIR, "images")
THUMBS_DIR = os.path.join(IMAGES_DIR, "thumbs")


# ---------------------------------------------------------------- nomes

def clean_filename(original: str) -> str:
    """Nome seguro: sem pasta, sem acento, só letras, números, ponto, - e _."""
    name = os.path.basename((original or "").replace("\\", "/"))
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    if not name or "." not in name:
        name = (name or "imagem") + ".jpg"
    return name


def _candidates(filename: str):
    base, ext = os.path.splitext(filename)
    yield filename
    counter = 1
    while True:
        yield f"{base}_{counter}{ext}"
        counter += 1


def public_url(path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{urllib.parse.quote(path)}"


# ---------------------------------------------------------------- miniatura

def make_thumbnail(data: bytes) -> bytes | None:
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((THUMB_SIZE, THUMB_SIZE))
            out = io.BytesIO()
            img.save(out, "JPEG", quality=82)
            return out.getvalue()
    except Exception:
        return None


# ---------------------------------------------------------------- Supabase

def _headers(extra=None):
    headers = {
        "Authorization": f"Bearer {SERVICE_KEY}",
        "apikey": SERVICE_KEY,
    }
    headers.update(extra or {})
    return headers


def _remote_upload(path: str, data: bytes, content_type: str, upsert: bool) -> bool:
    """Envia o arquivo. Devolve False se já existe um com esse nome."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}"
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers=_headers({
            "Content-Type": content_type or "application/octet-stream",
            "x-upsert": "true" if upsert else "false",
            "cache-control": "max-age=31536000",
        }),
    )
    try:
        with urllib.request.urlopen(req, timeout=60):
            return True
    except urllib.error.HTTPError as erro:
        body = erro.read().decode("utf-8", "ignore")
        if erro.code in (400, 409) and ("Duplicate" in body or "already exists" in body):
            return False
        raise RuntimeError(f"Supabase Storage recusou o envio ({erro.code}): {body}")


def _remote_delete(paths: list[str]):
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}"
    req = urllib.request.Request(
        url,
        data=json.dumps({"prefixes": paths}).encode(),
        method="DELETE",
        headers=_headers({"Content-Type": "application/json"}),
    )
    try:
        with urllib.request.urlopen(req, timeout=30):
            pass
    except Exception:
        pass


# ---------------------------------------------------------------- uso geral

def save_image(upload_file) -> str:
    """Guarda a imagem enviada (UploadFile do FastAPI) e a miniatura dela.
    Devolve o nome final do arquivo (é isso que vai para o banco)."""
    upload_file.file.seek(0)
    data = upload_file.file.read()
    content_type = upload_file.content_type or "image/jpeg"
    wanted = clean_filename(upload_file.filename)
    thumb = make_thumbnail(data)

    if REMOTE:
        for name in _candidates(wanted):
            if _remote_upload(name, data, content_type, upsert=False):
                if thumb:
                    _remote_upload(f"thumbs/{name}", thumb, "image/jpeg", upsert=True)
                return name

    os.makedirs(THUMBS_DIR, exist_ok=True)

    for name in _candidates(wanted):
        if not os.path.exists(os.path.join(IMAGES_DIR, name)):
            break

    with open(os.path.join(IMAGES_DIR, name), "wb") as f:
        f.write(data)

    if thumb:
        with open(os.path.join(THUMBS_DIR, name), "wb") as f:
            f.write(thumb)

    return name


def delete_image(filename: str):
    """Apaga a imagem e a miniatura (onde quer que estejam)."""
    if not filename:
        return

    if REMOTE:
        _remote_delete([filename, f"thumbs/{filename}"])

    for path in (os.path.join(IMAGES_DIR, filename), os.path.join(THUMBS_DIR, filename)):
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass  # na Vercel a pasta é só leitura
