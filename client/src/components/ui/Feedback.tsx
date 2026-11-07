import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react'
import { errorMessage } from '@/lib/format'
import { Button } from './Button'

export function LoadingState({ label = 'Loading workspace…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <LoaderCircle className="size-4 animate-spin" />
      {label}
    </div>
  )
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div
      role="alert"
      className="my-4 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
    >
      <AlertCircle className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{errorMessage(error)}</span>
      {retry && <Button onClick={retry}>Try again</Button>}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
      <Inbox className="size-7 text-muted" />
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="max-w-md text-xs leading-relaxed text-muted">{description}</p>
      {children}
    </div>
  )
}
