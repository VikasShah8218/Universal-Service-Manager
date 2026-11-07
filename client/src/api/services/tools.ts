import type { HttpClient } from '../http'
import type { DetectionResult, DirectoryListing, ExecutableResult, PortResult } from '@/types/tools'

export const toolService = (http: HttpClient) => ({
  resolveExecutable: (name: string, cwd?: string) =>
    http.request<ExecutableResult>('/tools/resolve-exe', { method: 'POST', body: { name, cwd } }),
  checkPort: (port: number) =>
    http.request<PortResult>('/tools/check-port', { method: 'POST', body: { port } }),
  detect: (base?: string, cwd?: string) =>
    http.request<DetectionResult>('/tools/detect', { method: 'POST', body: { base, cwd } }),
  listDirectories: (path?: string) =>
    http.request<DirectoryListing>('/tools/list-dir', { query: { path } }),
})
