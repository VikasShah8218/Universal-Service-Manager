import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Cable } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Feedback'

export function PortChecker() {
  const api = useApi()
  const [port, setPort] = useState('8000')
  const query = useMutation({ mutationFn: () => api.tools.checkPort(Number(port)) })
  function submit(event: FormEvent) {
    event.preventDefault()
    query.mutate()
  }
  return (
    <Panel>
      <PanelHeader
        title={
          <>
            <Cable className="size-4 text-primary" />
            TCP port check
          </>
        }
      />
      <form onSubmit={submit} className="space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted">
          Find whether a local port is occupied and which process owns it.
        </p>
        <label>
          <span className="field-label">Port number</span>
          <input
            type="number"
            min="1"
            max="65535"
            required
            className="field"
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
        </label>
        <Button type="submit" pending={query.isPending}>
          Check port
        </Button>
        {query.error && <ErrorState error={query.error} />}
        {query.data && (
          <div
            role="status"
            className={`rounded-lg border p-3 text-xs ${query.data.in_use ? 'border-warning/30 bg-warning/5 text-warning' : 'border-success/30 bg-success/5 text-success'}`}
          >
            Port {query.data.port} is{' '}
            {query.data.in_use
              ? `in use${query.data.owner?.name ? ` by ${query.data.owner.name}` : ''}${query.data.owner?.pid ? ` (PID ${query.data.owner.pid})` : ''}`
              : 'available'}
            .
          </div>
        )}
      </form>
    </Panel>
  )
}
