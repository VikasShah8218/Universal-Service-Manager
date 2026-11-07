import { parse, stringify } from 'yaml'
import type { Transport } from '@/api/http'
import type { ApplyResult, ProjectSpec, ServiceSpec } from '@/types/project'
import type { ProjectAction, ServiceAction, ServiceStatus } from '@/types/runtime'
import { createDemoWorkspace } from './fixtures'

// A new demo workspace is created for each login. This transport never calls fetch.
export function createDemoTransport(): Transport {
  const workspace = createDemoWorkspace()
  const json = (data: unknown, status = 200) => Response.json(data, { status })
  const missing = () =>
    json({ detail: 'Project or service not found in this demo workspace.' }, 404)

  function record(action: string, project: string, service?: string) {
    workspace.audit.push({
      id: workspace.audit.length + 1,
      ts: new Date().toISOString(),
      actor: 'ui:demo',
      action,
      target: service ? `${project}/${service}` : project,
      outcome: 'ok',
      detail: 'Demo action only',
    })
    workspace.events.push({
      id: workspace.events.length + 1,
      ts: new Date().toISOString(),
      project_id: project,
      service_id: service || null,
      kind: 'state',
      message: `${action} requested in demo workspace`,
      data: null,
    })
  }

  function applyAction(service: ServiceStatus, action: ServiceAction) {
    const stopped = action === 'stop'
    service.state = stopped ? 'STOPPED' : 'HEALTHY'
    service.desired = stopped ? 'STOPPED' : 'RUNNING'
    service.pid = stopped ? null : Math.floor(12000 + Math.random() * 10000)
    service.started_at = stopped ? null : new Date().toISOString()
    service.uptime_s = stopped ? null : 0
    service.message = stopped ? 'Stopped by ui:demo' : 'Running in demo workspace'
    service.cpu_percent = stopped ? null : 0.2
    service.memory_rss = stopped ? null : 48 * 1024 * 1024
    if (action === 'restart' || action === 'kill') service.restart_count++
    service.last_error = null
  }

  function syncProject(id: string) {
    const project = workspace.status.projects.find((item) => item.id === id)!
    project.running = project.services.filter((service) => service.state === 'HEALTHY').length
    project.total = project.services.length
    project.state = project.services.some((service) =>
      ['BACKOFF', 'FAILED', 'UNHEALTHY', 'BLOCKED'].includes(service.state),
    )
      ? 'DEGRADED'
      : project.running
        ? 'RUNNING'
        : 'STOPPED'
  }

  function stoppedService(spec: ServiceSpec, project: string): ServiceStatus {
    return {
      id: spec.id,
      name: spec.name || spec.id,
      kind: spec.kind || 'long_running',
      enabled: spec.enabled !== false,
      state: 'STOPPED',
      desired: 'STOPPED',
      message: 'Not started',
      pid: null,
      adopted: false,
      started_at: null,
      uptime_s: null,
      restart_count: 0,
      last_exit_code: null,
      last_error: null,
      log_path: `data/logs/${project}/${spec.id}/output.log`,
      depends_on: spec.depends_on || [],
    }
  }

  function saveProject(spec: ProjectSpec, replace: boolean, restartChanged: boolean): Response {
    if (!spec || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(spec.id) || !Array.isArray(spec.services))
      return json({ detail: 'Provide a valid project ID and services array.' }, 422)
    const oldIndex = workspace.specs.findIndex((item) => item.id === spec.id)
    if (oldIndex >= 0 && !replace)
      return json({ detail: 'A project with this ID already exists.' }, 409)
    const oldSpec = workspace.specs[oldIndex]
    const previous = workspace.status.projects.find((item) => item.id === spec.id)
    const result: ApplyResult = {
      created: !oldSpec,
      added: [],
      removed: [],
      changed: [],
      restarted: [],
    }
    for (const service of spec.services) {
      const old = oldSpec?.services.find((item) => item.id === service.id)
      if (!old) result.added.push(service.id)
      else if (JSON.stringify(old) !== JSON.stringify(service)) result.changed.push(service.id)
    }
    result.removed =
      oldSpec?.services
        .filter((item) => !spec.services.some((service) => service.id === item.id))
        .map((item) => item.id) || []
    const updated = {
      id: spec.id,
      name: spec.name || spec.id,
      description: spec.description || '',
      autostart: !!spec.autostart,
      state: previous?.state || ('STOPPED' as const),
      running: 0,
      total: spec.services.length,
      services: spec.services.map((service) => {
        const status =
          previous?.services.find((item) => item.id === service.id) ||
          stoppedService(service, spec.id)
        if (restartChanged && result.changed.includes(service.id) && status.desired === 'RUNNING') {
          applyAction(status, 'restart')
          result.restarted.push(service.id)
        }
        return { ...status, name: service.name || service.id, depends_on: service.depends_on || [] }
      }),
    }
    if (oldIndex >= 0) workspace.specs[oldIndex] = spec
    else workspace.specs.push(spec)
    workspace.status.projects = workspace.status.projects
      .filter((item) => item.id !== spec.id)
      .concat(updated)
    syncProject(spec.id)
    record(oldSpec ? 'project.update' : 'project.create', spec.id)
    return json(result, oldSpec ? 200 : 201)
  }

  return async (path, init) => {
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const url = new URL(path, 'http://demo.local')
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const method = init.method || 'GET'
    const body = typeof init.body === 'string' && init.body ? init.body : '{}'
    const payload = () => JSON.parse(body) as Record<string, unknown>
    if (parts[0] === 'health') return json({ ok: true, version: '0.2.0' })
    if (parts[0] === 'status') return json(workspace.status)
    if (parts[0] === 'events')
      return json(
        workspace.events
          .filter(
            (event) =>
              (!url.searchParams.get('project') ||
                event.project_id === url.searchParams.get('project')) &&
              (!url.searchParams.get('service') ||
                event.service_id === url.searchParams.get('service')),
          )
          .slice(-Number(url.searchParams.get('limit') || 100)),
      )
    if (parts[0] === 'audit') return json(workspace.audit.slice(-100))
    if (parts[0] === 'tools') {
      const input = payload()
      if (parts[1] === 'check-port') return json({ port: input.port, in_use: false, owner: null })
      if (parts[1] === 'resolve-exe')
        return json({
          name: input.name,
          path: input.name === 'python' ? 'C:/Python/python.exe' : null,
        })
      if (parts[1] === 'detect')
        return json({
          path: input.cwd || input.base,
          exists: true,
          suggestions: [
            {
              label: 'python main.py',
              note: 'Demo suggestion',
              command: ['python', 'main.py'],
              readiness: null,
            },
          ],
        })
      if (parts[1] === 'list-dir')
        return json({
          path: url.searchParams.get('path') || 'D:/Projects',
          parent: 'D:/',
          home: 'C:/Users/Local',
          dirs: workspace.specs.map((item) => ({ name: item.name, path: item.cwd })),
        })
    }
    if (parts[0] !== 'projects')
      return json({ detail: 'This endpoint is not available in demo mode.' }, 404)
    if (parts[1] === 'import' && method === 'POST') {
      try {
        return saveProject(
          parse(body) as ProjectSpec,
          true,
          url.searchParams.get('restart_changed') === 'true',
        )
      } catch {
        return json({ detail: 'Invalid demo YAML configuration.' }, 422)
      }
    }
    if (parts.length === 1)
      return method === 'POST'
        ? saveProject(payload() as unknown as ProjectSpec, false, false)
        : json(workspace.status.projects)
    const spec = workspace.specs.find((item) => item.id === parts[1])
    const project = workspace.status.projects.find((item) => item.id === parts[1])
    if (!spec || !project) return missing()
    if (parts.length === 2) {
      if (method === 'PUT')
        return saveProject(
          payload() as unknown as ProjectSpec,
          true,
          url.searchParams.get('restart_changed') === 'true',
        )
      if (method === 'DELETE') {
        workspace.specs = workspace.specs.filter((item) => item.id !== project.id)
        workspace.status.projects = workspace.status.projects.filter(
          (item) => item.id !== project.id,
        )
        record('project.delete', project.id)
        return new Response(null, { status: 204 })
      }
      return json({ spec, status: project })
    }
    if (parts[2] === 'export')
      return new Response(stringify(spec), { headers: { 'Content-Type': 'text/plain' } })
    if (parts[2] === 'actions') {
      const { action, services } = payload() as { action: ProjectAction; services?: string[] }
      const targets = project.services.filter(
        (service) => !services || services.includes(service.id),
      )
      targets.forEach((service) => applyAction(service, action))
      syncProject(project.id)
      record(`project.${action}`, project.id)
      return json({ action, services: targets.map((service) => service.id) })
    }
    const service = project.services.find((item) => item.id === parts[3])
    const serviceSpec = spec.services.find((item) => item.id === parts[3])
    if (!service || !serviceSpec) return missing()
    if (parts[4] === 'actions') {
      const action = payload().action as ServiceAction
      applyAction(service, action)
      syncProject(project.id)
      record(`service.${action}`, project.id, service.id)
      return json({ action, service })
    }
    if (parts[4] === 'logs') {
      const messages = [
        `[usm] Starting ${service.id}`,
        'Loading environment configuration',
        'Application startup complete',
        service.state === 'STOPPED' ? 'Service stopped by user' : 'Readiness check passed',
        ...(service.state === 'BACKOFF'
          ? ['Process exited with code 1', 'Waiting 5 seconds before restart']
          : ['GET /health 200 OK', 'Service is healthy']),
      ]
      const lines = messages.map((text, i) => ({
        seq: i + 1,
        ts: Date.now() / 1000 - messages.length + i,
        text,
      }))
      const since = Number(url.searchParams.get('since') || 0)
      return json({
        last_seq: lines.length,
        log_path: service.log_path,
        lines: lines.filter((line) => line.seq > since),
      })
    }
    return json({ spec: serviceSpec, status: service })
  }
}
