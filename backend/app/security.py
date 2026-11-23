import base64
import hashlib
import hmac
import json
import os
import secrets
import time

# senha: PBKDF2 (vem com o Python, não precisa instalar nada)
PBKDF2_ITERATIONS = 200_000

# chave usada pra assinar os tokens de login. Se não existir a variável
# de ambiente NAVEGACAO_SECRET, é gerada uma e guardada em app/.secret
# (assim os logins continuam valendo depois de reiniciar o servidor)
SECRET_FILE = os.path.join(os.path.dirname(__file__), ".secret")
TOKEN_MAX_AGE = 60 * 60 * 12   # login: 12 horas
RESET_MAX_AGE = 60 * 30        # link de redefinição de senha: 30 minutos


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest_hex = stored.split("$", 1)
    except (ValueError, AttributeError):
        return False

    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS)
    return hmac.compare_digest(digest.hex(), digest_hex)


def _secret() -> bytes:
    env = os.environ.get("NAVEGACAO_SECRET")
    if env:
        return env.encode()

    if not os.path.exists(SECRET_FILE):
        with open(SECRET_FILE, "w") as f:
            f.write(secrets.token_hex(32))

    with open(SECRET_FILE) as f:
        return f.read().strip().encode()


def _sign(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    signature = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def _unsign(token: str) -> dict | None:
    """Devolve o conteúdo do token se a assinatura bate e não expirou."""
    try:
        body, signature = token.split(".", 1)
        expected = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(signature, expected):
            return None

        payload = json.loads(base64.urlsafe_b64decode(body.encode()))

        if payload["exp"] < time.time():
            return None

        return payload
    except Exception:
        return None


# TOKEN DE LOGIN

def create_token(project_id: int) -> str:
    return _sign({"project_id": project_id, "exp": int(time.time()) + TOKEN_MAX_AGE})


def read_token(token: str) -> int | None:
    """Devolve o project_id do token, ou None se for inválido/expirado.
    Token de redefinição de senha NÃO vale como login."""
    payload = _unsign(token)

    if not payload or payload.get("kind") == "reset":
        return None

    try:
        return int(payload["project_id"])
    except Exception:
        return None


# TOKEN DE REDEFINIÇÃO DE SENHA
# Guarda uma "impressão digital" do hash da senha atual. Quando a senha
# muda, a impressão muda e o link antigo deixa de funcionar (uso único).

def _fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_reset_token(project_id: int, password_hash: str) -> str:
    return _sign({
        "project_id": project_id,
        "kind": "reset",
        "fp": _fingerprint(password_hash),
        "exp": int(time.time()) + RESET_MAX_AGE,
    })


def read_reset_token(token: str) -> tuple[int, str] | None:
    """Devolve (project_id, impressão) de um link de redefinição válido."""
    payload = _unsign(token)

    if not payload or payload.get("kind") != "reset":
        return None

    try:
        return int(payload["project_id"]), str(payload["fp"])
    except Exception:
        return None


def reset_token_matches(fingerprint: str, password_hash: str) -> bool:
    return hmac.compare_digest(fingerprint, _fingerprint(password_hash))
