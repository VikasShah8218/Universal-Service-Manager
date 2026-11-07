import { ArrowRight, Folder, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { Panel } from '@/components/ui/Panel'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ProjectActions } from './ProjectActions'
import type { ProjectStatus } from '@/types/runtime'

export function ProjectCard({ project }: { project: ProjectStatus }) {
  return (
    <Panel className="transition-colors hover:border-primary/40">
      <div className="p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <Folder className="size-[18px]" />
          </span>
          <StatusBadge state={project.state} />
        </div>
        <Link
          className="text-[15px] font-semibold hover:text-primary"
          to={`/projects/${encodeURIComponent(project.id)}`}
        >
          {project.name}
        </Link>
        <p className="mt-1 min-h-8 text-xs leading-relaxed text-muted">
          {project.description || 'Local service project'}
        </p>
        <p className="mt-3 truncate font-mono text-[10px] text-muted/75">{project.id}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted">
            {project.running} of {project.total} services running
          </span>
          <div className="flex max-w-28 gap-1">
            {project.services.slice(0, 8).map((service) => (
              <span
                key={service.id}
                title={`${service.name}: ${service.state}`}
                className={`h-1 w-5 rounded-full ${service.state === 'HEALTHY' ? 'bg-success/80' : ['FAILED', 'BACKOFF', 'UNHEALTHY'].includes(service.state) ? 'bg-warning/80' : 'bg-border'}`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[10px] text-muted">
          <RefreshCw className="size-3" />
          {project.autostart ? 'Autostart enabled' : 'Manual start'}
        </span>
        <div className="flex items-center">
          <ProjectActions id={project.id} running={project.running > 0} compact />
          <Link
            aria-label={`View ${project.name}`}
            to={`/projects/${encodeURIComponent(project.id)}`}
            className="rounded-md p-2 text-muted hover:bg-secondary hover:text-primary"
          >
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </Panel>
  )
}
