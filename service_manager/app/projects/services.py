"""Project configuration storage (database side only; runtime lives in app.runtime)."""

from tortoise.transactions import in_transaction

from app.projects.models import Project, Service
from app.projects.schemas import ProjectSpec
from app.projects.utils import project_row_fields, rows_to_spec, service_row_fields


async def load_projects() -> list[ProjectSpec]:
    projects = await Project.all().prefetch_related("services")
    return [rows_to_spec(p, list(p.services)) for p in projects]


async def save_project(spec: ProjectSpec) -> None:
    """Create or replace a project's config. Services are matched by their id (slug)."""
    async with in_transaction():
        project = await Project.get_or_none(id=spec.id)
        if project is None:
            project = await Project.create(id=spec.id, **project_row_fields(spec))
        else:
            await project.update_from_dict(project_row_fields(spec)).save()

        existing = {s.service_id: s for s in await Service.filter(project_id=spec.id)}
        keep = {s.id for s in spec.services}
        stale = [row.id for sid, row in existing.items() if sid not in keep]
        if stale:
            await Service.filter(id__in=stale).delete()
        for position, svc in enumerate(spec.services):
            fields = service_row_fields(svc, position)
            row = existing.get(svc.id)
            if row is None:
                await Service.create(project=project, service_id=svc.id, **fields)
            else:
                await row.update_from_dict(fields).save()


async def delete_project(project_id: str) -> None:
    await Project.filter(id=project_id).delete()  # services cascade
