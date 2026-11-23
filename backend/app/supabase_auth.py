"""Confere o login feito no Supabase.

O site entra pelo Supabase e manda o "access token" no cabeçalho
Authorization. Aqui perguntamos ao próprio Supabase quem é o dono do token
(GET /auth/v1/user). Não precisa instalar biblioteca nenhuma.
O resultado fica guardado 60 segundos, pra não consultar a cada requisição.
"""
import json
import time
import urllib.error
import urllib.request

from fastapi import HTTPException

from app import config

CACHE_SECONDS = 60
_cache: dict[str, tuple[dict, float]] = {}


def _configured() -> bool:
    return bool(config.SUPABASE_URL) and "COLE_AQUI" not in config.SUPABASE_URL \
        and bool(config.SUPABASE_ANON_KEY) and "COLE_AQUI" not in config.SUPABASE_ANON_KEY


def get_supabase_user(token: str) -> dict | None:
    """Devolve os dados do usuário (id, email...) ou None se o token for inválido."""
    if not token:
        return None

    now = time.time()
    hit = _cache.get(token)

    if hit and hit[1] > now:
        return hit[0]

    if not _configured():
        raise HTTPException(status_code=503, detail="O servidor ainda não foi configurado com o Supabase (app/config.py).")

    request = urllib.request.Request(
        config.SUPABASE_URL.rstrip("/") + "/auth/v1/user",
        headers={"Authorization": f"Bearer {token}", "apikey": config.SUPABASE_ANON_KEY},
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            user = json.loads(response.read().decode())
    except urllib.error.HTTPError as err:
        if err.code in (401, 403):
            return None
        raise HTTPException(status_code=502, detail="Não foi possível verificar o login agora. Tente de novo.")
    except Exception:
        raise HTTPException(status_code=502, detail="Não foi possível falar com o serviço de login. Tente de novo.")

    if not user.get("id"):
        return None

    if len(_cache) > 500:
        _cache.clear()

    _cache[token] = (user, now + CACHE_SECONDS)
    return user


def require_user(authorization: str | None) -> dict:
    token = (authorization or "").removeprefix("Bearer ").strip()
    user = get_supabase_user(token)

    if not user:
        raise HTTPException(status_code=401, detail="Faça login para continuar.")

    return user
