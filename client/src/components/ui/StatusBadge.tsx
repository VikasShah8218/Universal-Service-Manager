import { humanize } from '@/lib/format'

const successStates = new Set(['HEALTHY', 'RUNNING', 'COMPLETED', 'CONNECTED', 'OK'])
const warningStates = new Set(['BACKOFF', 'DEGRADED', 'UNHEALTHY', 'BLOCKED'])
const infoStates = new Set(['STARTING', 'WAITING_DEPS', 'TRANSITIONING', 'STOPPING'])

export function StatusBadge({ state }: { state: string }) {
  const color = successStates.has(state)
    ? 'border-success/30 bg-success/12 text-success'
    : warningStates.has(state)
      ? 'border-warning/30 bg-warning/12 text-warning'
      : state === 'FAILED'
        ? 'border-danger/30 bg-danger/12 text-danger'
        : infoStates.has(state)
          ? 'border-primary/30 bg-primary/12 text-primary'
          : 'border-border bg-background/50 text-muted'
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${color}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {humanize(state)}
    </span>
  )
}
