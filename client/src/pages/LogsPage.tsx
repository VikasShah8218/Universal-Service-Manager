import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useWorkspace } from '@/hooks/useWorkspace'
import { PageHeader } from '@/components/ui/Panel'
import { ErrorState, LoadingState, EmptyState } from '@/components/ui/Feedback'
import { LogViewer } from '@/features/logs/LogViewer'

export function LogsPage() {
  const query = useWorkspace()
  const [params, setParams] = useSearchParams()
  const projectId = params.get('project') || query.data?.projects[0]?.id || ''
  const project = query.data?.projects.find((item) => item.id === projectId)
  const serviceId = params.get('service') || project?.services[0]?.id || ''
  const service = project?.services.find((item) => item.id === serviceId)
  useEffect(() => {
    if (project && !params.get('service') && project.services[0])
      setParams({ project: project.id, service: project.services[0].id }, { replace: true })
  }, [project, params, setParams])
  return (
    <>
      <PageHeader
        title="Service logs"
        description="Follow process output and inspect recent service activity."
      />
      {query.isError && <ErrorState error={query.error} retry={() => void query.refetch()} />}
      {query.isPending ? (
        <LoadingState />
      ) : (
        query.data && (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="field-label">Project</span>
                <select
                  className="field"
                  value={projectId}
                  onChange={(event) => {
                    const selected = query.data.projects.find(
                      (item) => item.id === event.target.value,
                    )
                    setParams({
                      project: event.target.value,
                      ...(selected?.services[0] ? { service: selected.services[0].id } : {}),
                    })
                  }}
                >
                  {query.data.projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="field-label">Service</span>
                <select
                  className="field"
                  value={serviceId}
                  onChange={(event) =>
                    setParams({ project: projectId, service: event.target.value })
                  }
                >
                  {project?.services.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {service ? (
              <LogViewer
                key={`${projectId}/${serviceId}`}
                project={projectId}
                service={serviceId}
              />
            ) : (
              <EmptyState
                title="No service selected"
                description="Choose a project with configured services, then select a service to view its output."
              />
            )}
          </>
        )
      )}
    </>
  )
}
