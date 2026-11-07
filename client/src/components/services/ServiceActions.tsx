import { Play, RefreshCw, Square } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { useWorkspaceMutation } from '@/hooks/useWorkspace'
import { Button } from '@/components/ui/Button'
import type { ServiceAction } from '@/types/runtime'

export function ServiceActions({
  project,
  service,
  stopped,
  compact = false,
}: {
  project: string
  service: string
  stopped: boolean
  compact?: boolean
}) {
  const api = useApi()
  const mutation = useWorkspaceMutation(
    (action: ServiceAction) => api.runtime.serviceAction(project, service, action),
    'Service action requested.',
  )
  return (
    <div className="flex items-center gap-1">
      <Button
        variant={compact ? 'ghost' : 'secondary'}
        className={compact ? 'px-2' : ''}
        title={stopped ? 'Start service' : 'Restart service'}
        aria-label={`${stopped ? 'Start' : 'Restart'} ${service}`}
        pending={mutation.isPending}
        onClick={() => mutation.mutate(stopped ? 'start' : 'restart')}
      >
        {stopped ? <Play /> : <RefreshCw />}
        {!compact && (stopped ? 'Start' : 'Restart')}
      </Button>
      {!stopped && (
        <Button
          variant="ghost"
          title="Stop service"
          aria-label={`Stop ${service}`}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate('stop')}
        >
          <Square />
          {!compact && 'Stop'}
        </Button>
      )}
    </div>
  )
}
