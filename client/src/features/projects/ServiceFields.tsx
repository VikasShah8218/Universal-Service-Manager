import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Probe, ServiceSpec } from '@/types/project'

export interface ServiceDraft {
  spec: ServiceSpec
  commandText: string
}
export const toServiceDraft = (spec: ServiceSpec): ServiceDraft => ({
  spec,
  commandText: Array.isArray(spec.command) ? spec.command.join('\n') : spec.command,
})

export function ServiceFields({
  draft,
  onChange,
  onRemove,
}: {
  draft: ServiceDraft
  onChange: (draft: ServiceDraft) => void
  onRemove: () => void
}) {
  const { spec } = draft
  const [dependenciesText, setDependenciesText] = useState(
    (spec.depends_on || []).map((item) => item.id).join(', '),
  )
  const update = (values: Partial<ServiceSpec>) =>
    onChange({ ...draft, spec: { ...spec, ...values } })
  const readiness = spec.readiness
  function changeReadiness(type: string) {
    const probe: Probe | null =
      type === 'tcp'
        ? { type, port: 8000 }
        : type === 'http'
          ? { type, url: 'http://127.0.0.1:8000/health' }
          : type === 'log_regex'
            ? { type, pattern: 'ready' }
            : type === 'delay'
              ? { type, seconds: 2 }
              : type === 'process'
                ? { type }
                : null
    update({ readiness: probe })
  }
  return (
    <fieldset className="rounded-lg border border-border/70 bg-background/35 p-4">
      <legend className="px-2 text-xs font-medium text-primary">{spec.id || 'New service'}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Service ID</span>
          <input
            required
            pattern="[a-z0-9][a-z0-9_-]{0,63}"
            value={spec.id}
            onChange={(event) => update({ id: event.target.value })}
            className="field"
            placeholder="api-server"
          />
        </label>
        <label>
          <span className="field-label">Working directory</span>
          <input
            value={spec.cwd || ''}
            onChange={(event) => update({ cwd: event.target.value || null })}
            className="field"
            placeholder="api (relative to project)"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">
            {spec.shell ? 'Shell command' : 'Command — one argument per line'}
          </span>
          <textarea
            required
            rows={3}
            value={draft.commandText}
            onChange={(event) => onChange({ ...draft, commandText: event.target.value })}
            className="field font-mono text-xs"
            placeholder={'python\nmain.py'}
          />
          <span className="mt-1 block text-[11px] text-muted">
            Use the virtual environment’s Python path directly. No activation needed.
          </span>
        </label>
        <label>
          <span className="field-label">Service kind</span>
          <select
            value={spec.kind || 'long_running'}
            onChange={(event) => update({ kind: event.target.value as ServiceSpec['kind'] })}
            className="field"
          >
            <option value="long_running">Long running</option>
            <option value="one_shot">One shot</option>
          </select>
        </label>
        <label>
          <span className="field-label">Restart policy</span>
          <select
            value={spec.restart_policy?.mode || 'on_failure'}
            onChange={(event) =>
              update({
                restart_policy: {
                  ...spec.restart_policy,
                  mode: event.target.value as 'never' | 'on_failure' | 'always',
                },
              })
            }
            className="field"
          >
            <option value="on_failure">On failure</option>
            <option value="always">Always</option>
            <option value="never">Never</option>
          </select>
        </label>
        <label>
          <span className="field-label">Readiness check</span>
          <select
            value={readiness?.type || 'none'}
            onChange={(event) => changeReadiness(event.target.value)}
            className="field"
          >
            <option value="none">Default (survive one second)</option>
            <option value="process">Process alive</option>
            <option value="tcp">TCP port</option>
            <option value="http">HTTP endpoint</option>
            <option value="log_regex">Log pattern</option>
            <option value="delay">Delay</option>
          </select>
        </label>
        {readiness?.type === 'tcp' && (
          <label>
            <span className="field-label">TCP port</span>
            <input
              type="number"
              min="1"
              max="65535"
              required
              value={readiness.port}
              onChange={(event) =>
                update({ readiness: { ...readiness, port: Number(event.target.value) } })
              }
              className="field"
            />
          </label>
        )}
        {readiness?.type === 'http' && (
          <label>
            <span className="field-label">HTTP URL</span>
            <input
              type="url"
              required
              value={readiness.url}
              onChange={(event) => update({ readiness: { ...readiness, url: event.target.value } })}
              className="field"
            />
          </label>
        )}
        {readiness?.type === 'log_regex' && (
          <label>
            <span className="field-label">Log regular expression</span>
            <input
              required
              value={readiness.pattern}
              onChange={(event) =>
                update({ readiness: { ...readiness, pattern: event.target.value } })
              }
              className="field"
            />
          </label>
        )}
        {readiness?.type === 'delay' && (
          <label>
            <span className="field-label">Delay (seconds)</span>
            <input
              type="number"
              min="0"
              max="3600"
              value={readiness.seconds}
              onChange={(event) =>
                update({ readiness: { ...readiness, seconds: Number(event.target.value) } })
              }
              className="field"
            />
          </label>
        )}
        <label className="sm:col-span-2">
          <span className="field-label">Dependencies (comma-separated service IDs)</span>
          <input
            value={dependenciesText}
            onChange={(event) => {
              setDependenciesText(event.target.value)
              update({
                depends_on: event.target.value
                  .split(',')
                  .map((id) => id.trim())
                  .filter(Boolean)
                  .map(
                    (id) =>
                      spec.depends_on?.find((dep) => dep.id === id) || { id, condition: 'healthy' },
                  ),
              })
            }}
            className="field"
            placeholder="database, cache"
          />
          <span className="mt-1 block text-[11px] text-muted">
            New dependency edges wait for the service to be healthy.
          </span>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={spec.enabled !== false}
            onChange={(event) => update({ enabled: event.target.checked })}
            className="accent-primary"
          />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={!!spec.shell}
            onChange={(event) => update({ shell: event.target.checked })}
            className="accent-primary"
          />
          Run through shell
        </label>
        <Button variant="danger" className="ml-auto" onClick={onRemove}>
          <Trash2 />
          Remove
        </Button>
      </div>
    </fieldset>
  )
}
