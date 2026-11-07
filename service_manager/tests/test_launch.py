import shutil
import sys
from pathlib import Path

import pytest

from app.projects.schemas import ProjectSpec as Project
from app.processes.launch import (
    ResolveError,
    build_launch,
    expand,
    load_env_file,
    merge_env,
    service_local_ports,
)

WIN = sys.platform == "win32"


def proj(tmp_path, service, **kw):
    return Project.model_validate({"id": "p", "cwd": str(tmp_path), "services": [service], **kw})


def test_env_file_parsing(tmp_path):
    f = tmp_path / ".env"
    f.write_text('# c\nA=1\nexport B="two words"\nC=x # comment\nD=\'q\'\n', encoding="utf-8")
    assert load_env_file(f) == {"A": "1", "B": "two words", "C": "x", "D": "q"}


def test_merge_and_expand():
    env = merge_env({"HOME": "/h"}, {"APP": "${HOME}/app"}, {"LOG": "${APP}/log", "LIT": "$${HOME}"})
    key = "LOG".upper() if WIN else "LOG"
    assert env[key] == "/h/app/log"
    assert env["LIT"] == "${HOME}"
    assert expand("${NOPE}x", {}) == "x"


@pytest.mark.skipif(not WIN, reason="windows env is case-insensitive")
def test_windows_env_case_insensitive():
    env = merge_env({"Path": "a"}, {"PATH": "b"})
    assert env == {"PATH": "b"}


def test_layering_precedence(tmp_path):
    (tmp_path / "svc.env").write_text("X=from_service_file\nY=from_service_file\n", encoding="utf-8")
    p = proj(tmp_path, {"id": "s", "command": [sys.executable, "-V"], "env_file": "svc.env", "env": {"Y": "explicit"}},
             env={"X": "project", "Z": "project"})
    plan = build_launch(p, p.services[0], base_env={"PATH": ""})
    get = lambda k: plan.env[k.upper() if WIN else k]
    assert get("X") == "from_service_file"
    assert get("Y") == "explicit"
    assert get("Z") == "project"
    assert get("PYTHONUNBUFFERED") == "1"
    assert get("USM_SERVICE") == "s"


def test_user_env_wins_over_defaults(tmp_path):
    p = proj(tmp_path, {"id": "s", "command": [sys.executable, "-V"]})
    plan = build_launch(p, p.services[0], base_env={"PYTHONUNBUFFERED": "0"})
    assert plan.env["PYTHONUNBUFFERED"] == "0"


def test_missing_executable_and_cwd(tmp_path):
    p = proj(tmp_path, {"id": "s", "command": ["definitely-not-a-real-exe-xyz"]})
    with pytest.raises(ResolveError, match="not found"):
        build_launch(p, p.services[0])
    p = proj(tmp_path, {"id": "s", "command": [sys.executable], "cwd": "missing-dir"})
    with pytest.raises(ResolveError, match="does not exist"):
        build_launch(p, p.services[0])


def test_path_with_spaces_and_dots(tmp_path):
    d = tmp_path / "Mr. Shah" / "my app"
    d.mkdir(parents=True)
    p = proj(tmp_path, {"id": "s", "command": [sys.executable, "main.py"], "cwd": "Mr. Shah/my app"})
    plan = build_launch(p, p.services[0])
    assert plan.cwd == str(d.resolve())
    assert plan.argv[0] == str(Path(sys.executable))


@pytest.mark.skipif(not (WIN and shutil.which("npm")), reason="needs npm on Windows")
def test_npm_cmd_runs_without_cmd_exe(tmp_path):
    p = proj(tmp_path, {"id": "s", "command": ["npm", "run", "dev"]})
    plan = build_launch(p, p.services[0])
    assert isinstance(plan.argv, list)
    assert plan.argv[0].lower().endswith("node.exe")
    assert plan.argv[1].endswith("npm-cli.js")
    assert plan.argv[2:] == ["run", "dev"]


def test_local_ports_detected(tmp_path):
    p = proj(tmp_path, {
        "id": "s", "command": ["x"],
        "readiness": {"type": "tcp", "port": 8000},
        "health_checks": [{"type": "http", "url": "http://localhost:5173/health"},
                          {"type": "http", "url": "http://example.com/"}],
    })
    assert service_local_ports(p.services[0]) == {8000, 5173}
