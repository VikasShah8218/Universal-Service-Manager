import yaml
from fastapi import HTTPException
from pydantic import ValidationError

from app.projects.models import Project, Service
from app.projects.schemas import ProjectSpec, ServiceSpec

SERVICE_FIELDS = (
    "name", "enabled", "kind", "command", "shell", "cwd", "env", "env_file", "depends_on", "readiness",
    "health_checks", "start_period_s", "restart_policy", "stop_policy", "log_policy",
)


def service_row_fields(spec: ServiceSpec, position: int) -> dict:
    """ServiceSpec -> column values for app.projects.models.Service."""
    data = spec.model_dump(mode="json")
    return {"position": position, **{f: data[f] for f in SERVICE_FIELDS}}


def project_row_fields(spec: ProjectSpec) -> dict:
    return {
        "name": spec.name,
        "description": spec.description,
        "autostart": spec.autostart,
        "cwd": spec.cwd,
        "env": spec.env,
        "env_file": spec.env_file,
    }


def rows_to_spec(project: Project, services: list[Service]) -> ProjectSpec:
    return ProjectSpec.model_validate({
        "id": project.id,
        **{f: getattr(project, f) for f in ("name", "description", "autostart", "cwd", "env", "env_file")},
        "services": [
            {"id": s.service_id, **{f: getattr(s, f) for f in SERVICE_FIELDS}}
            for s in sorted(services, key=lambda s: (s.position, s.id))
        ],
    })


def project_to_yaml(spec: ProjectSpec) -> str:
    data = spec.model_dump(mode="json", exclude_defaults=True)
    data = {"id": spec.id, **data}  # id first, always present
    return yaml.safe_dump(data, sort_keys=False, allow_unicode=True)


def parse_project_yaml(text: str) -> ProjectSpec:
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as e:
        raise HTTPException(422, f"invalid YAML: {e}") from e
    if not isinstance(data, dict):
        raise HTTPException(422, "YAML must be a mapping describing one project")
    try:
        return ProjectSpec.model_validate(data)
    except ValidationError as e:
        raise HTTPException(
            422, e.errors(include_url=False, include_context=False)
        ) from e
