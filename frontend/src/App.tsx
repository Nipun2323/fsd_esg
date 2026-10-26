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
import { Layout } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import Dashboard from '@/pages/Dashboard'

// Dashboard is the landing route, so it ships in the main bundle.
// The rest are split — Recharts and the report editor are not needed
// to paint the first screen.
const DataEntry = lazy(() => import('@/pages/DataEntry'))
const Compliance = lazy(() => import('@/pages/Compliance'))
const ReportBuilder = lazy(() => import('@/pages/ReportBuilder'))
const Companies = lazy(() => import('@/pages/Companies'))
const Settings = lazy(() => import('@/pages/Settings'))

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

const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-24 text-ink-muted">
    <Spinner /> Loading
  </div>
)

export default function App() {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route
              path="data"
              element={<Suspense fallback={<Loading />}><DataEntry /></Suspense>}
            />
            <Route
              path="compliance"
              element={<Suspense fallback={<Loading />}><Compliance /></Suspense>}
            />
            <Route
              path="report"
              element={<Suspense fallback={<Loading />}><ReportBuilder /></Suspense>}
            />
            <Route
              path="companies"
              element={<Suspense fallback={<Loading />}><Companies /></Suspense>}
            />
            <Route
              path="settings"
              element={<Suspense fallback={<Loading />}><Settings /></Suspense>}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </AppProvider>
  )
}
