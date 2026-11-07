import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface Preferences {
  theme: 'dusk' | 'graphite'
  accent: 'cyan' | 'teal'
  refreshSeconds: number
  sidebarCollapsed: boolean
}
const defaults: Preferences = {
  theme: 'dusk',
  accent: 'cyan',
  refreshSeconds: 3,
  sidebarCollapsed: false,
}
const storageKey = 'usm.preferences.v1'

function loadPreferences(): Preferences {
  try {
    const saved: Partial<Preferences> = JSON.parse(localStorage.getItem(storageKey) || '{}')
    return {
      theme: saved.theme === 'graphite' ? 'graphite' : 'dusk',
      accent: saved.accent === 'teal' ? 'teal' : 'cyan',
      refreshSeconds: [2, 3, 5, 10].includes(saved.refreshSeconds || 0) ? saved.refreshSeconds! : 3,
      sidebarCollapsed: saved.sidebarCollapsed === true,
    }
  } catch {
    return defaults
  }
}

const PreferencesContext = createContext<{
  preferences: Preferences
  update: (values: Partial<Preferences>) => void
} | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences)
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
    document.documentElement.dataset.accent = preferences.accent
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences))
    } catch {
      /* Preferences still work when storage is unavailable. */
    }
  }, [preferences])
  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        update: (values) => setPreferences((previous) => ({ ...previous, ...values })),
      }}
    >
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences must be inside PreferencesProvider')
  return context
}
