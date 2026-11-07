import { useEffect, useState } from 'react'
import { Clock, Layers, LogOut, Menu, Monitor, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { navigation } from './navigation'
import { usePreferences } from '@/app/PreferencesProvider'
import { useAuth } from '@/features/login/AuthProvider'
import { useWorkspace } from '@/hooks/useWorkspace'
import { formatTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

export function AppLayout() {
  const { session, logout } = useAuth()
  const { preferences, update } = usePreferences()
  const query = useWorkspace()
  const [menuOpen, setMenuOpen] = useState(false)
  const [now, setNow] = useState(new Date().toISOString())
  const location = useLocation()
  const collapsed = preferences.sidebarCollapsed
  const demo = session?.mode === 'demo'
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 1000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const page = navigation.find((item) =>
      item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
    )
    document.title = `${page?.label || 'Workspace'} · USM`
  }, [location.pathname])

  const navLinks = (compact = false) =>
    navigation.map(({ to, label, icon: Icon }, index) => (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        title={compact ? label : undefined}
        aria-label={label}
        className={({ isActive }) =>
          `flex min-h-9 items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors ${compact ? 'justify-center px-0' : ''} ${index === 5 ? 'mt-5' : ''} ${isActive ? 'bg-card text-primary' : 'text-foreground/75 hover:bg-card/60 hover:text-foreground'}`
        }
      >
        <Icon className="size-[17px] shrink-0" />
        {!compact && (
          <>
            <span>{label}</span>
            {label === 'Projects' && query.data && (
              <span className="ml-auto text-[10px] text-muted">{query.data.projects.length}</span>
            )}
          </>
        )}
      </NavLink>
    ))

  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-card bg-sidebar p-3 lg:flex ${collapsed ? 'w-16' : 'w-56'}`}
      >
        <NavLink
          to="/"
          aria-label="USM overview"
          className={`mb-6 flex items-center gap-3 px-2 pt-2 ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-1.5 text-primary">
            <Layers className="size-5" />
          </div>
          {!collapsed && (
            <div>
              <span className="text-lg font-semibold">USM</span>
              <p className="mt-0.5 text-[9px] text-muted">Universal Service Manager</p>
            </div>
          )}
        </NavLink>
        {!collapsed && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-border/50 bg-background/70 p-3">
            <Monitor className="size-4 text-primary" />
            <div>
              <div className="text-xs font-medium">
                {demo ? 'Demo workspace' : 'Local workspace'}
              </div>
              <div className="mt-1 font-mono text-[9px] text-muted">
                {demo ? 'SAMPLE DATA' : query.data?.platform.toUpperCase() || 'CONNECTING'}
              </div>
            </div>
            <span
              className={`ml-auto size-1.5 rounded-full ${query.isError ? 'bg-warning' : 'bg-success'}`}
            />
          </div>
        )}
        {!collapsed && (
          <p className="mb-2 px-3 text-[9px] tracking-[.14em] text-muted/75">WORKSPACE</p>
        )}
        <nav aria-label="Main navigation" className="space-y-1">
          {navLinks(collapsed)}
        </nav>
        <div className="mt-auto pt-6">
          {!collapsed && (
            <div className="border-t border-border/50 px-2 py-4 text-[10px] text-muted">
              <div className="flex items-center justify-between">
                <span>{demo ? 'Sample environment' : 'Local manager'}</span>
                <span className="font-mono">{query.data ? `v${query.data.version}` : '—'}</span>
              </div>
              <p className="mt-2">{demo ? 'Preview actions only' : 'API token protected'}</p>
            </div>
          )}
          <Button
            variant="ghost"
            className="w-full"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => update({ sidebarCollapsed: !collapsed })}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && 'Collapse sidebar'}
          </Button>
        </div>
      </aside>
      <div className={`flex min-h-dvh min-w-0 flex-col ${collapsed ? 'lg:ml-16' : 'lg:ml-56'}`}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-card/40 px-4 sm:px-6">
          <Button
            variant="ghost"
            aria-label="Open navigation"
            className="-ml-2 lg:hidden"
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>
          <span
            className={`inline-flex items-center gap-2 rounded-full bg-sidebar/80 px-3 py-1 text-[11px] ${query.isError ? 'text-warning' : 'text-foreground/90'}`}
          >
            <span
              className={`size-1.5 rounded-full ${query.isError ? 'bg-warning' : query.isPending ? 'bg-muted' : demo ? 'bg-primary' : 'bg-success'}`}
            />
            {demo
              ? 'Demo workspace'
              : query.isError
                ? 'Manager unavailable'
                : query.isPending
                  ? 'Connecting…'
                  : 'Manager online'}
          </span>
          <span className="hidden text-xs text-muted sm:block">
            {query.data &&
              `${query.data.projects.reduce((total, project) => total + project.running, 0)} services running`}
          </span>
          <div className="ml-auto hidden items-center gap-2 font-mono text-[11px] text-muted sm:flex">
            <Clock className="size-3.5" />
            {formatTime(now)}
          </div>
          <Button
            variant="ghost"
            aria-label={demo ? 'Leave demo' : 'Disconnect from manager'}
            onClick={logout}
            className="ml-auto sm:ml-2"
          >
            <LogOut />
            <span className="hidden sm:inline">{demo ? 'Leave demo' : 'Disconnect'}</span>
          </Button>
        </header>
        {demo && (
          <div
            role="status"
            className="border-b border-primary/15 bg-primary/5 px-4 py-2 text-[11px] text-primary/90 sm:px-6"
          >
            Demo mode — sample data and simulated actions. Your real services are untouched.
          </div>
        )}
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1700px] min-w-0 flex-1 p-4 pb-8 outline-none sm:p-6"
        >
          <Outlet />
        </main>
        <footer className="flex flex-wrap justify-between gap-2 px-4 pt-2 pb-24 text-[10px] text-muted/70 sm:px-6 lg:pb-5">
          <span>
            {demo ? 'Sample workspace data' : 'Local-first service supervision'} · USM{' '}
            {query.data?.version || ''}
          </span>
          <span>Built to keep things running.</span>
        </footer>
      </div>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border/60 bg-sidebar/95 px-1 pb-[max(.3rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
      >
        {navigation.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] ${isActive ? 'text-primary' : 'text-muted'}`
            }
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
        <button
          className="flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] text-muted"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-[18px]" />
          More
        </button>
      </nav>
      <Modal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="USM workspace"
        description="Monitoring and administration"
      >
        <nav aria-label="Expanded navigation" className="space-y-1">
          {navLinks()}
        </nav>
      </Modal>
    </div>
  )
}
