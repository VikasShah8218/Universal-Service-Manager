import { Play, RefreshCw, Square } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { useWorkspaceMutation } from '@/hooks/useWorkspace'
import { Button } from '@/components/ui/Button'
import type { ProjectAction } from '@/types/runtime'

export function ProjectActions({
  id,
  running,
  compact = false,
}: {
  id: string
  running: boolean
  compact?: boolean
}) {
  const api = useApi()
  const mutation = useWorkspaceMutation(
    (action: ProjectAction) => api.runtime.projectAction(id, action),
    'Project action requested.',
  )
  return (
    <div className="flex gap-1">
      <Button
        variant={compact ? 'ghost' : 'primary'}
        aria-label={`${running ? 'Restart' : 'Start'} ${id}`}
        title={running ? 'Restart project' : 'Start project'}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(running ? 'restart' : 'start')}
      >
        {running ? <RefreshCw /> : <Play />}
        {!compact && (running ? 'Restart project' : 'Start project')}
      </Button>
      {running && (
        <Button
          variant={compact ? 'ghost' : 'secondary'}
          aria-label={`Stop ${id}`}
          title="Stop project"
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
