import { useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { useWorkspaceMutation } from '@/hooks/useWorkspace'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Feedback'
import type { ProjectSpec } from '@/types/project'

export function ConfigurationEditor({ spec }: { spec: ProjectSpec }) {
  const api = useApi()
  const [text, setText] = useState(JSON.stringify(spec, null, 2))
  const [dirty, setDirty] = useState(false)
  const [restart, setRestart] = useState(false)
  const [localError, setLocalError] = useState<unknown>(null)
  const mutation = useWorkspaceMutation(
    (next: ProjectSpec) => api.projects.update(next, restart),
    'Configuration saved.',
  )
  useEffect(() => {
    if (!dirty) setText(JSON.stringify(spec, null, 2))
  }, [spec, dirty])
  async function save() {
    setLocalError(null)
    try {
      const next: ProjectSpec = JSON.parse(text)
      if (!next || next.id !== spec.id || !Array.isArray(next.services))
        throw new Error('Keep the existing project ID and provide a services array.')
      await mutation.mutateAsync(next)
      setDirty(false)
    } catch (error) {
      setLocalError(error)
    }
  }
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted">
        Full project specification. Use this editor for environment variables, health checks,
        dependency conditions, and advanced policies. Saving replaces the configuration; removed
        services are stopped.
      </div>
      <textarea
        aria-label="Project JSON configuration"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setDirty(true)
        }}
        spellCheck={false}
        className="field min-h-[420px] bg-terminal font-mono text-xs leading-6"
      />
      <label className="flex items-center gap-2 text-xs text-warning">
        <input
          type="checkbox"
          checked={restart}
          onChange={(event) => setRestart(event.target.checked)}
          className="accent-primary"
        />
        Restart running services whose configuration changed
      </label>
      {(localError || mutation.error) && <ErrorState error={localError || mutation.error} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] text-muted">
          {dirty ? 'Unsaved changes' : 'Saved configuration'}
        </span>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setText(JSON.stringify(spec, null, 2))
              setDirty(false)
              setLocalError(null)
            }}
            disabled={mutation.isPending}
          >
            <RotateCcw />
            Reload saved
          </Button>
          <Button variant="primary" pending={mutation.isPending} onClick={save} disabled={!dirty}>
            <Save />
            Save configuration
          </Button>
        </div>
      </div>
    </div>
  )
}
