import type { ReactNode } from 'react'
import { Palette, ShieldCheck } from 'lucide-react'
import { usePreferences, type Preferences } from '@/app/PreferencesProvider'
import { useAuth } from '@/features/login/AuthProvider'
import { useWorkspace } from '@/hooks/useWorkspace'
import { PageHeader, Panel, PanelHeader } from '@/components/ui/Panel'
import { InstancePanel } from '@/components/common/InstancePanel'
import { Button } from '@/components/ui/Button'

function Setting({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 py-4 last:border-0">
      <div className="max-w-sm">
        <h3 className="text-xs font-medium">{title}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}

export function SettingsPage() {
  const { preferences, update } = usePreferences()
  const { session, logout } = useAuth()
  const workspace = useWorkspace()
  return (
    <>
      <PageHeader
        title="Settings"
        description="Personalize this interface and review your local connection."
      />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title={
              <>
                <Palette className="size-4 text-primary" />
                Appearance & refresh
              </>
            }
          />
          <div className="px-4">
            <Setting
              title="Theme"
              description="Theme tokens are controlled centrally in styles/theme.css."
            >
              <select
                className="field w-auto"
                aria-label="Interface theme"
                value={preferences.theme}
                onChange={(event) => update({ theme: event.target.value as Preferences['theme'] })}
              >
                <option value="dusk">Dusk slate</option>
                <option value="graphite">Graphite</option>
              </select>
            </Setting>
            <Setting
              title="Accent color"
              description="Applied to primary actions, focus rings, and navigation."
            >
              <select
                className="field w-auto"
                aria-label="Accent color"
                value={preferences.accent}
                onChange={(event) =>
                  update({ accent: event.target.value as Preferences['accent'] })
                }
              >
                <option value="cyan">Frost cyan</option>
                <option value="teal">Soft teal</option>
              </select>
            </Setting>
            <Setting
              title="Status refresh"
              description="How often project and service status is requested."
            >
              <select
                className="field w-auto"
                aria-label="Refresh interval"
                value={preferences.refreshSeconds}
                onChange={(event) => update({ refreshSeconds: Number(event.target.value) })}
              >
                {[2, 3, 5, 10].map((value) => (
                  <option key={value} value={value}>
                    {value} seconds
                  </option>
                ))}
              </select>
            </Setting>
            <Setting title="Compact sidebar" description="Use an icon rail on desktop.">
              <input
                aria-label="Compact sidebar"
                type="checkbox"
                checked={preferences.sidebarCollapsed}
                onChange={(event) => update({ sidebarCollapsed: event.target.checked })}
                className="size-4 accent-primary"
              />
            </Setting>
          </div>
          <p className="border-t border-border/60 p-4 text-[11px] text-muted">
            Preferences save automatically in this browser. They do not change the manager.
          </p>
        </Panel>
        <Panel>
          <PanelHeader
            title={
              <>
                <ShieldCheck className="size-4 text-success" />
                Connection & access
              </>
            }
          />
          <div className="p-4">
            <Setting
              title="Workspace mode"
              description={
                session?.mode === 'demo'
                  ? 'Simulated data only; no daemon connection.'
                  : 'Authenticated to the local manager through the same-origin API proxy.'
              }
            >
              <span className="text-xs text-primary">
                {session?.mode === 'demo' ? 'Demo' : 'Live'}
              </span>
            </Setting>
            <Setting
              title="Token storage"
              description="Memory by default; optional tab-scoped session storage at login. Tokens are never stored in localStorage."
            >
              <ShieldCheck className="size-4 text-success" />
            </Setting>
            <Setting
              title="End this session"
              description="Clear the connection token and cached workspace data."
            >
              <Button onClick={logout}>
                {session?.mode === 'demo' ? 'Leave demo' : 'Disconnect'}
              </Button>
            </Setting>
          </div>
        </Panel>
        {workspace.data && <InstancePanel status={workspace.data} />}
        <Panel>
          <PanelHeader title="Manager configuration" />
          <div className="space-y-3 p-4 text-xs leading-relaxed text-muted">
            <p>
              Daemon settings such as API port, database location, watchdog, and shutdown behavior
              are configured in <code className="text-foreground">service_manager/.env</code>.
            </p>
            <p>
              There is no manager-settings API. This screen only changes interface preferences.
              Per-service restart, stop, log, and probe policies are editable in each project.
            </p>
            <p>
              Production hosting must proxy <code className="text-foreground">/api</code> to the
              local daemon.
            </p>
          </div>
        </Panel>
      </div>
    </>
  )
}
