import { useState, type FormEvent } from 'react'
import { Plus, Save } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { useWorkspaceMutation } from '@/hooks/useWorkspace'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Feedback'
import { ServiceFields, toServiceDraft } from './ServiceFields'
import type { ProjectSpec } from '@/types/project'

export function ProjectForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: ProjectSpec
  onSaved: () => void
  onCancel: () => void
}) {
  const api = useApi()
  const [id, setId] = useState(initial?.id || '')
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [cwd, setCwd] = useState(initial?.cwd || '')
  const [autostart, setAutostart] = useState(!!initial?.autostart)
  const [restartChanged, setRestartChanged] = useState(false)
  const [services, setServices] = useState(() => (initial?.services || []).map(toServiceDraft))
  const [localError, setLocalError] = useState<unknown>(null)
  const mutation = useWorkspaceMutation(
    (spec: ProjectSpec) =>
      initial ? api.projects.update(spec, restartChanged) : api.projects.create(spec),
    initial
      ? 'Project configuration saved.'
      : 'Project created. Services are ready to configure or start.',
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLocalError(null)
    const specs = services.map(({ spec, commandText }) => ({
      ...spec,
      command: spec.shell
        ? commandText
        : commandText
            .split('\n')
            .map((arg) => arg.trim())
            .filter(Boolean),
    }))
    if (new Set(specs.map((service) => service.id)).size !== specs.length) {
      setLocalError(new Error('Each service needs a unique ID.'))
      return
    }
    if (!/^(\/|[A-Za-z]:[\\/])/.test(cwd)) {
      setLocalError(
        new Error(
          'Use an absolute project working directory, for example D:/Projects/my-app or /home/user/my-app.',
        ),
      )
      return
    }
    try {
      await mutation.mutateAsync({
        ...initial,
        id,
        name: name || null,
        description,
        cwd,
        autostart,
        services: specs,
      })
      onSaved()
    } catch {
      /* Mutation error is displayed below. */
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Project name</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (!initial)
                setId(
                  event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                    .slice(0, 64),
                )
            }}
            className="field"
            placeholder="My application"
          />
        </label>
        <label>
          <span className="field-label">Project ID</span>
          <input
            required
            pattern="[a-z0-9][a-z0-9_-]{0,63}"
            title="Lowercase letters, numbers, hyphens and underscores; maximum 64 characters"
            value={id}
            onChange={(event) => setId(event.target.value)}
            readOnly={!!initial}
            className="field read-only:opacity-60"
            placeholder="my-application"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">Working directory</span>
          <input
            required
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            className="field"
            placeholder="D:/Projects/my-application"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">Description</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="field"
            placeholder="What does this project run?"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={autostart}
          onChange={(event) => setAutostart(event.target.checked)}
          className="accent-primary"
        />
        Autostart when the manager detects a new OS boot
      </label>
      <p className="text-[11px] text-muted">
        The manager itself must be started by your operating system.
      </p>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-medium">
          Services <span className="text-muted">({services.length})</span>
        </h3>
        <Button
          onClick={() =>
            setServices([
              ...services,
              toServiceDraft({ id: '', command: ['python', 'main.py'], cwd: '.' }),
            ])
          }
        >
          <Plus />
          Add service
        </Button>
      </div>
      {services.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-5 text-xs text-muted">
          You can create an empty project and add services later.
        </p>
      )}
      {services.map((draft, index) => (
        <ServiceFields
          key={index}
          draft={draft}
          onChange={(value) =>
            setServices(services.map((item, position) => (position === index ? value : item)))
          }
          onRemove={() => setServices(services.filter((_, position) => position !== index))}
        />
      ))}
      {initial && (
        <label className="flex items-center gap-2 rounded-lg border border-warning/25 bg-warning/5 p-3 text-xs text-warning">
          <input
            type="checkbox"
            checked={restartChanged}
            onChange={(event) => setRestartChanged(event.target.checked)}
            className="accent-primary"
          />
          Restart running services whose configuration changed
        </label>
      )}
      {(localError || mutation.error) && <ErrorState error={localError || mutation.error} />}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button onClick={onCancel} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={mutation.isPending}>
          <Save />
          {initial ? 'Save configuration' : 'Create project'}
        </Button>
      </div>
    </form>
  )
}
