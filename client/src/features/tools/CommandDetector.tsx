import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ScanSearch } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Feedback'

export function CommandDetector() {
  const api = useApi()
  const [base, setBase] = useState('')
  const [cwd, setCwd] = useState('')
  const query = useMutation({ mutationFn: () => api.tools.detect(base, cwd || undefined) })
  function submit(event: FormEvent) {
    event.preventDefault()
    query.mutate()
  }
  return (
    <Panel>
      <PanelHeader
        title={
          <>
            <ScanSearch className="size-4 text-primary" />
            Command detection
          </>
        }
      />
      <form onSubmit={submit} className="space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted">
          Suggest commands from Python, Node, Rust, or Go project files. Nothing is executed.
        </p>
        <label>
          <span className="field-label">Project directory</span>
          <input
            required
            className="field"
            value={base}
            onChange={(event) => setBase(event.target.value)}
            placeholder="D:/Projects/my-app"
          />
        </label>
        <label>
          <span className="field-label">Service subdirectory (optional)</span>
          <input
            className="field"
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            placeholder="api"
          />
        </label>
        <Button type="submit" pending={query.isPending}>
          Detect commands
        </Button>
        {query.error && <ErrorState error={query.error} />}
        {query.data && (
          <div className="space-y-2">
            {query.data.suggestions.map((suggestion, index) => (
              <div key={index} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <pre className="overflow-x-auto font-mono text-xs text-primary">
                  {JSON.stringify(suggestion.command)}
                </pre>
                <p className="mt-2 text-[11px] text-muted">{suggestion.note}</p>
              </div>
            ))}
            {!query.data.suggestions.length && (
              <p role="status" className="text-xs text-muted">
                {query.data.exists ? 'No supported entry points found.' : 'Directory not found.'}
              </p>
            )}
          </div>
        )}
      </form>
    </Panel>
  )
}
