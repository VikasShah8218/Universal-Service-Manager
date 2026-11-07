import { useEffect, useRef, useState } from 'react'
import { useApi } from '@/features/login/AuthProvider'
import { mergeLogPage } from '@/features/logs/logBuffer'
import type { LogLine } from '@/types/observability'

export function useServiceLogs(project: string, service: string, paused: boolean) {
  const api = useApi()
  const [lines, setLines] = useState<LogLine[]>([])
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [path, setPath] = useState('')
  const buffer = useRef<LogLine[]>([])
  const cursor = useRef<number | undefined>(undefined)

  useEffect(() => {
    buffer.current = []
    cursor.current = undefined
    setLines([])
    setError(null)
    setPath('')
    setLoading(true)
  }, [project, service, api])
  useEffect(() => {
    if (!project || !service || paused) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
          const page = await api.logs.read(project, service, cursor.current, abort.signal)
          if (abort.signal.aborted) return
          const merged = mergeLogPage(buffer.current, page, cursor.current)
          if (merged.restarted) {
            cursor.current = undefined
            buffer.current = []
            continue
          }
          buffer.current = merged.lines
          cursor.current = merged.cursor
          setLines(merged.lines)
          setPath(page.log_path)
          setError(null)
          if (!merged.more) break
        }
      } catch (failure) {
        if (!abort.signal.aborted) setError(failure)
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false)
          timer = setTimeout(poll, 1000)
        }
      }
    }
    void poll()
    return () => {
      abort.abort()
      clearTimeout(timer)
    }
  }, [api, project, service, paused])

  return {
    lines,
    error,
    loading,
    path,
    clear: () => {
      buffer.current = []
      setLines([])
    },
  }
}
