"""Persistence of runtime facts (desired state, running pid) in app.runtime.models."""

from app.runtime.models import ServiceRuntime, SystemState


async def get_runtime(project_id: str, service_id: str) -> ServiceRuntime | None:
    return await ServiceRuntime.get_or_none(project_id=project_id, service_id=service_id)


async def set_desired(project_id: str, service_id: str, desired: str) -> None:
    row, _ = await ServiceRuntime.get_or_create(project_id=project_id, service_id=service_id)
    if row.desired != desired:
        row.desired = desired
        await row.save(update_fields=["desired", "updated_at"])


async def set_process(
    project_id: str, service_id: str, pid: int, create_time: float, job_name: str | None, started_at: float
) -> None:
    row, _ = await ServiceRuntime.get_or_create(project_id=project_id, service_id=service_id)
    row.pid, row.create_time, row.job_name, row.started_at = pid, create_time, job_name, started_at
    await row.save()


async def clear_process(project_id: str, service_id: str) -> None:
    await ServiceRuntime.filter(project_id=project_id, service_id=service_id).update(
        pid=None, create_time=None, job_name=None, started_at=None
    )


async def delete_runtime(project_id: str, service_id: str | None = None) -> None:
    qs = ServiceRuntime.filter(project_id=project_id)
    if service_id is not None:
        qs = qs.filter(service_id=service_id)
    await qs.delete()


async def get_system_value(key: str) -> str | None:
    row = await SystemState.get_or_none(key=key)
    return row.value if row else None


async def set_system_value(key: str, value: str) -> None:
    await SystemState.update_or_create(key=key, defaults={"value": value})
