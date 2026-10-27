import { Suspense, lazy } from 'react'
import {
  BrowserRouter,
  HashRouter,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'
import { AppProvider } from '@/lib/store'
import { AuthProvider, useAuth } from '@/lib/auth'
import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/Login'

/**
 * Routing strategy, set by VITE_ROUTER at build time.
 *
 *   browser (default) — real URLs. Needs the host to serve index.html
 *                       for unknown paths; nginx.conf, vercel.json and
 *                       netlify.toml here all do.
 *   hash             — URLs like /#/compliance. For hosts with no SPA
 *                       fallback, GitHub Pages being the common one.
 *   memory           — no URL involvement at all. For embedded previews
 *                       where the page cannot own the address bar.
 */
const ROUTER_MODE = import.meta.env.VITE_ROUTER ?? 'browser'
const Router =
  ROUTER_MODE === 'hash' ? HashRouter : ROUTER_MODE === 'memory' ? MemoryRouter : BrowserRouter

const UploadPage = lazy(() => import('@/pages/Upload'))
const DataEntry = lazy(() => import('@/pages/DataEntry'))
const Compliance = lazy(() => import('@/pages/Compliance'))
const ReportBuilder = lazy(() => import('@/pages/ReportBuilder'))
const Settings = lazy(() => import('@/pages/Settings'))

const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-24 text-ink-muted">
    <Spinner /> Loading
  </div>
)

const Page = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<Loading />}>{children}</Suspense>
)

/** Everything behind the login lives here. */
function AuthenticatedApp() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="upload" element={<Page><UploadPage /></Page>} />
          <Route path="data" element={<Page><DataEntry /></Page>} />
          <Route path="compliance" element={<Page><Compliance /></Page>} />
          <Route path="report" element={<Page><ReportBuilder /></Page>} />
          <Route path="settings" element={<Page><Settings /></Page>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}

function Gate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-2 bg-page text-ink-muted">
        <Spinner /> Loading
      </div>
    )
  }
  return user ? <AuthenticatedApp /> : <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Gate />
      </Router>
    </AuthProvider>
  )
}
