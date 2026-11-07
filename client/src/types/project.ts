export interface Dependency {
  id: string
  condition: 'started' | 'healthy' | 'completed'
}

interface ProbeOptions {
  timeout_s?: number
  interval_s?: number
  failures?: number
  attempt_timeout_s?: number
}

export type Probe = ProbeOptions &
  (
    | { type: 'tcp'; host?: string; port: number }
    | { type: 'http'; url: string; expect_status?: number[] | null }
    | { type: 'log_regex'; pattern: string }
    | { type: 'delay'; seconds: number }
    | { type: 'process' }
  )

export interface ServiceSpec {
  id: string
  name?: string | null
  enabled?: boolean
  kind?: 'long_running' | 'one_shot'
  command: string[] | string
  shell?: boolean
  cwd?: string | null
  env?: Record<string, string>
  env_file?: string | null
  depends_on?: Dependency[]
  readiness?: Probe | null
  health_checks?: Probe[]
  start_period_s?: number
  restart_policy?: {
    mode?: 'never' | 'on_failure' | 'always'
    max?: number
    window_s?: number
    backoff?: number[]
  }
  stop_policy?: { graceful?: boolean; timeout_s?: number }
  log_policy?: { max_bytes?: number; max_files?: number; buffer_lines?: number }
}

export interface ProjectSpec {
  id: string
  name?: string | null
  description?: string
  autostart?: boolean
  cwd?: string | null
  env?: Record<string, string>
  env_file?: string | null
  services: ServiceSpec[]
}

export interface ApplyResult {
  created: boolean
  added: string[]
  removed: string[]
  changed: string[]
  restarted: string[]
}
