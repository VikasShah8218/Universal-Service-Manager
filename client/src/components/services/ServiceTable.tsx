import { useState } from 'react'
import { Search, Terminal } from 'lucide-react'
import { Link } from 'react-router'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatBytes, formatUptime } from '@/lib/format'
import { ServiceActions } from './ServiceActions'
import type { ServiceRow } from '@/types/runtime'

export function ServiceTable({
  services,
  title = 'Services',
}: {
  services: ServiceRow[]
  title?: string
}) {
  const [search, setSearch] = useState('')
  const [state, setState] = useState('all')
  const filtered = services.filter(
    (service) =>
      `${service.name} ${service.id} ${service.projectName}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (state === 'all' || service.state === state),
  )
  return (
    <Panel>
      <PanelHeader
        title={
          <>
            {title}
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted">
              {services.length}
            </span>
          </>
        }
        actions={
          <div className="flex w-full gap-2 sm:w-auto">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5">
              <Search className="size-3.5 shrink-0 text-muted" />
              <input
                aria-label="Search services"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search services…"
                className="w-full min-w-0 bg-transparent py-2 text-xs outline-none sm:w-36"
              />
            </label>
            <select
              aria-label="Filter service status"
              value={state}
              onChange={(event) => setState(event.target.value)}
              className="rounded-md border bg-background px-2 text-xs"
            >
              <option value="all">All statuses</option>
              {[...new Set(services.map((service) => service.state))].sort().map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap">
          <thead>
            <tr>
              {[
                'Service',
                'Project',
                'Status',
                'PID',
                'CPU',
                'Memory',
                'Uptime',
                'Restarts',
                'Actions',
              ].map((label) => (
                <th key={label} className="table-header">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((service) => (
              <tr key={`${service.projectId}/${service.id}`} className="hover:bg-secondary/25">
                <td className="table-cell">
                  <Link
                    className="flex items-center gap-2 text-foreground hover:text-primary"
                    to={`/projects/${encodeURIComponent(service.projectId)}/services/${encodeURIComponent(service.id)}`}
                  >
                    <span className="rounded border border-primary/20 bg-primary/5 p-1.5 text-primary">
                      <Terminal className="size-3" />
                    </span>
                    {service.name}
                  </Link>
                </td>
                <td className="table-cell">
                  <Link
                    className="hover:text-primary"
                    to={`/projects/${encodeURIComponent(service.projectId)}`}
                  >
                    {service.projectName}
                  </Link>
                </td>
                <td className="table-cell">
                  <StatusBadge state={service.state} />
                </td>
                <td className="table-cell font-mono text-[11px]">{service.pid ?? '—'}</td>
                <td className="table-cell font-mono text-[11px]">
                  {service.cpu_percent == null ? '—' : `${service.cpu_percent.toFixed(1)}%`}
                </td>
                <td className="table-cell font-mono text-[11px]">
                  {formatBytes(service.memory_rss)}
                </td>
                <td className="table-cell font-mono text-[11px]">
                  {formatUptime(service.uptime_s)}
                </td>
                <td className="table-cell font-mono text-[11px]">{service.restart_count}</td>
                <td className="table-cell">
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/logs?project=${encodeURIComponent(service.projectId)}&service=${encodeURIComponent(service.id)}`}
                      aria-label={`View ${service.name} logs`}
                      className="rounded-md p-2 hover:bg-secondary hover:text-primary"
                    >
                      <Terminal className="size-3.5" />
                    </Link>
                    <ServiceActions
                      project={service.projectId}
                      service={service.id}
                      stopped={service.desired === 'STOPPED'}
                      compact
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="p-10 text-center text-xs text-muted">
            {services.length
              ? 'No services match your filters.'
              : 'No services configured yet. Add one in the project configuration.'}
          </p>
        )}
      </div>
      <div className="border-t border-border/60 px-4 py-3 text-[10px] text-muted">
        Showing {filtered.length} of {services.length} services · Resource usage includes the
        process tree
      </div>
    </Panel>
  )
}
