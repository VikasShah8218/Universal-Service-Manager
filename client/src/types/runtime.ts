import type { Dependency, ProjectSpec, ServiceSpec } from './project'

export type ServiceState =
  | 'STOPPED'
  | 'WAITING_DEPS'
  | 'BLOCKED'
  | 'STARTING'
  | 'HEALTHY'
  | 'UNHEALTHY'
  | 'BACKOFF'
  | 'STOPPING'
  | 'FAILED'
  | 'COMPLETED'
  | 'EXITED'
export type ProjectState = 'STOPPED' | 'RUNNING' | 'DEGRADED' | 'TRANSITIONING'
export type ProjectAction = 'start' | 'stop' | 'restart'
export type ServiceAction = ProjectAction | 'kill' | 'reset'

export interface ServiceStatus {
  id: string
  name: string
  kind: string
  enabled: boolean
  state: ServiceState
  desired: 'RUNNING' | 'STOPPED'
  message: string
  pid: number | null
  adopted: boolean
  started_at: string | null
  uptime_s: number | null
  restart_count: number
  last_exit_code: number | null
  last_error: string | null
  log_path: string
  depends_on: Dependency[]
  memory_rss?: number | null
  cpu_percent?: number | null
  process_count?: number | null
}

export interface ProjectStatus {
  id: string
  name: string
  description: string
  autostart: boolean
  state: ProjectState
  running: number
  total: number
  services: ServiceStatus[]
}

export interface SystemStatus {
  version: string
  platform: string
  started_at: string
  projects: ProjectStatus[]
}

export interface ProjectDetail {
  spec: ProjectSpec
  status: ProjectStatus
}
export interface ServiceDetail {
  spec: ServiceSpec
  status: ServiceStatus
}
export interface ServiceRow extends ServiceStatus {
  projectId: string
  projectName: string
}
export interface ProjectActionResult {
  action: ProjectAction
  services: string[]
}
export interface ServiceActionResult {
  action: ServiceAction
  service: ServiceStatus
}
