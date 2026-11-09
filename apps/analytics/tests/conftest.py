import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

SECRET = "test-secret-" + "x" * 40
USER = "00000000-0000-0000-0000-00000000000a"
WS = "00000000-0000-0000-0000-0000000000f1"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("RUMO_SERVICE_SECRET", SECRET)


@pytest.fixture
def client():
    from rumo_analytics.api import app
    return TestClient(app)


@pytest.fixture
def call(client):
    from rumo_analytics.security import sign

    def _call(path, payload, *, ts=None, secret=SECRET, tamper=False):
        body = json.dumps(payload).encode()
        ts = str(int(ts if ts is not None else time.time()))
        rid = uuid.uuid4().hex
        sig = sign(secret, ts, rid, USER, WS, body)
        if tamper:
            body = body.replace(b"1", b"2", 1)
        return client.post(path, content=body, headers={
            "content-type": "application/json", "x-rumo-ts": ts, "x-rumo-request-id": rid,
            "x-rumo-user": USER, "x-rumo-workspace": WS, "x-rumo-signature": sig})
    return _call
