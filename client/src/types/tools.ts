import type { Probe } from './project'
export interface PortResult {
  port: number
  in_use: boolean
  owner: { port: number; pid: number | null; name: string | null } | null
}
export interface ExecutableResult {
  name: string
  path: string | null
}
export interface DirectoryListing {
  path: string
  parent: string | null
  home: string
  dirs: { name: string; path: string }[]
}
export interface DetectionResult {
  path: string | null
  exists: boolean
  suggestions: { label: string; note: string; command: string[]; readiness: Probe | null }[]
}
