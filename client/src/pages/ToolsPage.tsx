import { PageHeader } from '@/components/ui/Panel'
import { PortChecker } from '@/features/tools/PortChecker'
import { ExecutableResolver } from '@/features/tools/ExecutableResolver'
import { DirectoryBrowser } from '@/features/tools/DirectoryBrowser'
import { CommandDetector } from '@/features/tools/CommandDetector'

export function ToolsPage() {
  return (
    <>
      <PageHeader
        title="Workspace tools"
        description="Inspect paths, executables, and ports before configuring a service."
      />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <PortChecker />
        <ExecutableResolver />
        <DirectoryBrowser />
        <CommandDetector />
      </div>
    </>
  )
}
