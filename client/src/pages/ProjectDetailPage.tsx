import { useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router'
import { Download, Folder, Pencil, Trash2 } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { useProject, useWorkspaceMutation, serviceRows } from '@/hooks/useWorkspace'
import { PageHeader, Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ErrorState, LoadingState } from '@/components/ui/Feedback'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ProjectActions } from '@/components/projects/ProjectActions'
import { ServiceTable } from '@/components/services/ServiceTable'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { ConfigurationEditor } from '@/features/projects/ConfigurationEditor'
import { DependencyList } from '@/features/projects/DependencyList'
import { downloadFile } from '@/lib/format'

export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const query = useProject(projectId)
  const api = useApi()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'services'
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null)
  const removal = useWorkspaceMutation(() => api.projects.remove(projectId), 'Project deleted.')
  const exporting = useWorkspaceMutation(async () => {
    const text = await api.projects.exportYaml(projectId)
    downloadFile(`${projectId}.usm.yaml`, text, 'application/yaml')
  }, 'Project YAML exported.')
  if (query.isPending) return <LoadingState label="Loading project…" />
  if (!query.data)
    return (
      <>
        <Link to="/projects" className="subtle-link text-xs">
          ← Back to projects
        </Link>
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      </>
    )
  const { spec, status } = query.data
  return (
    <>
      <Link to="/projects" className="mb-4 inline-block text-[11px] text-muted hover:text-primary">
        ← All projects
      </Link>
      <PageHeader
        title={status.name}
        description={status.description || 'Project services and configuration.'}
        actions={
          <>
            <Button onClick={() => exporting.mutate()} pending={exporting.isPending}>
              <Download />
              Export YAML
            </Button>
            <Button onClick={() => setDialog('edit')}>
              <Pencil />
              Edit project
            </Button>
            <ProjectActions id={projectId} running={status.running > 0} />
          </>
        }
      />
      {query.isError && <ErrorState error={query.error} retry={() => void query.refetch()} />}
      <Panel className="mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <StatusBadge state={status.state} />
            <span className="text-xs text-muted">
              Autostart {status.autostart ? 'enabled' : 'off'}
            </span>
          </div>
          <h2 className="text-lg font-medium">
            {status.running} / {status.total} services running
          </h2>
          <p className="mt-2 flex items-center gap-2 font-mono text-[11px] break-all text-muted">
            <Folder className="size-3.5 shrink-0" />
            {spec.cwd || 'Per-service working directories'}
          </p>
        </div>
        <Button variant="danger" onClick={() => setDialog('delete')}>
          <Trash2 />
          Delete project
        </Button>
      </Panel>
      <div
        role="tablist"
        aria-label="Project details"
        className="mb-5 flex gap-5 border-b border-border/80"
      >
        {['services', 'dependencies', 'configuration'].map((value) => (
          <button
            key={value}
            role="tab"
            id={`project-tab-${value}`}
            aria-controls="project-tab-panel"
            aria-selected={tab === value}
            onClick={() => setParams({ tab: value })}
            className={`border-b-2 pb-3 text-xs capitalize ${tab === value ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-foreground'}`}
          >
            {value}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="project-tab-panel" aria-labelledby={`project-tab-${tab}`}>
        {tab === 'dependencies' ? (
          <DependencyList project={query.data} />
        ) : tab === 'configuration' ? (
          <ConfigurationEditor spec={spec} />
        ) : (
          <ServiceTable services={serviceRows([status])} />
        )}
      </div>
      <Modal
        open={dialog === 'edit'}
        onClose={() => setDialog(null)}
        title="Edit project"
        description="Save configuration without restarting, or apply changes to running services."
        wide
      >
        {dialog === 'edit' && (
          <ProjectForm
            initial={spec}
            onSaved={() => setDialog(null)}
            onCancel={() => setDialog(null)}
          />
        )}
      </Modal>
      <Modal
        open={dialog === 'delete'}
        onClose={() => !removal.isPending && setDialog(null)}
        title="Delete this project?"
        description={`All services in ${status.name} will be stopped and its saved configuration will be removed.`}
      >
        <p className="text-xs leading-relaxed text-muted">
          Historical events and logs are not deleted. Export the configuration first if you want to
          keep a copy.
        </p>
        {removal.error && <ErrorState error={removal.error} />}
        <div className="mt-6 flex justify-end gap-2">
          <Button disabled={removal.isPending} onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            pending={removal.isPending}
            onClick={async () => {
              try {
                await removal.mutateAsync()
                navigate('/projects')
              } catch {
                /* Error shown in dialog. */
              }
            }}
          >
            Delete project
          </Button>
        </div>
      </Modal>
    </>
  )
}
