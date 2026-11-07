from pydantic import BaseModel


class LogLineOut(BaseModel):
    seq: int  # increases per line; pass the last one as `since` to get only new lines
    ts: float  # epoch seconds when the manager read the line
    text: str


class LogsOut(BaseModel):
    last_seq: int
    log_path: str
    lines: list[LogLineOut]
