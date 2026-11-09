"""Autenticação de serviço Node → Python.

O servidor web assina cada requisição com HMAC-SHA256 (segredo RUMO_SERVICE_SECRET) sobre
  ts . request_id . user_id . workspace_id . sha256(corpo)
Validade de 60 s. O serviço Python não acessa o banco nem recebe chave privilegiada:
recebe somente os dados que o servidor web já leu com a sessão do usuário (RLS aplicada).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request

MAX_SKEW_SECONDS = 60
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


@dataclass(frozen=True)
class ServiceContext:
    request_id: str
    user_id: str
    workspace_id: str


def _secret() -> bytes:
    s = os.environ.get("RUMO_SERVICE_SECRET", "")
    if len(s) < 32:
        raise HTTPException(status_code=503, detail="service_not_configured")
    return s.encode()


def sign(secret: str, ts: str, request_id: str, user_id: str, workspace_id: str, body: bytes) -> str:
    msg = ".".join([ts, request_id, user_id, workspace_id, hashlib.sha256(body).hexdigest()]).encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


async def verify(request: Request) -> ServiceContext:
    h = request.headers
    ts, rid, uid, ws, sig = (h.get("x-rumo-ts", ""), h.get("x-rumo-request-id", ""), h.get("x-rumo-user", ""),
                             h.get("x-rumo-workspace", ""), h.get("x-rumo-signature", ""))
    if not (ts.isdigit() and _UUID.match(uid) and _UUID.match(ws) and 8 <= len(rid) <= 64 and len(sig) == 64):
        raise HTTPException(status_code=401, detail="unauthorized")
    if abs(time.time() - int(ts)) > MAX_SKEW_SECONDS:
        raise HTTPException(status_code=401, detail="expired")
    body = await request.body()
    expected = sign(_secret().decode(), ts, rid, uid, ws, body)
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=401, detail="unauthorized")
    return ServiceContext(request_id=rid, user_id=uid, workspace_id=ws)
