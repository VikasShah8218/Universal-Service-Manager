from tortoise import fields
from tortoise.models import Model


class Event(Model):
    """Something that happened to a service: state change, crash, restart, spawn error, ..."""

    id = fields.IntField(primary_key=True)
    ts = fields.DatetimeField(db_index=True)
    project_id = fields.CharField(max_length=64, null=True, db_index=True)  # None = the manager itself
    service_id = fields.CharField(max_length=64, null=True)
    kind = fields.CharField(max_length=32)  # state | started | spawn_failed | kill | recover | manager ...
    message = fields.TextField()
    data = fields.JSONField(null=True)

    class Meta:
        table = "events"
        ordering = ["id"]


class AuditLog(Model):
    """Who asked for what (every config change and start/stop action)."""

    id = fields.IntField(primary_key=True)
    ts = fields.DatetimeField(auto_now_add=True)
    actor = fields.CharField(max_length=64)  # cli | ui | api | system:recover ...
    action = fields.CharField(max_length=64)  # project.create | service.stop ...
    target = fields.CharField(max_length=256)
    outcome = fields.CharField(max_length=16, default="ok")
    detail = fields.TextField(null=True)

    class Meta:
        table = "audit_log"
        ordering = ["id"]
