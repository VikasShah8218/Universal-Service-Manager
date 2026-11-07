import { Monitor, ShieldCheck } from 'lucide-react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { formatUptime, humanize } from '@/lib/format'
import type { SystemStatus } from '@/types/runtime'

export function InstancePanel({ status }: { status: SystemStatus }) {
  const rows = [
    ['Platform', humanize(status.platform)],
    ['Manager version', `v${status.version}`],
    ['Manager uptime', formatUptime((Date.now() - new Date(status.started_at).getTime()) / 1000)],
    ['API route', '/api/v1'],
    ['Workspace', `${status.projects.length} projects`],
  ]
  return (
    <Panel>
      <PanelHeader
        title={
          <>
            <Monitor className="size-4 text-muted" />
            Local instance
          </>
        }
      />
      <dl className="px-4 py-2">
        {rows.map(([key, value]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 border-b border-border/40 py-2.5 text-xs last:border-0"
          >
            <dt className="text-muted">{key}</dt>
            <dd className="text-right font-mono text-[11px]">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="flex items-center gap-2 border-t border-border/60 p-4 text-[11px] text-muted">
        <ShieldCheck className="size-3.5 shrink-0 text-success" />
        Services run under the manager’s OS account.
      </p>
    </Panel>
  )
}
