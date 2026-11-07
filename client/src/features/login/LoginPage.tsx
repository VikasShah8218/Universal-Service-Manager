import { useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  LockKeyhole,
  Monitor,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from './AuthProvider'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Feedback'
import { ApiError } from '@/api/http'

export function LoginPage() {
  const { session, login, enterDemo } = useAuth()
  const [token, setToken] = useState('')
  const [remember, setRemember] = useState(false)
  const [visible, setVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const requested = (location.state as { from?: string } | null)?.from
  const destination =
    requested?.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/login')
      ? requested
      : '/'
  if (session) return <Navigate to={destination} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await login(token, remember)
      navigate(destination, { replace: true })
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 401
          ? new Error(
              'That token was not accepted. Copy the current token from the manager and try again.',
            )
          : failure,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 bg-sidebar p-10 lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-primary/25 bg-primary/10 p-2.5 text-primary">
            <Layers className="size-6" />
          </div>
          <div>
            <span className="text-lg font-semibold">USM</span>
            <p className="text-xs text-muted">Universal Service Manager</p>
          </div>
        </div>
        <div className="my-16 max-w-lg">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-[11px] text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            Your local control room
          </span>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight xl:text-[44px]">
            Everything running.
            <br />
            <span className="text-primary">Everything in view.</span>
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-muted">
            One quiet workspace for your projects, processes, and the services that keep them
            connected.
          </p>
          <div className="mt-10 space-y-3">
            {[
              {
                icon: Monitor,
                name: 'Your machine, your workspace',
                detail: 'A local manager with no cloud dependency.',
              },
              {
                icon: ShieldCheck,
                name: 'Built for steady operation',
                detail: 'Health checks, dependency order, and recovery.',
              },
              {
                icon: Terminal,
                name: 'A clear view of every service',
                detail: 'Process state, resource usage, logs, and history.',
              },
            ].map(({ icon: Icon, name, detail }) => (
              <div
                key={name}
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/35 p-4"
              >
                <Icon className="size-5 text-primary/80" />
                <div>
                  <h2 className="text-xs font-medium">{name}</h2>
                  <p className="mt-1 text-xs text-muted">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted/75">
          Local-first · Technology-agnostic · Always observable
        </p>
      </section>
      <section className="flex min-h-dvh items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-7 inline-flex rounded-xl border border-primary/20 bg-primary/10 p-3 text-primary">
            <LockKeyhole className="size-6" />
          </div>
          <p className="mb-2 text-[10px] font-medium tracking-[.18em] text-muted uppercase">
            Local workspace access
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">Connect to your manager</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Use your local API token to open the workspace.
          </p>
          <form onSubmit={submit} className="mt-8">
            <label htmlFor="api-token" className="field-label">
              Manager API token
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-3 left-3 size-4 text-muted" />
              <input
                id="api-token"
                type={visible ? 'text' : 'password'}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste your API token"
                autoComplete="off"
                spellCheck={false}
                required
                disabled={pending}
                className="field pr-11 pl-10"
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? 'Hide token' : 'Show token'}
                className="absolute top-0 right-0 flex h-full w-10 items-center justify-center text-muted hover:text-primary"
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Find it in{' '}
              <code className="rounded bg-card px-1 py-0.5">service_manager/data/token</code> after
              starting the manager.
            </p>
            <label className="mt-5 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="accent-primary"
              />
              Keep me connected in this tab
            </label>
            {error != null && <ErrorState error={error} />}
            <Button type="submit" variant="primary" pending={pending} className="mt-6 w-full py-3">
              Connect to workspace <ArrowRight />
            </Button>
          </form>
          <div className="my-7 flex items-center gap-3">
            <span className="h-px flex-1 bg-border/60" />
            <span className="text-[11px] text-muted">Just looking around?</span>
            <span className="h-px flex-1 bg-border/60" />
          </div>
          <Button
            onClick={() => {
              enterDemo()
              navigate(destination, { replace: true })
            }}
            className="w-full py-3"
            disabled={pending}
          >
            Explore demo workspace <ArrowRight />
          </Button>
          <p className="mt-3 text-center text-[11px] text-muted">
            Sample data only. No connection to your running services.
          </p>
          <div className="mt-9 flex items-center justify-center gap-2 text-[11px] text-muted/75">
            <ShieldCheck className="size-3.5" />
            Local access · Token protected
          </div>
        </div>
      </section>
    </main>
  )
}
