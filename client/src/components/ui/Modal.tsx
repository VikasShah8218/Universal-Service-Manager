import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      previousFocus.current = document.activeElement as HTMLElement
      dialog.showModal()
    }
    if (!open && dialog.open) {
      dialog.close()
      previousFocus.current?.focus()
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={onClose}
      className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-sidebar/75 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>}
        </div>
        <Button variant="ghost" aria-label="Close dialog" onClick={onClose}>
          <X />
        </Button>
      </div>
      {children}
    </dialog>
  )
}
