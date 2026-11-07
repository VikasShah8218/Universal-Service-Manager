import { useState, type FormEvent } from 'react'
import { Upload } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { useWorkspaceMutation } from '@/hooks/useWorkspace'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Feedback'

export function ImportProjectForm({ onSaved }: { onSaved: () => void }) {
  const api = useApi()
  const [yaml, setYaml] = useState('')
  const [restart, setRestart] = useState(false)
  const [fileError, setFileError] = useState<unknown>(null)
  const mutation = useWorkspaceMutation(
    () => api.projects.importYaml(yaml, restart),
    'Project YAML imported.',
  )
  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await mutation.mutateAsync()
      onSaved()
    } catch {
      /* Error shown below. */
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <label>
        <span className="field-label">Load a YAML file</span>
        <input
          type="file"
          accept=".yaml,.yml"
          className="field text-xs"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            if (file.size > 2 * 1024 * 1024) {
              setFileError(new Error('Choose a YAML file smaller than 2 MB.'))
              return
            }
            try {
              setYaml(await file.text())
              setFileError(null)
            } catch {
              setFileError(new Error('Could not read that file.'))
            }
          }}
        />
      </label>
      <label>
        <span className="field-label">Project YAML</span>
        <textarea
          className="field min-h-72 font-mono text-xs"
          value={yaml}
          onChange={(event) => setYaml(event.target.value)}
          required
          spellCheck={false}
          placeholder={'id: my-project\ncwd: D:/Projects/my-project\nservices: []'}
        />
      </label>
      <p className="text-[11px] leading-relaxed text-muted">
        Use absolute project paths. Import creates or replaces the project with the same ID.
        Existing services removed from the configuration will be stopped.
      </p>
      <label className="flex items-center gap-2 text-xs text-warning">
        <input
          type="checkbox"
          className="accent-primary"
          checked={restart}
          onChange={(event) => setRestart(event.target.checked)}
        />
        Restart running services with changed configuration
      </label>
      {(fileError || mutation.error) && <ErrorState error={fileError || mutation.error} />}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" pending={mutation.isPending}>
          <Upload />
          Import project
        </Button>
      </div>
    </form>
  )
}
