import { useState } from 'react'
import { Plus, Search, Upload } from 'lucide-react'
import { useWorkspace } from '@/hooks/useWorkspace'
import { PageHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { ImportProjectForm } from '@/features/projects/ImportProjectForm'

export function ProjectsPage() {
  const query = useWorkspace()
  const [dialog, setDialog] = useState<'create' | 'import' | null>(null)
  const [search, setSearch] = useState('')
  const projects =
    query.data?.projects.filter((project) =>
      `${project.id} ${project.name} ${project.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || []
  return (
    <>
      <PageHeader
        title="Projects"
        description="Organize services, dependencies, and policies in one place."
        actions={
          <>
            <Button onClick={() => setDialog('import')}>
              <Upload />
              Import YAML
            </Button>
            <Button variant="primary" onClick={() => setDialog('create')}>
              <Plus />
              New project
            </Button>
          </>
        }
      />
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {query.data?.projects.length || 0} projects in this workspace
        </p>
        <label className="flex items-center gap-2 rounded-md border bg-card px-3">
          <Search className="size-3.5 text-muted" />
          <input
            aria-label="Search projects"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects…"
            className="w-32 bg-transparent py-2 text-xs outline-none sm:w-44"
          />
        </label>
      </div>
      {query.isError && <ErrorState error={query.error} retry={() => void query.refetch()} />}
      {query.isPending ? (
        <LoadingState />
      ) : projects.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        query.data && (
          <EmptyState
            title={search ? 'No matching projects' : 'No projects yet'}
            description={
              search
                ? 'Try a different search.'
                : 'Create a project or import an existing USM YAML configuration.'
            }
          />
        )
      )}
      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === 'import' ? 'Import project' : 'New project'}
        description={
          dialog === 'import'
            ? 'Create or replace a project from a YAML configuration.'
            : 'Define the project and its services.'
        }
        wide
      >
        {dialog === 'create' ? (
          <ProjectForm onSaved={() => setDialog(null)} onCancel={() => setDialog(null)} />
        ) : dialog === 'import' ? (
          <ImportProjectForm onSaved={() => setDialog(null)} />
        ) : null}
      </Modal>
    </>
  )
}
