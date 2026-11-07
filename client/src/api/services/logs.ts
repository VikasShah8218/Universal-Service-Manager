import type { HttpClient } from '../http'
import type { LogsResponse } from '@/types/observability'
import { servicePath } from './runtime'

export const logService = (http: HttpClient) => ({
  read: (project: string, service: string, cursor?: number, signal?: AbortSignal) =>
    http.request<LogsResponse>(`${servicePath(project, service)}/logs`, {
      query: cursor === undefined ? { tail: 200 } : { since: cursor },
      signal,
    }),
})
