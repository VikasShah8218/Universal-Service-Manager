import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <div
          role="alert"
          className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6"
        >
          <h1 className="text-xl font-semibold">The interface could not render</h1>
          <p className="text-sm text-muted">
            Reload to restore the workspace. This does not stop your managed services.
          </p>
          <Button onClick={() => location.reload()}>Reload interface</Button>
        </div>
      )
    return this.props.children
  }
}
