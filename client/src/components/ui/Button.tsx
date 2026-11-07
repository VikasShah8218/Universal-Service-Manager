import type { ButtonHTMLAttributes } from 'react'
import { LoaderCircle } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  pending?: boolean
}

const variants = {
  primary: 'border-primary bg-primary text-primary-foreground hover:bg-primary/85',
  secondary: 'border-border bg-background/40 text-foreground hover:bg-secondary',
  ghost: 'border-transparent text-muted hover:bg-secondary hover:text-foreground',
  danger: 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20',
}

export function Button({
  variant = 'secondary',
  pending,
  disabled,
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      className={`inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 [&_svg]:size-3.5 ${variants[variant]} ${className}`}
      {...props}
    >
      {pending && <LoaderCircle className="animate-spin" />}
      {children}
    </button>
  )
}
