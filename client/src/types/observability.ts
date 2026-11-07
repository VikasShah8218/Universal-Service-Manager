export interface LogLine {
  seq: number
  ts: number
  text: string
}
export interface LogsResponse {
  last_seq: number
  log_path: string
  lines: LogLine[]
}
export interface ServiceEvent {
  id: number
  ts: string
  project_id: string | null
  service_id: string | null
  kind: string
  message: string
  data: Record<string, unknown> | null
}
export interface AuditEntry {
  id: number
  ts: string
  actor: string
  action: string
  target: string
  outcome: string
  detail: string | null
}
