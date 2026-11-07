import asyncio

import httpx
import pytest

from conftest import FIXTURES, PY
from main import app
from settings.settings import settings
from utilities.security import set_token

TOKEN = "test-token"
H = {"X-USM-Token": TOKEN}


@pytest.fixture
async def client(engine):
    set_token(TOKEN)
    transport = httpx.ASGITransport(app=app)  # no lifespan: the `engine` fixture runs the engine
    async with httpx.AsyncClient(transport=transport, base_url=f"http://127.0.0.1:{settings.PORT}") as c:
        yield c


def yaml_project(tmp_path):
    return f"""
id: demo
cwd: "{tmp_path.as_posix()}"
services:
  - id: web
    command: ["{PY.replace(chr(92), '/')}", "{(FIXTURES / 'sleeper.py').as_posix()}"]
"""


async def test_health_is_public(client):
    r = await client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["ok"]


async def test_token_required(client):
    assert (await client.get("/api/v1/status")).status_code == 401
    assert (await client.get("/api/v1/status", headers={"X-USM-Token": "wrong"})).status_code == 401
    r = await client.get("/api/v1/status", headers={"Authorization": f"Bearer {TOKEN}"})
    assert r.status_code == 200


async def test_dns_rebinding_and_csrf_blocked(client):
    assert (await client.get("/api/v1/status", headers={**H, "Host": "evil.example.com"})).status_code == 403
    assert (await client.get("/api/v1/status", headers={**H, "Origin": "https://evil.example.com"})).status_code == 403
    assert (await client.get("/api/v1/status", headers={**H, "Origin": "http://localhost:5173"})).status_code == 200


async def test_import_start_logs_events_export(client, tmp_path):
    r = await client.post("/api/v1/projects/import", content=yaml_project(tmp_path), headers=H)
    assert r.status_code == 200, r.text
    assert r.json()["created"]

    r = await client.post("/api/v1/projects/demo/actions", json={"action": "start"}, headers=H)
    assert r.json()["services"] == ["web"]

    for _ in range(100):
        st = (await client.get("/api/v1/projects/demo", headers=H)).json()["status"]
        if st["services"][0]["state"] == "HEALTHY":
            break
        await asyncio.sleep(0.1)
    assert st["state"] == "RUNNING"
    assert st["services"][0]["pid"]

    for _ in range(50):
        logs = (await client.get("/api/v1/projects/demo/services/web/logs?tail=50", headers=H)).json()
        if any("ready" in ln["text"] for ln in logs["lines"]):
            break
        await asyncio.sleep(0.1)
    assert any("ready" in ln["text"] for ln in logs["lines"])
    newer = (await client.get(f"/api/v1/projects/demo/services/web/logs?since={logs['last_seq']}", headers=H)).json()
    assert newer["lines"] == []

    stats = (await client.get("/api/v1/status?stats=true", headers=H)).json()
    assert stats["projects"][0]["services"][0]["memory_rss"] > 0

    r = await client.post("/api/v1/projects/demo/services/web/actions", json={"action": "stop"}, headers=H)
    assert r.json()["service"]["state"] == "STOPPED"

    events = (await client.get("/api/v1/events?project=demo", headers=H)).json()
    kinds = [e["kind"] for e in events]
    assert "started" in kinds and "state" in kinds
    audit = (await client.get("/api/v1/audit", headers=H)).json()
    assert [a["action"] for a in audit][-3:] == ["project.create", "project.start", "service.stop"]

    text = (await client.get("/api/v1/projects/demo/export", headers=H)).text
    assert "id: demo" in text and "sleeper.py" in text


async def test_create_update_delete_roundtrip(client, tmp_path):
    spec = {"id": "p1", "cwd": str(tmp_path), "services": [{"id": "a", "command": [PY, "-c", "pass"]}]}
    r = await client.post("/api/v1/projects", json=spec, headers=H)
    assert r.status_code == 201, r.text
    assert (await client.post("/api/v1/projects", json=spec, headers=H)).status_code == 409

    full = (await client.get("/api/v1/projects/p1", headers=H)).json()["spec"]
    r = await client.put("/api/v1/projects/p1", json=full, headers=H)  # unchanged -> nothing to do
    assert r.json() == {"created": False, "added": [], "removed": [], "changed": [], "restarted": []}

    full["services"].append({"id": "b", "command": [PY, "-c", "pass"], "depends_on": ["a"]})
    full["services"][0]["env"] = {"X": "1"}
    r = await client.put("/api/v1/projects/p1", json=full, headers=H)
    assert r.json()["added"] == ["b"] and r.json()["changed"] == ["a"]
    again = (await client.get("/api/v1/projects/p1", headers=H)).json()["spec"]
    assert [s["id"] for s in again["services"]] == ["a", "b"]
    assert again["services"][0]["env"] == {"X": "1"}

    assert (await client.delete("/api/v1/projects/p1", headers=H)).status_code == 204
    assert (await client.get("/api/v1/projects/p1", headers=H)).status_code == 404


async def test_validation_errors(client, tmp_path):
    bad = {"id": "Bad Id", "services": []}
    assert (await client.post("/api/v1/projects", json=bad, headers=H)).status_code == 422
    cyc = {"id": "c", "cwd": str(tmp_path), "services": [
        {"id": "a", "command": ["x"], "depends_on": ["b"]},
        {"id": "b", "command": ["x"], "depends_on": ["a"]},
    ]}
    r = await client.post("/api/v1/projects", json=cyc, headers=H)
    assert r.status_code == 422 and "cycle" in r.text
    r = await client.post("/api/v1/projects/import", content="- not a mapping", headers=H)
    assert r.status_code == 422
    r = await client.post("/api/v1/projects/nope/actions", json={"action": "start"}, headers=H)
    assert r.status_code == 404


async def test_list_dir(client, tmp_path):
    root = tmp_path / "browse"
    (root / "b_dir").mkdir(parents=True)
    (root / "a_dir").mkdir()
    (root / "file.txt").write_text("x")
    r = await client.get("/api/v1/tools/list-dir", params={"path": str(root)}, headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    assert [d["name"] for d in body["dirs"]] == ["a_dir", "b_dir"]
    assert body["parent"] == str(root.parent)
    roots = (await client.get("/api/v1/tools/list-dir", headers=H)).json()
    assert roots["dirs"] and roots["parent"] is None
    assert (await client.get("/api/v1/tools/list-dir", params={"path": str(root / "nope")}, headers=H)).status_code == 404
    assert (await client.get("/api/v1/tools/list-dir", params={"path": "relative/dir"}, headers=H)).status_code == 422


async def test_detect_commands(client, tmp_path):
    api = tmp_path / "api"
    (api / ".venv" / "Scripts").mkdir(parents=True)
    (api / ".venv" / "Scripts" / "python.exe").write_text("")
    (api / "main.py").write_text("")
    web = tmp_path / "web"
    web.mkdir()
    (web / "package.json").write_text('{"scripts": {"build": "vite build", "dev": "vite"}, "devDependencies": {"vite": "5"}}')

    s = (await client.post("/api/v1/tools/detect", json={"base": str(tmp_path), "cwd": "api"}, headers=H)).json()
    assert s["suggestions"][0]["command"] == [".venv/Scripts/python.exe", "main.py"]
    s = (await client.post("/api/v1/tools/detect", json={"base": str(tmp_path), "cwd": "web"}, headers=H)).json()
    assert s["suggestions"][0]["command"] == ["npm", "run", "dev"]
    assert s["suggestions"][0]["readiness"]["type"] == "log_regex"
    s = (await client.post("/api/v1/tools/detect", json={"base": str(tmp_path), "cwd": "missing"}, headers=H)).json()
    assert s["exists"] is False


async def test_port_and_resolve_tools(client):
    r = (await client.post("/api/v1/tools/resolve-exe", json={"name": "definitely-not-a-real-exe-xyz"}, headers=H)).json()
    assert r["path"] is None
    r = (await client.post("/api/v1/tools/check-port", json={"port": 1}, headers=H)).json()
    assert r["port"] == 1 and isinstance(r["in_use"], bool)
