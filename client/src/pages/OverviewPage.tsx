import { Activity, ArrowRight, Cpu, Folder, Layers, Plus, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useApi } from '@/features/login/AuthProvider'
import { useWorkspace, serviceRows } from '@/hooks/useWorkspace'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState, EmptyState } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { MetricCard } from '@/components/common/MetricCard'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { ServiceTable } from '@/components/services/ServiceTable'
import { InstancePanel } from '@/components/common/InstancePanel'
import { EventList } from '@/components/common/EventList'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { formatBytes } from '@/lib/format'

export function OverviewPage() {
  const query = useWorkspace()
  const api = useApi()
  const events = useQuery({
    queryKey: ['events', 'overview'],
    queryFn: ({ signal }) => api.events.list({ limit: 3 }, signal),
    refetchInterval: 5000,
  })
  const [creating, setCreating] = useState(false)
  const rows = serviceRows(query.data?.projects)
  const attention = rows.filter((service) =>
    ['FAILED', 'BACKOFF', 'UNHEALTHY', 'BLOCKED'].includes(service.state),
  ).length
  const cpuKnown = rows.some((service) => service.cpu_percent != null)
  const memoryKnown = rows.some((service) => service.memory_rss != null)
  return (
    <>
      <PageHeader
        title="Workspace overview"
        description="A clear view of your projects and the services behind them."
        actions={
          <>
            <Button
              pending={query.isFetching}
              onClick={() => {
                void query.refetch()
                void events.refetch()
              }}
            >
              <RefreshCw />
              Refresh
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus />
              New project
            </Button>
          </>
        }
      />
      {query.isPending ? (
        <LoadingState />
      ) : query.data ? (
        <div className="space-y-6">
          {query.isError && <ErrorState error={query.error} retry={() => void query.refetch()} />}
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Projects"
              value={query.data.projects.length}
              hint="Across your local workspace"
              icon={Folder}
            />
            <MetricCard
              label="Running services"
              value={`${query.data.projects.reduce((sum, project) => sum + project.running, 0)} / ${rows.length}`}
              hint="Processes currently running"
              icon={Layers}
              tone="success"
            />
            <MetricCard
              label="Needs attention"
              value={attention}
              hint={attention ? 'Inspect service health & restarts' : 'No service issues reported'}
              icon={Activity}
              tone={attention ? 'warning' : 'success'}
            />
            <MetricCard
              label="CPU usage"
              value={
                cpuKnown
                  ? `${rows.reduce((sum, service) => sum + (service.cpu_percent || 0), 0).toFixed(1)}%`
                  : '—'
              }
              hint={`${formatBytes(memoryKnown ? rows.reduce((sum, service) => sum + (service.memory_rss || 0), 0) : null)} process memory`}
              icon={Cpu}
            />
          </div>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">
                Your projects{' '}
                <span className="ml-1 text-xs text-muted">({query.data.projects.length})</span>
              </h2>
              <Link to="/projects" className="flex items-center gap-2 text-[11px] text-primary">
                View all projects <ArrowRight className="size-3" />
              </Link>
            </div>
            {query.data.projects.length ? (
              <div className="grid gap-4 xl:grid-cols-3">
                {query.data.projects.slice(0, 3).map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Your workspace starts here"
                description="Create a project, add your services, and start observing them from one place."
              >
                <Button onClick={() => setCreating(true)}>
                  <Plus />
                  Create your first project
                </Button>
              </EmptyState>
            )}
          </section>
          <ServiceTable services={rows.slice(0, 5)} title="Service activity" />
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Panel>
              <PanelHeader
                title="Recent events"
                actions={
                  <Link to="/events" className="text-[11px] text-primary">
                    View all →
                  </Link>
                }
              />
              {events.isError ? (
                <div className="p-4">
                  <ErrorState error={events.error} retry={() => void events.refetch()} />
                </div>
              ) : events.isPending ? (
                <LoadingState label="Loading events…" />
              ) : (
                <EventList events={events.data} />
              )}
            </Panel>
            <InstancePanel status={query.data} />
          </div>
        </div>
      ) : (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New project"
        description="Group related services and configure how they run."
        wide
      >
        {creating && (
          <ProjectForm onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
        )}
      </Modal>
    </>
  )
}
