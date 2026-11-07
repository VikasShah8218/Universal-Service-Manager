import { Activity, Folder, LayoutDashboard, Layers, Settings, Terminal, Wrench } from 'lucide-react'

export const navigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: Folder },
  { to: '/services', label: 'Services', icon: Layers },
  { to: '/logs', label: 'Logs', icon: Terminal },
  { to: '/events', label: 'Events & audit', icon: Activity },
  { to: '/tools', label: 'Tools', icon: Wrench },
  { to: '/settings', label: 'Settings', icon: Settings },
]
