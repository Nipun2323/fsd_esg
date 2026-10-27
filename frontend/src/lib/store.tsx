import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/lib/auth'
import type { Company, Dashboard, Framework } from '@/types'

const CURRENT_YEAR = new Date().getFullYear()

interface AppState {
  company: Company | null
  year: number
  framework: Framework
  dashboard: Dashboard | null
  loading: boolean
  error: string | null
  aiEnabled: boolean | null
  selectCompany: (company: Company | null) => void
  setYear: (year: number) => void
  setFramework: (f: Framework) => void
  refresh: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

const SELECTION_KEY = 'esg.selection'

const loadSelection = (): { companyId?: number; year?: number } => {
  try {
    const raw = localStorage.getItem(SELECTION_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* no-op */
  }
  return {}
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [company, setCompany] = useState<Company | null>(null)
  const [year, setYear] = useState<number>(CURRENT_YEAR - 1)
  const [framework, setFrameworkState] = useState<Framework>('BRSR')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      const f = localStorage.getItem('esg.framework')
      if (f === 'BRSR' || f === 'CSRD') setFrameworkState(f)
    } catch {
      /* no-op */
    }
  }, [])

  useEffect(() => {
    if (!user) return
    api
      .aiStatus()
      .then((s) => setAiEnabled(s.enabled))
      .catch(() => setAiEnabled(null))
  }, [user])

  // Restore the last company, if the account still has access to it.
  useEffect(() => {
    if (!user) {
      setCompany(null)
      setDashboard(null)
      return
    }
    const saved = loadSelection()
    const id = user.company_id ?? saved.companyId
    if (!id) return
    api
      .getCompany(id)
      .then((c) => {
        setCompany(c)
        if (saved.year) setYear(saved.year)
      })
      .catch(() => {
        /* the stored id may no longer be reachable — stay on the search screen */
      })
  }, [user])

  const load = useCallback(
    async (companyId: number, y: number, fw: Framework) => {
      setLoading(true)
      setError(null)
      try {
        setDashboard(await api.getDashboard(companyId, y, fw))
      } catch (e) {
        setError((e as Error).message)
        setDashboard(null)
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // Nothing is fetched until a company is chosen: the backend stays
  // idle for the 700+ companies nobody has opened.
  useEffect(() => {
    if (!company) {
      setDashboard(null)
      return
    }
    void load(company.id, year, framework)
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify({ companyId: company.id, year }))
    } catch {
      /* no-op */
    }
  }, [company, year, framework, load])

  const selectCompany = useCallback((c: Company | null) => {
    setCompany(c)
    if (c?.years?.length) setYear(c.years[c.years.length - 1])
  }, [])

  const setFramework = useCallback((f: Framework) => {
    setFrameworkState(f)
    try {
      localStorage.setItem('esg.framework', f)
    } catch {
      /* no-op */
    }
  }, [])

  const refresh = useCallback(async () => {
    if (company) await load(company.id, year, framework)
  }, [company, year, framework, load])

  const value = useMemo(
    () => ({
      company,
      year,
      framework,
      dashboard,
      loading,
      error,
      aiEnabled,
      selectCompany,
      setYear,
      setFramework,
      refresh,
    }),
    [company, year, framework, dashboard, loading, error, aiEnabled, selectCompany, setFramework, refresh],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

/* ---------------- theme ---------------- */

export type Theme = 'light' | 'dark' | 'system'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem('esg.theme')
      return t === 'dark' || t === 'light' ? t : 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      if (theme === 'system') localStorage.removeItem('esg.theme')
      else localStorage.setItem('esg.theme', theme)
    } catch {
      /* no-op */
    }
  }, [theme])

  return { theme, setTheme }
}
