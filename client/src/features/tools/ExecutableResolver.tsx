import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Terminal } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Feedback'

export function ExecutableResolver() {
  const api = useApi()
  const [name, setName] = useState('python')
  const [cwd, setCwd] = useState('')
  const query = useMutation({
    mutationFn: () => api.tools.resolveExecutable(name, cwd || undefined),
  })
  function submit(event: FormEvent) {
    event.preventDefault()
    query.mutate()
  }
  return (
    <Panel>
      <PanelHeader
        title={
          <>
            <Terminal className="size-4 text-primary" />
            Executable resolution
          </>
        }
      />
      <form onSubmit={submit} className="space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted">
          Resolve a command using the manager’s PATH and working directory.
        </p>
        <label>
          <span className="field-label">Executable name or path</span>
          <input
            className="field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="python, npm, or a full path"
          />
        </label>
        <label>
          <span className="field-label">Working directory (optional)</span>
          <input
            className="field"
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            placeholder="D:/Projects/my-app"
          />
        </label>
        <Button type="submit" pending={query.isPending}>
          Resolve executable
        </Button>
        {query.error && <ErrorState error={query.error} />}
        {query.data && (
          <p
            role="status"
            className="rounded-lg border border-primary/20 bg-primary/5 p-3 font-mono text-xs break-all text-primary"
          >
            {query.data.path || `${query.data.name} was not found on the manager’s PATH.`}
          </p>
        )}
      </form>
    </Panel>
  )
}
