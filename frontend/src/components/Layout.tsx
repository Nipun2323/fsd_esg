import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Bot,
  Building2,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Leaf,
  Menu,
  Monitor,
  Moon,
  PencilLine,
  Settings,
  Sun,
  X,
} from 'lucide-react'
import { useApp, useTheme, type Theme } from '@/lib/store'
import { Assistant } from './Assistant'
import { USING_MOCK } from '@/api/client'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/data', label: 'Data entry', icon: PencilLine },
  { to: '/compliance', label: 'Compliance', icon: ClipboardCheck },
  { to: '/report', label: 'Report', icon: FileText },
  { to: '/companies', label: 'Companies', icon: Building2 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const options: Array<{ value: Theme; icon: typeof Sun; label: string }> = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' },
  ]
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-hairline p-0.5"
      role="group"
      aria-label="Colour theme"
    >
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-pressed={theme === value}
          title={label}
          className={`grid h-6 w-6 place-items-center rounded transition-colors ${
            theme === value ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Icon size={13} aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  )
}

function ContextBar() {
  const { companies, company, year, framework, setCompanyId, setYear, setFramework } = useApp()
  const years = company?.years ?? []
  const select =
    'rounded-lg border border-hairline-strong bg-surface-1 px-2.5 py-1.5 text-sm text-ink transition-colors hover:bg-surface-2 focus:border-brand focus:outline-none'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={select}
        value={company?.id ?? ''}
        onChange={(e) => setCompanyId(Number(e.target.value))}
        aria-label="Company"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        className={`${select} tnum`}
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        aria-label="Financial year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            FY {y}
          </option>
        ))}
      </select>

      <div
        className="flex items-center gap-0.5 rounded-lg border border-hairline p-0.5"
        role="group"
        aria-label="Reporting framework"
      >
        {(['BRSR', 'CSRD'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFramework(f)}
            aria-pressed={framework === f}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              framework === f ? 'bg-brand text-white' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Layout() {
  const [navOpen, setNavOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div className="flex min-h-dvh bg-page">
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      <nav
        aria-label="Main"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-hairline bg-surface-1 transition-transform duration-200 lg:static lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span
            className="grid h-8 w-8 place-items-center rounded-lg text-white"
            style={{ background: 'var(--brand)' }}
          >
            <Leaf size={17} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-ink">Verdant ESG</p>
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">BRSR · CSRD</p>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            className="ml-auto rounded-lg p-1 text-ink-2 lg:hidden"
            aria-label="Close navigation"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <ul className="flex-1 space-y-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={() => setNavOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-wash text-brand-ink'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  }`
                }
              >
                <Icon size={16} aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="space-y-3 p-3">
          {USING_MOCK && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] leading-snug text-ink-muted">
              Demo mode — bundled sample data. Set{' '}
              <code className="font-mono">VITE_USE_MOCK=false</code> to connect the backend.
            </p>
          )}
          <ThemeToggle />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* On narrow screens the nav toggle and assistant share the top
            row and the company/year controls wrap underneath, rather
            than leaving the button stranded on a line of its own. */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-hairline bg-surface-1/90 px-4 py-3 backdrop-blur-sm sm:px-6">
          <button
            onClick={() => setNavOpen(true)}
            className="order-1 rounded-lg p-1.5 text-ink-2 transition-colors hover:bg-surface-2 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={18} aria-hidden />
          </button>

          <button
            onClick={() => setChatOpen(true)}
            className="order-2 ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-[filter] hover:brightness-110 lg:order-3"
            style={{ background: 'var(--brand)' }}
          >
            <Bot size={15} aria-hidden />
            Ask AI
          </button>

          <div className="order-3 w-full lg:order-2 lg:w-auto">
            <ContextBar />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>

        <footer className="border-t border-hairline px-4 py-4 text-center text-[11px] leading-relaxed text-ink-muted sm:px-6">
          Readiness indicators and drafted text are decision support, not assurance. Figures should
          be reviewed before filing against SEBI's BRSR format or the ESRS.
        </footer>
      </div>

      <Assistant open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  )
}
