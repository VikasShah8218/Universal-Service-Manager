import { pathId, type HttpClient } from '../http'
import type {
  ProjectAction,
  ProjectActionResult,
  ServiceAction,
  ServiceActionResult,
  ServiceDetail,
} from '@/types/runtime'

export const servicePath = (project: string, service: string) =>
  `/projects/${pathId(project)}/services/${pathId(service)}`

export const runtimeService = (http: HttpClient) => ({
  projectAction: (id: string, action: ProjectAction, services?: string[]) =>
    http.request<ProjectActionResult>(`/projects/${pathId(id)}/actions`, {
      method: 'POST',
      body: { action, services },
    }),
  detail: (project: string, service: string, signal?: AbortSignal) =>
    http.request<ServiceDetail>(servicePath(project, service), { signal }),
  serviceAction: (project: string, service: string, action: ServiceAction) =>
    http.request<ServiceActionResult>(`${servicePath(project, service)}/actions`, {
      method: 'POST',
      body: { action },
    }),
})
