import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { useWorkspace } from '@/hooks/useWorkspace'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/Feedback'
import { EventList } from '@/components/common/EventList'
import { formatTime } from '@/lib/format'

export function EventsPage() {
  const api = useApi()
  const workspace = useWorkspace()
  const [tab, setTab] = useState<'events' | 'audit'>('events')
  const [project, setProject] = useState('')
  const [service, setService] = useState('')
  const events = useQuery({
    queryKey: ['events', project, service],
    queryFn: ({ signal }) =>
      api.events.list(
        { project: project || undefined, service: service || undefined, limit: 100 },
        signal,
      ),
    enabled: tab === 'events',
    refetchInterval: 5000,
  })
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: ({ signal }) => api.events.audit(signal),
    enabled: tab === 'audit',
    refetchInterval: 5000,
  })
  const selected = tab === 'events' ? events : audit
  return (
    <>
      <PageHeader
        title="Events & audit"
        description="A timeline of service changes and workspace actions."
        actions={
          <Button pending={selected.isFetching} onClick={() => void selected.refetch()}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />
      <div className="mb-5 flex gap-5 border-b border-border/70">
        {(['events', 'audit'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`border-b-2 pb-3 text-xs ${value === tab ? 'border-primary text-primary' : 'border-transparent text-muted'}`}
          >
            {value === 'events' ? 'Service events' : 'Audit trail'}
          </button>
        ))}
      </div>
      {tab === 'events' && (
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            aria-label="Filter events by project"
            className="field w-auto"
            value={project}
            onChange={(event) => {
              setProject(event.target.value)
              setService('')
            }}
          >
            <option value="">All projects</option>
            {workspace.data?.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter events by service"
            className="field w-auto"
            value={service}
            onChange={(event) => setService(event.target.value)}
            disabled={!project}
          >
            <option value="">All services</option>
            {workspace.data?.projects
              .find((item) => item.id === project)
              ?.services.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </div>
      )}
      <Panel>
        <PanelHeader
          title={tab === 'events' ? 'Recent events' : 'Workspace audit'}
          actions={<span className="text-[11px] text-muted">Last 100 records · Local time</span>}
        />
        {selected.isError && (
          <div className="px-4">
            <ErrorState error={selected.error} retry={() => void selected.refetch()} />
          </div>
        )}
        {selected.isPending ? (
          <LoadingState />
        ) : tab === 'events' ? (
          <EventList events={events.data || []} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr>
                  {['Time', 'Actor', 'Action', 'Target', 'Outcome'].map((label) => (
                    <th key={label} className="table-header">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...(audit.data || [])].reverse().map((item) => (
                  <tr key={item.id}>
                    <td
                      className="table-cell font-mono text-[11px]"
                      title={new Date(item.ts).toLocaleString()}
                    >
                      {formatTime(item.ts)}
                    </td>
                    <td className="table-cell">{item.actor}</td>
                    <td className="table-cell text-foreground">{item.action}</td>
                    <td className="table-cell" title={item.detail || undefined}>
                      {item.target}
                    </td>
                    <td
                      className={`table-cell ${item.outcome === 'ok' ? 'text-success' : 'text-warning'}`}
                    >
                      {item.outcome}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {audit.data?.length === 0 && (
              <p className="p-8 text-center text-xs text-muted">No audit records yet.</p>
            )}
          </div>
        )}
      </Panel>
    </>
  )
}
