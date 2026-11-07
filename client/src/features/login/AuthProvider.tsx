import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { createApi, type Api } from '@/api'
import { createHttpClient } from '@/api/http'
import { createLazyDemoTransport } from '@/demo/lazyTransport'
import { queryClient } from '@/app/queryClient'
import type { Session } from '@/types/session'
import { readSession, storeSession } from './sessionStorage'

interface AuthContextValue {
  session: Session | null
  api: Api | null
  login: (token: string, remember: boolean) => Promise<void>
  enterDemo: () => void
  logout: () => void
}
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(readSession)
  const clearSession = useCallback(() => {
    setSession(null)
    storeSession(null)
    queryClient.clear()
  }, [])

  const api = useMemo(
    () =>
      session
        ? createApi(
            createHttpClient(
              session,
              () => {
                clearSession()
                toast.error('Your manager token was rejected. Please connect again.')
              },
              session.mode === 'demo' ? createLazyDemoTransport() : undefined,
            ),
          )
        : null,
    [session, clearSession],
  )

  async function login(token: string, remember: boolean) {
    const next: Session = { mode: 'live', token: token.trim() }
    // Do not establish a session until a protected request verifies the token.
    await createApi(createHttpClient(next, () => {})).system.status()
    queryClient.clear()
    storeSession(next, remember)
    setSession(next)
  }

  function enterDemo() {
    queryClient.clear()
    storeSession(null)
    setSession({ mode: 'demo', token: '' })
  }

  return (
    <AuthContext.Provider value={{ session, api, login, enterDemo, logout: clearSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be inside AuthProvider')
  return value
}

export function useApi(): Api {
  const { api } = useAuth()
  if (!api) throw new Error('API access requires an authenticated session')
  return api
}
