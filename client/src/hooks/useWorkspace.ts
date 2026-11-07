import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useApi } from '@/features/login/AuthProvider'
import { usePreferences } from '@/app/PreferencesProvider'
import { errorMessage } from '@/lib/format'
import type { ServiceRow } from '@/types/runtime'

export function useWorkspace() {
  const api = useApi()
  const { preferences } = usePreferences()
  return useQuery({
    queryKey: ['status'],
    queryFn: ({ signal }) => api.system.status(signal),
    refetchInterval: preferences.refreshSeconds * 1000,
  })
}

export function useProject(id: string) {
  const api = useApi()
  const { preferences } = usePreferences()
  return useQuery({
    queryKey: ['project', id],
    queryFn: ({ signal }) => api.projects.detail(id, signal),
    enabled: !!id,
    refetchInterval: preferences.refreshSeconds * 1000,
  })
}

export function useService(project: string, service: string) {
  const api = useApi()
  const { preferences } = usePreferences()
  return useQuery({
    queryKey: ['service', project, service],
    queryFn: ({ signal }) => api.runtime.detail(project, service, signal),
    enabled: !!project && !!service,
    refetchInterval: preferences.refreshSeconds * 1000,
  })
}

export function useWorkspaceMutation<TVariables, TResult>(
  operation: (variables: TVariables) => Promise<TResult>,
  successMessage: string,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: operation,
    onSuccess: async () => {
      toast.success(successMessage)
      await Promise.all(
        ['status', 'project', 'service', 'events', 'audit'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      )
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
}

export function serviceRows(
  projects: import('@/types/runtime').ProjectStatus[] = [],
): ServiceRow[] {
  return projects.flatMap((project) =>
    project.services.map((service) => ({
      ...service,
      projectId: project.id,
      projectName: project.name,
    })),
  )
}
