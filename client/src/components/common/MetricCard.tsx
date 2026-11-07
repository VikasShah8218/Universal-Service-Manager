import type { LucideIcon } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'info',
}: {
  label: string
  value: string | number
  hint: string
  icon: LucideIcon
  tone?: 'info' | 'success' | 'warning'
}) {
  const color = {
    info: 'bg-primary/12 text-primary',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/12 text-warning',
  }[tone]
  return (
    <Panel className="flex items-center gap-3 px-4 py-5">
      <div className={`grid size-10 shrink-0 place-items-center rounded-lg ${color}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <div className="mt-1 text-[25px] leading-tight font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{hint}</p>
      </div>
    </Panel>
  )
}
