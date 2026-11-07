import { useEffect, useRef, useState } from 'react'
import { Download, Pause, Play, Trash2 } from 'lucide-react'
import { useServiceLogs } from '@/hooks/useServiceLogs'
import { formatTime, downloadFile } from '@/lib/format'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/Feedback'

export function LogViewer({ project, service }: { project: string; service: string }) {
  const [paused, setPaused] = useState(false)
  const [follow, setFollow] = useState(true)
  const logs = useServiceLogs(project, service, paused)
  const output = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (follow && output.current) output.current.scrollTop = output.current.scrollHeight
  }, [logs.lines, follow])
  return (
    <Panel>
      <PanelHeader
        title="Process output"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="mr-2 flex items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={follow}
                onChange={(event) => setFollow(event.target.checked)}
                className="accent-primary"
              />
              Auto-scroll
            </label>
            <Button onClick={logs.clear} title="Clear visible lines">
              <Trash2 />
              Clear view
            </Button>
            <Button onClick={() => setPaused(!paused)} aria-pressed={paused}>
              {paused ? <Play /> : <Pause />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              onClick={() =>
                downloadFile(
                  `${project}-${service}.log`,
                  logs.lines.map((line) => `${formatTime(line.ts)} ${line.text}`).join('\n'),
                )
              }
              disabled={!logs.lines.length}
            >
              <Download />
              Download
            </Button>
          </div>
        }
      />
      {logs.error != null && (
        <div className="px-4">
          <ErrorState error={logs.error} />
        </div>
      )}
      <div
        ref={output}
        role="log"
        aria-label={`${service} output`}
        aria-live="off"
        tabIndex={0}
        className="h-[480px] overflow-auto bg-terminal p-4 font-mono text-[11px] leading-7 sm:p-5"
      >
        {logs.loading ? (
          <LoadingState label="Reading process output…" />
        ) : logs.lines.length ? (
          logs.lines.map((line) => (
            <div key={line.seq} className="flex gap-5 whitespace-pre">
              <time className="select-none text-muted/65">{formatTime(line.ts)}</time>
              <span
                className={
                  /error|failed|exception/i.test(line.text)
                    ? 'text-danger'
                    : /warn|backoff|restart/i.test(line.text)
                      ? 'text-warning'
                      : /\[usm\]/i.test(line.text)
                        ? 'text-primary'
                        : 'text-foreground/85'
                }
              >
                {line.text}
              </span>
            </div>
          ))
        ) : (
          <p className="py-12 text-center text-xs text-muted">No output in this view yet.</p>
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-border/60 px-4 py-3 text-[10px] text-muted">
        <span className="min-w-0 break-all">{logs.path || 'stdout + stderr'} · UTF-8</span>
        <span>
          {paused ? 'Paused' : 'Polling every second'} · {logs.lines.length} / 2,000 lines
        </span>
      </div>
    </Panel>
  )
}
