"""Whole app through its real lifespan (Tortoise + engine start/stop)."""

from fastapi.testclient import TestClient

from main import app
from settings.settings import settings


def test_root_and_lifespan():
    with TestClient(app, base_url="http://127.0.0.1") as client:
        r = client.get("/")
        assert r.status_code == 200
        assert r.json()["service"] == "Universal Service Manager"
        assert client.get("/api/v1/health").json()["ok"]
        token = settings.read_token()
        assert token, "lifespan creates the API token"
        r = client.get("/api/v1/status", headers={"X-USM-Token": token})
        assert r.status_code == 200 and r.json()["projects"] == []
