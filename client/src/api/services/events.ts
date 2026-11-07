import type { HttpClient } from '../http'
import type { AuditEntry, ServiceEvent } from '@/types/observability'

export const eventService = (http: HttpClient) => ({
  list: (
    filters: { project?: string; service?: string; limit?: number } = {},
    signal?: AbortSignal,
  ) => http.request<ServiceEvent[]>('/events', { query: { limit: 100, ...filters }, signal }),
  audit: (signal?: AbortSignal) =>
    http.request<AuditEntry[]>('/audit', { query: { limit: 100 }, signal }),
})
