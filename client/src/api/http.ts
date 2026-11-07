import type { Session } from '@/types/session'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  rawBody?: string
  query?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
  responseType?: 'json' | 'text'
}

export type Transport = (path: string, init: RequestInit) => Promise<Response>
export interface HttpClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>
}

function detailMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail: unknown = payload.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail))
      return detail
        .map((issue) => {
          const item = issue as { loc?: (string | number)[]; msg?: string }
          return `${item.loc?.filter((part) => part !== 'body').join('.') || 'Configuration'}: ${item.msg || 'Invalid value'}`
        })
        .join('\n')
  }
  return status === 502 || status === 503
    ? 'Cannot reach the manager. Check that it is running.'
    : `Request failed (HTTP ${status}).`
}

export function createHttpClient(
  session: Session,
  onUnauthorized: () => void,
  transport: Transport = (path, init) => fetch(`/api/v1${path}`, init),
): HttpClient {
  return {
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      const query = new URLSearchParams()
      Object.entries(options.query || {}).forEach(([key, value]) => {
        if (value !== undefined) query.set(key, String(value))
      })
      const url = `${path}${query.size ? `?${query}` : ''}`
      const headers: Record<string, string> = { 'X-USM-Client': 'ui', 'X-USM-Token': session.token }
      if (options.body !== undefined) headers['Content-Type'] = 'application/json'
      if (options.rawBody !== undefined) headers['Content-Type'] = 'application/yaml'
      let response: Response
      try {
        response = await transport(url, {
          method: options.method || 'GET',
          headers,
          body:
            options.rawBody ??
            (options.body === undefined ? undefined : JSON.stringify(options.body)),
          signal: options.signal
            ? AbortSignal.any([
                options.signal,
                AbortSignal.timeout(options.method && options.method !== 'GET' ? 120_000 : 20_000),
              ])
            : AbortSignal.timeout(options.method && options.method !== 'GET' ? 120_000 : 20_000),
          cache: 'no-store',
        })
      } catch (error) {
        if (options.signal?.aborted) throw error
        throw new ApiError(0, 'Cannot reach the manager. Check the connection and try again.')
      }
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null)
        if (response.status === 401) onUnauthorized()
        throw new ApiError(response.status, detailMessage(payload, response.status))
      }
      if (response.status === 204) return undefined as T
      return (options.responseType === 'text' ? response.text() : response.json()) as Promise<T>
    },
  }
}

export const pathId = encodeURIComponent
