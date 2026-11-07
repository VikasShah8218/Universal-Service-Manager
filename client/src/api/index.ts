import type { HttpClient } from './http'
import { systemService } from './services/system'
import { projectService } from './services/projects'
import { runtimeService } from './services/runtime'
import { logService } from './services/logs'
import { eventService } from './services/events'
import { toolService } from './services/tools'

export function createApi(http: HttpClient) {
  return {
    system: systemService(http),
    projects: projectService(http),
    runtime: runtimeService(http),
    logs: logService(http),
    events: eventService(http),
    tools: toolService(http),
  }
}

export type Api = ReturnType<typeof createApi>
