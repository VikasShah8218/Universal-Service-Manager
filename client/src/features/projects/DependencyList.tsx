import { ArrowRight, GitBranch } from 'lucide-react'
import { Link } from 'react-router'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { ProjectDetail } from '@/types/runtime'

export function DependencyList({ project }: { project: ProjectDetail }) {
  return (
    <div className="space-y-3">
      <p className="mb-4 text-xs leading-relaxed text-muted">
        Dependencies gate startup and restart attempts. They do not automatically stop an
        already-running dependent.
      </p>
      {project.spec.services.map((service) => (
        <div
          key={service.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-4"
        >
          <GitBranch className="size-4 text-primary" />
          <Link
            to={`/projects/${encodeURIComponent(project.spec.id)}/services/${encodeURIComponent(service.id)}`}
            className="text-xs font-medium hover:text-primary"
          >
            {service.name || service.id}
          </Link>
          <StatusBadge
            state={
              project.status.services.find((item) => item.id === service.id)?.state || 'STOPPED'
            }
          />
          <ArrowRight className="size-3.5 text-muted" />
          {service.depends_on?.length ? (
            service.depends_on.map((dependency) => (
              <span
                key={dependency.id}
                className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] text-primary"
              >
                {dependency.id} · {dependency.condition}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted">Starts independently</span>
          )}
        </div>
      ))}
      {!project.spec.services.length && (
        <p className="py-6 text-center text-xs text-muted">Add services to define dependencies.</p>
      )}
    </div>
  )
}
