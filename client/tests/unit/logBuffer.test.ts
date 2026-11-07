import { describe, expect, it } from 'vitest'
import { MAX_LOG_LINES, mergeLogPage } from '@/features/logs/logBuffer'
import type { LogLine } from '@/types/observability'

const line = (seq: number): LogLine => ({ seq, ts: 1000 + seq, text: `line ${seq}` })

describe('live log cursor', () => {
  it('consumes returned lines rather than skipping to the server high watermark', () => {
    const result = mergeLogPage(
      [line(1)],
      { last_seq: 9000, log_path: '', lines: [line(2), line(3)] },
      1,
    )
    expect(result.cursor).toBe(3)
    expect(result.more).toBe(true)
    expect(result.lines.map((item) => item.seq)).toEqual([1, 2, 3])
  })

  it('deduplicates overlapping pages', () => {
    const result = mergeLogPage(
      [line(1), line(2)],
      { last_seq: 3, log_path: '', lines: [line(2), line(3)] },
      2,
    )
    expect(result.lines.map((item) => item.seq)).toEqual([1, 2, 3])
  })

  it('recognizes sequence rollback and clears old-manager lines', () => {
    const result = mergeLogPage([line(100)], { last_seq: 3, log_path: '', lines: [] }, 100)
    expect(result.restarted).toBe(true)
    expect(result.lines).toEqual([])
    expect(result.cursor).toBeUndefined()
  })

  it('bounds memory for a long-running live view', () => {
    const current = Array.from({ length: MAX_LOG_LINES }, (_, index) => line(index + 1))
    const result = mergeLogPage(
      current,
      { last_seq: MAX_LOG_LINES + 1, log_path: '', lines: [line(MAX_LOG_LINES + 1)] },
      MAX_LOG_LINES,
    )
    expect(result.lines).toHaveLength(MAX_LOG_LINES)
    expect(result.lines[0].seq).toBe(2)
  })

  it('retains the cursor when there are no new lines', () => {
    const result = mergeLogPage([line(5)], { last_seq: 5, log_path: '', lines: [] }, 5)
    expect(result.cursor).toBe(5)
    expect(result.more).toBe(false)
  })
})
