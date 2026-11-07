import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowUp, Folder } from 'lucide-react'
import { useApi } from '@/features/login/AuthProvider'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/Feedback'

export function DirectoryBrowser() {
  const api = useApi()
  const [path, setPath] = useState('')
  const query = useMutation({
    mutationFn: (value: string) => api.tools.listDirectories(value || undefined),
  })
  function open(value: string) {
    setPath(value)
    query.mutate(value)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    open(path)
  }
  return (
    <Panel>
      <PanelHeader
        title={
          <>
            <Folder className="size-4 text-primary" />
            Folder browser
          </>
        }
      />
      <form onSubmit={submit} className="space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted">
          Browse folders on the manager’s machine. Leave empty to list drives.
        </p>
        <label>
          <span className="field-label">Absolute directory path</span>
          <input
            className="field"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="D:/Projects"
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" pending={query.isPending}>
            Browse folders
          </Button>
          {query.data?.parent !== null && query.data?.parent !== undefined && (
            <Button disabled={query.isPending} onClick={() => open(query.data!.parent!)}>
              <ArrowUp />
              Parent
            </Button>
          )}
        </div>
        {query.error && <ErrorState error={query.error} />}
        {query.data && (
          <div className="max-h-64 space-y-1 overflow-auto rounded-lg bg-background/50 p-2">
            {query.data.dirs.map((directory) => (
              <button
                key={directory.path}
                type="button"
                disabled={query.isPending}
                onClick={() => open(directory.path)}
                className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs hover:bg-secondary"
              >
                <Folder className="size-3.5 shrink-0 text-primary" />
                <span className="break-all">{directory.name}</span>
              </button>
            ))}
            {!query.data.dirs.length && (
              <p className="p-3 text-xs text-muted">No subfolders in this directory.</p>
            )}
          </div>
        )}
      </form>
    </Panel>
  )
}
