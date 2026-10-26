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
import type { Company, EsgDataset, Framework } from '@/types'
import { DEFAULT_FACTORS } from '@/data/metrics'

interface AppState {
  companies: Company[]
  company: Company | null
  year: number
  framework: Framework
  dataset: EsgDataset | null
  previous: EsgDataset | null
  factors: Record<string, number>
  loading: boolean
  error: string | null
  setCompanyId: (id: number) => void
  setYear: (year: number) => void
  setFramework: (f: Framework) => void
  setFactors: (f: Record<string, number>) => void
  saveDataset: (values: Record<string, number | null>) => Promise<void>
  importFile: (file: File) => Promise<number>
  refresh: () => Promise<void>
  addCompany: (input: Omit<Company, 'id' | 'years'>) => Promise<Company>
}

const Ctx = createContext<AppState | null>(null)

const FACTORS_KEY = 'esg.factors'
const SELECTION_KEY = 'esg.selection'

const loadFactors = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(FACTORS_KEY)
    if (raw) return { ...DEFAULT_FACTORS, ...JSON.parse(raw) }
  } catch { /* storage unavailable — defaults are fine */ }
  return { ...DEFAULT_FACTORS }
}

const loadSelection = (): { companyId?: number; year?: number } => {
  try {
    const raw = localStorage.getItem(SELECTION_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* no-op */ }
  return {}
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [year, setYear] = useState<number>(2025)
  const [framework, setFrameworkState] = useState<Framework>('BRSR')
  const [dataset, setDataset] = useState<EsgDataset | null>(null)
  const [previous, setPrevious] = useState<EsgDataset | null>(null)
  const [factors, setFactorsState] = useState<Record<string, number>>(loadFactors)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const company = useMemo(
    () => companies.find((c) => c.id === companyId) ?? null,
    [companies, companyId],
  )

  useEffect(() => {
    let cancelled = false
    api
      .listCompanies()
      .then((list) => {
        if (cancelled) return
        setCompanies(list)
        if (list.length === 0) return

        // Restore the last selection, but only if it still exists —
        // a stored id can outlive the company it pointed at.
        const saved = loadSelection()
        const restored = list.find((c) => c.id === saved.companyId) ?? list[0]
        setCompanyId(restored.id)
        setYear(
          saved.year !== undefined && restored.years.includes(saved.year)
            ? saved.year
            : restored.years[restored.years.length - 1],
        )
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [])

  // Keep the year valid when the company changes: not every entity has
  // data for the same financial years.
  useEffect(() => {
    if (!company || company.years.length === 0) return
    if (!company.years.includes(year)) {
      setYear(company.years[company.years.length - 1])
    }
  }, [company, year])

  useEffect(() => {
    if (companyId === null) return
    try {
      localStorage.setItem(SELECTION_KEY, JSON.stringify({ companyId, year }))
    } catch { /* no-op */ }
  }, [companyId, year])

  const load = useCallback(async (cid: number, y: number) => {
    setLoading(true)
    setError(null)
    try {
      const [cur, prev] = await Promise.all([
        api.getDataset(cid, y),
        api.getDataset(cid, y - 1).catch(() => null),
      ])
      setDataset(cur)
      setPrevious(prev && Object.keys(prev.values).length > 0 ? prev : null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (companyId === null) return
    void load(companyId, year)
  }, [companyId, year, load])

  const setFactors = useCallback((f: Record<string, number>) => {
    setFactorsState(f)
    try { localStorage.setItem(FACTORS_KEY, JSON.stringify(f)) } catch { /* no-op */ }
  }, [])

  const setFramework = useCallback((f: Framework) => {
    setFrameworkState(f)
    try { localStorage.setItem('esg.framework', f) } catch { /* no-op */ }
  }, [])

  useEffect(() => {
    try {
      const f = localStorage.getItem('esg.framework')
      if (f === 'BRSR' || f === 'CSRD') setFrameworkState(f)
    } catch { /* no-op */ }
  }, [])

  const saveDataset = useCallback(
    async (values: Record<string, number | null>) => {
      if (companyId === null) return
      const saved = await api.saveDataset({ companyId, year, values })
      setDataset(saved)
    },
    [companyId, year],
  )

  const importFile = useCallback(
    async (file: File) => {
      if (companyId === null) throw new Error('Select a company first.')
      const before = dataset ? Object.values(dataset.values).filter((v) => v !== null).length : 0
      const next = await api.importDataset(companyId, year, file)
      setDataset(next)
      const after = Object.values(next.values).filter((v) => v !== null).length
      return Math.max(after - before, 0)
    },
    [companyId, year, dataset],
  )

  const refresh = useCallback(async () => {
    if (companyId !== null) await load(companyId, year)
  }, [companyId, year, load])

  const addCompany = useCallback(async (input: Omit<Company, 'id' | 'years'>) => {
    const created = await api.createCompany(input)
    setCompanies((prev) => [...prev, created])
    setCompanyId(created.id)
    setYear(created.years[0])
    return created
  }, [])

  const value: AppState = {
    companies,
    company,
    year,
    framework,
    dataset,
    previous,
    factors,
    loading,
    error,
    setCompanyId,
    setYear,
    setFramework,
    setFactors,
    saveDataset,
    importFile,
    refresh,
    addCompany,
  }

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
    } catch { return 'system' }
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      if (theme === 'system') localStorage.removeItem('esg.theme')
      else localStorage.setItem('esg.theme', theme)
    } catch { /* no-op */ }
  }, [theme])

  return { theme, setTheme }
}
