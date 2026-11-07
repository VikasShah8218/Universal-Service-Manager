import type { Session } from '@/types/session'

const key = 'usm.session.v1'

export function readSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as Session | null
    if (value?.mode === 'live' && typeof value.token === 'string' && value.token) return value
    if (value?.mode === 'demo') return { mode: 'demo', token: '' }
  } catch {
    /* Invalid or unavailable storage starts an unauthenticated session. */
  }
  return null
}

export function storeSession(session: Session | null, remember = false) {
  try {
    sessionStorage.removeItem(key)
    if (session && remember) sessionStorage.setItem(key, JSON.stringify(session))
  } catch {
    /* A memory-only session still works. */
  }
}
