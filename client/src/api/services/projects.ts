import { pathId, type HttpClient } from '../http'
import type { ApplyResult, ProjectSpec } from '@/types/project'
import type { ProjectDetail, ProjectStatus } from '@/types/runtime'

export const projectService = (http: HttpClient) => ({
  list: (signal?: AbortSignal) => http.request<ProjectStatus[]>('/projects', { signal }),
  detail: (id: string, signal?: AbortSignal) =>
    http.request<ProjectDetail>(`/projects/${pathId(id)}`, { signal }),
  create: (spec: ProjectSpec) =>
    http.request<ApplyResult>('/projects', { method: 'POST', body: spec }),
  update: (spec: ProjectSpec, restartChanged: boolean) =>
    http.request<ApplyResult>(`/projects/${pathId(spec.id)}`, {
      method: 'PUT',
      body: spec,
      query: { restart_changed: restartChanged },
    }),
  remove: (id: string) => http.request<void>(`/projects/${pathId(id)}`, { method: 'DELETE' }),
  importYaml: (yaml: string, restartChanged: boolean) =>
    http.request<ApplyResult>('/projects/import', {
      method: 'POST',
      rawBody: yaml,
      query: { restart_changed: restartChanged },
    }),
  exportYaml: (id: string) =>
    http.request<string>(`/projects/${pathId(id)}/export`, { responseType: 'text' }),
})
