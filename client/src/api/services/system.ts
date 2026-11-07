import type { HttpClient } from '../http'
import type { SystemStatus } from '@/types/runtime'

export const systemService = (http: HttpClient) => ({
  health: (signal?: AbortSignal) =>
    http.request<{ ok: boolean; version: string }>('/health', { signal }),
  status: (signal?: AbortSignal) =>
    http.request<SystemStatus>('/status', { query: { stats: true }, signal }),
})
