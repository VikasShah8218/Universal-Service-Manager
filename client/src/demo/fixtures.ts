import type { ProjectSpec } from '@/types/project'
import type { ServiceStatus, SystemStatus } from '@/types/runtime'
import type { AuditEntry, ServiceEvent } from '@/types/observability'

export function createDemoWorkspace() {
  const now = Date.now()
  const specs: ProjectSpec[] = [
    {
      id: 'shah-nvr',
      name: 'Shah NVR',
      description: 'Video surveillance & media services',
      cwd: 'D:/Projects/Shah-NVR',
      autostart: true,
      services: [
        {
          id: 'central-manager',
          command: ['python', 'main.py'],
          cwd: 'central_manager',
          readiness: { type: 'http', url: 'http://127.0.0.1:8000/' },
        },
        {
          id: 'media-node',
          command: ['python', 'main.py'],
          cwd: 'media_node',
          depends_on: [{ id: 'central-manager', condition: 'healthy' }],
          readiness: { type: 'tcp', port: 7100 },
        },
        {
          id: 'nvr-client',
          command: ['npm', 'run', 'dev'],
          cwd: 'nvr_client',
          depends_on: [{ id: 'central-manager', condition: 'healthy' }],
          readiness: { type: 'tcp', port: 5180 },
        },
      ],
    },
    {
      id: 'development',
      name: 'Development stack',
      description: 'Local API, workers & supporting tools',
      cwd: 'D:/Projects/development',
      autostart: true,
      services: [
        { id: 'api-server', command: ['python', 'main.py'], cwd: 'api' },
        { id: 'task-worker', command: ['python', 'worker.py'], cwd: 'workers' },
        { id: 'redis', command: ['redis-server'], cwd: '.' },
      ],
    },
    {
      id: 'automation',
      name: 'Automation',
      description: 'Background tasks & automation workflows',
      cwd: 'D:/Projects/automation',
      services: [
        { id: 'backup-agent', command: ['python', 'backup.py'], cwd: '.' },
        { id: 'file-watcher', command: ['node', 'watcher.js'], cwd: '.' },
      ],
    },
  ]
  let index = 0
  const status: SystemStatus = {
    version: '0.2.0',
    platform: 'windows',
    started_at: new Date(now - 8200_000).toISOString(),
    projects: specs.map((project) => ({
      id: project.id,
      name: project.name || project.id,
      description: project.description || '',
      autostart: !!project.autostart,
      state:
        project.id === 'automation'
          ? 'STOPPED'
          : project.id === 'development'
            ? 'DEGRADED'
            : 'RUNNING',
      running: project.id === 'automation' ? 0 : project.id === 'development' ? 2 : 3,
      total: project.services.length,
      services: project.services.map((service) => {
        const stopped = project.id === 'automation'
        const backoff = service.id === 'task-worker'
        const position = index++
        const result: ServiceStatus = {
          id: service.id,
          name: service.name || service.id,
          kind: service.kind || 'long_running',
          enabled: true,
          state: stopped ? 'STOPPED' : backoff ? 'BACKOFF' : 'HEALTHY',
          desired: stopped ? 'STOPPED' : 'RUNNING',
          message: backoff
            ? 'Exited with code 1; restart attempt 3 of 5'
            : stopped
              ? 'Manually stopped'
              : 'Readiness check passed',
          pid: stopped || backoff ? null : 12480 + position * 512,
          adopted: false,
          started_at: stopped || backoff ? null : new Date(now - 8040_000).toISOString(),
          uptime_s: stopped || backoff ? null : 8040,
          restart_count: backoff ? 3 : 0,
          last_exit_code: backoff ? 1 : null,
          last_error: backoff ? 'Connection to worker queue was interrupted' : null,
          log_path: `data/logs/${project.id}/${service.id}/output.log`,
          depends_on: service.depends_on || [],
          memory_rss:
            stopped || backoff ? null : [86.4, 124.8, 62.1, 71.2, 0, 12.6][position] * 1024 * 1024,
          cpu_percent: stopped || backoff ? null : [0.8, 1.2, 0.3, 0.5, 0, 0.1][position],
          process_count: stopped || backoff ? 0 : 1,
        }
        return result
      }),
    })),
  }
  const events: ServiceEvent[] = [
    {
      id: 1,
      ts: new Date(now - 30000).toISOString(),
      project_id: 'shah-nvr',
      service_id: null,
      kind: 'started',
      message: 'Shah NVR started successfully. All 3 services are healthy.',
      data: null,
    },
    {
      id: 2,
      ts: new Date(now - 14000).toISOString(),
      project_id: 'development',
      service_id: 'api-server',
      kind: 'state',
      message: 'STARTING → HEALTHY: HTTP readiness check passed',
      data: null,
    },
    {
      id: 3,
      ts: new Date(now - 5000).toISOString(),
      project_id: 'development',
      service_id: 'task-worker',
      kind: 'state',
      message: 'HEALTHY → BACKOFF: exited with code 1; restarting',
      data: null,
    },
  ]
  const audit: AuditEntry[] = [
    {
      id: 1,
      ts: new Date(now - 30000).toISOString(),
      actor: 'cli',
      action: 'project.start',
      target: 'shah-nvr',
      outcome: 'ok',
      detail: null,
    },
  ]
  return { specs, status, events, audit }
}
