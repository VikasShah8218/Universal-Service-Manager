import type { ReactNode } from 'react'

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-panel border border-foreground/10 bg-card ${className}`}
    >
      {children}
    </section>
  )
}

export function PanelHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
      <h2 className="flex items-center gap-2 text-sm font-medium">{title}</h2>
      {actions}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[23px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
