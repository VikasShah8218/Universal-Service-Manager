from tortoise import fields
from tortoise.models import Model


class Project(Model):
    """A group of services managed together (e.g. Shah-NVR)."""

    id = fields.CharField(max_length=64, primary_key=True)  # slug, used by the CLI: `usm up shah-nvr`
    name = fields.CharField(max_length=128, null=True)
    description = fields.TextField(default="")
    autostart = fields.BooleanField(default=False)  # start on machine boot
    cwd = fields.CharField(max_length=1024, null=True)  # base dir for relative service paths
    env = fields.JSONField(default=dict)
    env_file = fields.CharField(max_length=1024, null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    services: fields.ReverseRelation["Service"]

    class Meta:
        table = "projects"
        ordering = ["id"]


class Service(Model):
    """Configuration of one service. Its runtime state lives in app.runtime.models.ServiceRuntime."""

    id = fields.IntField(primary_key=True)
    project: fields.ForeignKeyRelation[Project] = fields.ForeignKeyField(
        "models.Project", related_name="services", on_delete=fields.CASCADE
    )
    service_id = fields.CharField(max_length=64)  # slug, unique inside the project
    position = fields.IntField(default=0)  # order shown in UI/CLI
    name = fields.CharField(max_length=128, null=True)
    enabled = fields.BooleanField(default=True)
    kind = fields.CharField(max_length=16, default="long_running")  # long_running | one_shot
    command = fields.JSONField()  # list of argv strings, or one string when shell=True
    shell = fields.BooleanField(default=False)
    cwd = fields.CharField(max_length=1024, null=True)
    env = fields.JSONField(default=dict)
    env_file = fields.CharField(max_length=1024, null=True)
    # Structured settings, validated by app.projects.schemas.ServiceSpec
    depends_on = fields.JSONField(default=list)
    readiness = fields.JSONField(null=True)
    health_checks = fields.JSONField(default=list)
    start_period_s = fields.FloatField(default=0)
    restart_policy = fields.JSONField()
    stop_policy = fields.JSONField()
    log_policy = fields.JSONField()
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "services"
        unique_together = (("project", "service_id"),)
        ordering = ["position", "id"]
