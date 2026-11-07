import { Activity, RefreshCw } from 'lucide-react'
import { formatTime } from '@/lib/format'
import type { ServiceEvent } from '@/types/observability'

export function EventList({ events }: { events: ServiceEvent[] }) {
  if (!events.length)
    return <p className="p-8 text-center text-xs text-muted">No events recorded yet.</p>
  return (
    <ul className="px-4">
      {[...events].reverse().map((event) => {
        const warning = /failed|backoff|unhealthy|error/i.test(event.message)
        return (
          <li
            key={event.id}
            className="flex items-start gap-3 border-b border-border/40 py-3.5 last:border-0"
          >
            <div
              className={`mt-0.5 rounded-full p-2 ${warning ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}
            >
              {warning ? <RefreshCw className="size-3" /> : <Activity className="size-3" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-relaxed break-words">{event.message}</p>
              <p className="mt-1 text-[11px] text-muted">
                {[event.project_id, event.service_id].filter(Boolean).join(' / ') || 'Manager'} ·{' '}
                {event.kind}
              </p>
            </div>
            <time
              dateTime={event.ts}
              title={new Date(event.ts).toLocaleString()}
              className="mt-1 shrink-0 font-mono text-[10px] text-muted"
            >
              {formatTime(event.ts)}
            </time>
          </li>
        )
      })}
    </ul>
  )
}
