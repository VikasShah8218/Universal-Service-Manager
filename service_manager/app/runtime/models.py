from tortoise import fields
from tortoise.models import Model


class ServiceRuntime(Model):
    """What the manager must remember about a service across its own restarts.

    `desired` is what the user wants (a manual stop stays stopped). pid + create_time
    identify the running process exactly (PIDs get reused), so a restarted manager can
    re-adopt it instead of starting a second copy.
    """

    id = fields.IntField(primary_key=True)
    project_id = fields.CharField(max_length=64)
    service_id = fields.CharField(max_length=64)
    desired = fields.CharField(max_length=16, default="STOPPED")  # RUNNING | STOPPED
    pid = fields.IntField(null=True)
    create_time = fields.FloatField(null=True)  # process start time (epoch seconds, from psutil)
    job_name = fields.CharField(max_length=128, null=True)  # Windows Job Object name
    started_at = fields.FloatField(null=True)  # epoch seconds
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "service_runtime"
        unique_together = (("project_id", "service_id"),)


class SystemState(Model):
    """Small key/value facts about the manager itself (e.g. last seen boot time)."""

    key = fields.CharField(max_length=64, primary_key=True)
    value = fields.TextField()

    class Meta:
        table = "system_state"
