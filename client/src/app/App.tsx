import { lazy, Suspense } from 'react'
import { LoadingState } from '@/components/ui/Feedback'
import { BrowserRouter, Route, Routes } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from './queryClient'
import { PreferencesProvider } from './PreferencesProvider'
import { AuthProvider } from '@/features/login/AuthProvider'
import { ProtectedRoute } from '@/features/login/ProtectedRoute'
const LoginPage = lazy(() =>
  import('@/features/login/LoginPage').then((module) => ({ default: module.LoginPage })),
)
import { AppLayout } from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
const OverviewPage = lazy(() =>
  import('@/pages/OverviewPage').then((module) => ({ default: module.OverviewPage })),
)
const ProjectsPage = lazy(() =>
  import('@/pages/ProjectsPage').then((module) => ({ default: module.ProjectsPage })),
)
const ProjectDetailPage = lazy(() =>
  import('@/pages/ProjectDetailPage').then((module) => ({ default: module.ProjectDetailPage })),
)
const ServicesPage = lazy(() =>
  import('@/pages/ServicesPage').then((module) => ({ default: module.ServicesPage })),
)
const ServiceDetailPage = lazy(() =>
  import('@/pages/ServiceDetailPage').then((module) => ({ default: module.ServiceDetailPage })),
)
const LogsPage = lazy(() =>
  import('@/pages/LogsPage').then((module) => ({ default: module.LogsPage })),
)
const EventsPage = lazy(() =>
  import('@/pages/EventsPage').then((module) => ({ default: module.EventsPage })),
)
const ToolsPage = lazy(() =>
  import('@/pages/ToolsPage').then((module) => ({ default: module.ToolsPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
)

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PreferencesProvider>
          <AuthProvider>
            <BrowserRouter>
              <Suspense fallback={<LoadingState />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppLayout />}>
                      <Route index element={<OverviewPage />} />
                      <Route path="projects" element={<ProjectsPage />} />
                      <Route path="projects/:projectId" element={<ProjectDetailPage />} />
                      <Route
                        path="projects/:projectId/services/:serviceId"
                        element={<ServiceDetailPage />}
                      />
                      <Route path="services" element={<ServicesPage />} />
                      <Route path="logs" element={<LogsPage />} />
                      <Route path="events" element={<EventsPage />} />
                      <Route path="tools" element={<ToolsPage />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster
              theme="dark"
              position="bottom-right"
              closeButton
              toastOptions={{
                style: {
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  border: '1px solid var(--border)',
                  fontFamily: 'var(--font-sans)',
                },
              }}
            />
          </AuthProvider>
        </PreferencesProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
