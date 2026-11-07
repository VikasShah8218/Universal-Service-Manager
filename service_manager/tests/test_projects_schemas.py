import pytest
from pydantic import ValidationError

from utilities.graph import CycleError, dependencies_closure, dependents_closure, topo_layers
from app.projects.schemas import ProjectSpec as Project


def make(services):
    return Project.model_validate({"id": "p", "cwd": "C:/x", "services": services})


def test_shah_nvr_shape_is_valid():
    p = make([
        {"id": "central-manager", "command": ["python", "main.py"], "readiness": {"type": "tcp", "port": 8000}},
        {"id": "node-manager", "command": ["python", "main.py"], "depends_on": ["central-manager"]},
        {"id": "nvr-client", "command": ["npm", "run", "dev"],
         "depends_on": [{"id": "central-manager", "condition": "started"}],
         "readiness": {"type": "log_regex", "pattern": r"Local:\s+http://"}},
    ])
    assert p.service("node-manager").depends_on[0].condition == "healthy"
    assert topo_layers(p.graph()) == [["central-manager"], ["node-manager", "nvr-client"]]


def test_cycle_rejected():
    with pytest.raises(ValidationError, match="cycle"):
        make([
            {"id": "a", "command": ["x"], "depends_on": ["b"]},
            {"id": "b", "command": ["x"], "depends_on": ["a"]},
        ])


def test_unknown_dependency_rejected():
    with pytest.raises(ValidationError, match="unknown service"):
        make([{"id": "a", "command": ["x"], "depends_on": ["ghost"]}])


def test_self_dependency_rejected():
    with pytest.raises(ValidationError, match="itself"):
        make([{"id": "a", "command": ["x"], "depends_on": ["a"]}])


def test_duplicate_ids_rejected():
    with pytest.raises(ValidationError, match="duplicate"):
        make([{"id": "a", "command": ["x"]}, {"id": "a", "command": ["y"]}])


def test_string_command_requires_shell():
    with pytest.raises(ValidationError, match="shell"):
        make([{"id": "a", "command": "npm run dev"}])
    p = make([{"id": "a", "command": "npm run dev", "shell": True}])
    assert p.services[0].shell


def test_health_check_type_restricted():
    with pytest.raises(ValidationError, match="not allowed"):
        make([{"id": "a", "command": ["x"], "health_checks": [{"type": "log_regex", "pattern": "x"}]}])


def test_bad_ids_and_regex():
    with pytest.raises(ValidationError):
        make([{"id": "Has Spaces", "command": ["x"]}])
    with pytest.raises(ValidationError, match="regex"):
        make([{"id": "a", "command": ["x"], "readiness": {"type": "log_regex", "pattern": "("}}])


def test_graph_helpers():
    g = {"db": [], "api": ["db"], "web": ["api"], "worker": ["db"]}
    assert dependencies_closure(g, ["web"]) == {"web", "api", "db"}
    assert dependents_closure(g, ["db"]) == {"db", "api", "web", "worker"}
    with pytest.raises(CycleError):
        topo_layers({"a": ["b"], "b": ["a"]})
