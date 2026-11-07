import { Link } from 'react-router'
import { EmptyState } from '@/components/ui/Feedback'

export function NotFoundPage() {
  return (
    <EmptyState
      title="This page could not be found"
      description="The address may have changed. Your workspace is still available."
    >
      <Link to="/" className="subtle-link text-sm">
        Back to overview
      </Link>
    </EmptyState>
  )
}
