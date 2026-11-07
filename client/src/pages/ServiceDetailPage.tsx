import { useState } from 'react'
import { useParams, Link } from 'react-router'
import { Cpu, HeartPulse, MemoryStick, RotateCcw, Skull, Terminal } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { useService, useWorkspaceMutation } from '@/hooks/useWorkspace'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ErrorState, LoadingState } from '@/components/ui/Feedback'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ServiceActions } from '@/components/services/ServiceActions'
import { MetricCard } from '@/components/common/MetricCard'
import { formatBytes, formatUptime, humanize } from '@/lib/format'

export function ServiceDetailPage() {
  const { projectId = '', serviceId = '' } = useParams()
  const query = useService(projectId, serviceId)
  const api = useApi()
  const [confirmKill, setConfirmKill] = useState(false)
  const mutation = useWorkspaceMutation(
    (action: 'kill' | 'reset') => api.runtime.serviceAction(projectId, serviceId, action),
    'Service action requested.',
  )
  if (query.isPending) return <LoadingState label="Loading service…" />
  if (!query.data) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const { spec, status } = query.data
  const rows = [
    ['Process ID', status.pid ?? '—'],
    ['Desired state', humanize(status.desired)],
    ['Uptime', formatUptime(status.uptime_s)],
    ['Kind', humanize(status.kind)],
    ['Exit code', status.last_exit_code ?? '—'],
    ['Process origin', status.adopted ? 'Re-adopted' : 'Manager owned'],
    ['Working directory', spec.cwd || 'Project default'],
    ['Log file', status.log_path],
  ]
  return (
    <>
      <Link
        to={`/projects/${encodeURIComponent(projectId)}`}
        className="mb-4 inline-block text-[11px] text-muted hover:text-primary"
      >
        ← {projectId}
      </Link>
      <PageHeader
        title={status.name}
        description={status.message || 'Service process and supervision details.'}
        actions={
          <>
            <ServiceActions
              project={projectId}
              service={serviceId}
              stopped={status.desired === 'STOPPED'}
            />
            <Link
              to={`/logs?project=${encodeURIComponent(projectId)}&service=${encodeURIComponent(serviceId)}`}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-secondary"
            >
              <Terminal className="size-3.5" />
              View logs
            </Link>
          </>
        }
      />
      {query.isError && <ErrorState error={query.error} retry={() => void query.refetch()} />}
      {status.last_error && <ErrorState error={new Error(status.last_error)} />}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="CPU usage"
          value={status.cpu_percent == null ? '—' : `${status.cpu_percent.toFixed(1)}%`}
          hint="Whole process tree"
          icon={Cpu}
        />
        <MetricCard
          label="Memory"
          value={formatBytes(status.memory_rss)}
          hint="Resident process memory"
          icon={MemoryStick}
        />
        <MetricCard
          label="Restarts"
          value={status.restart_count}
          hint="Current manager session"
          icon={RotateCcw}
        />
        <MetricCard
          label="Health checks"
          value={spec.health_checks?.length || 0}
          hint={spec.readiness ? `${humanize(spec.readiness.type)} readiness` : 'Default readiness'}
          icon={HeartPulse}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Runtime details" actions={<StatusBadge state={status.state} />} />
          <dl className="px-4 py-2">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="flex items-start justify-between gap-5 border-b border-border/40 py-3 text-xs last:border-0"
              >
                <dt className="shrink-0 text-muted">{label}</dt>
                <dd className="min-w-0 text-right font-mono text-[11px] break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel>
          <PanelHeader
            title="Launch & policies"
            actions={
              <Link
                to={`/projects/${encodeURIComponent(projectId)}?tab=configuration`}
                className="text-[11px] text-primary"
              >
                Edit in project →
              </Link>
            }
          />
          <div className="space-y-4 p-4">
            <div>
              <p className="mb-2 text-[11px] text-muted">Command {spec.shell && '(shell)'}</p>
              <pre className="overflow-x-auto rounded-lg bg-terminal p-3 font-mono text-xs leading-6 whitespace-pre-wrap break-all">
                {Array.isArray(spec.command) ? JSON.stringify(spec.command, null, 2) : spec.command}
              </pre>
            </div>
            <dl className="space-y-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted">Restart policy</dt>
                <dd>{humanize(spec.restart_policy?.mode || 'on_failure')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Restart attempts / window</dt>
                <dd>
                  {spec.restart_policy?.max ?? 5} / {spec.restart_policy?.window_s ?? 600}s
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Graceful stop timeout</dt>
                <dd>{spec.stop_policy?.timeout_s ?? 10}s</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
              <Button onClick={() => mutation.mutate('reset')} pending={mutation.isPending}>
                <RotateCcw />
                Reset & start
              </Button>
              <Button
                variant="danger"
                disabled={!status.pid || mutation.isPending}
                onClick={() => setConfirmKill(true)}
              >
                <Skull />
                Force kill tree
              </Button>
            </div>
          </div>
        </Panel>
      </div>
      <Modal
        open={confirmKill}
        onClose={() => !mutation.isPending && setConfirmKill(false)}
        title="Force kill this service?"
        description="This immediately terminates the process tree without a graceful shutdown."
      >
        <p className="text-xs leading-relaxed text-warning">
          The restart policy can start it again. Use Stop to keep a service stopped.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setConfirmKill(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            pending={mutation.isPending}
            onClick={async () => {
              try {
                await mutation.mutateAsync('kill')
                setConfirmKill(false)
              } catch {
                /* Mutation shows feedback. */
              }
            }}
          >
            Force kill
          </Button>
        </div>
      </Modal>
    </>
  )
}
