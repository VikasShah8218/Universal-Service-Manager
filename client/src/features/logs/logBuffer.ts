import type { LogLine, LogsResponse } from '@/types/observability'

export const MAX_LOG_LINES = 2000

export function mergeLogPage(current: LogLine[], page: LogsResponse, cursor: number | undefined) {
  const restarted = cursor !== undefined && page.last_seq < cursor
  const existing = restarted ? [] : current
  const seen = new Set(existing.map((line) => line.seq))
  const lines = [...existing, ...page.lines.filter((line) => !seen.has(line.seq))].slice(
    -MAX_LOG_LINES,
  )
  // last_seq is the server high watermark; the last returned line is the consumed cursor.
  const nextCursor = page.lines.at(-1)?.seq ?? (restarted ? undefined : (cursor ?? page.last_seq))
  return {
    lines,
    cursor: nextCursor,
    restarted,
    more: nextCursor !== undefined && nextCursor < page.last_seq,
  }
}
