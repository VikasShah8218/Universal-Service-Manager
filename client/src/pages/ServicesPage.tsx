import { RefreshCw } from 'lucide-react'
import { useWorkspace, serviceRows } from '@/hooks/useWorkspace'
import { PageHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/Feedback'
import { ServiceTable } from '@/components/services/ServiceTable'

export function ServicesPage() {
  const query = useWorkspace()
  return (
    <>
      <PageHeader
        title="Services"
        description="Inspect processes and resource usage across your workspace."
        actions={
          <Button pending={query.isFetching} onClick={() => void query.refetch()}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />
      {query.isError && <ErrorState error={query.error} retry={() => void query.refetch()} />}
      {query.isPending ? (
        <LoadingState />
      ) : (
        query.data && <ServiceTable services={serviceRows(query.data.projects)} />
      )}
    </>
  )
}
