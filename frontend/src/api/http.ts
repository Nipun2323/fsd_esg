import type { EsgApi } from './types'
import { ApiError } from './types'
import type {
  ChatMessage,
  Company,
  Dashboard,
  EsgDataset,
  Framework,
  Report,
  ReportSectionKey,
  UploadResult,
  User,
} from '@/types'

const BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '')
const TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT ?? 60000)
const TOKEN_KEY = 'esg.token'

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable — the session just won't survive a reload */
  }
}

/** Set by the auth provider so a 401 anywhere can bounce to the login screen. */
let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  const token = getToken()

  try {
    const res = await fetch(`${BASE}/api${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })

    if (res.status === 401) {
      setToken(null)
      onUnauthorized?.()
      throw new ApiError('Your session has expired. Please sign in again.', 401)
    }

    if (!res.ok) {
      throw new ApiError(await readError(res), res.status)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if ((err as Error).name === 'AbortError') throw new ApiError('The request timed out.')
    throw new ApiError(
      `Could not reach the API at ${BASE}. Is the backend running?`,
    )
  } finally {
    clearTimeout(timer)
  }
}

/** FastAPI returns `detail` as a string, or an array for validation errors. */
async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    const d = body?.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d.length) return d.map((e) => e.msg ?? String(e)).join('; ')
  } catch {
    /* fall through to the status text */
  }
  return `${res.status} ${res.statusText}`
}

export const httpApi: EsgApi = {
  async login(username, password) {
    const r = await request<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setToken(r.access_token)
    return { token: r.access_token, user: r.user }
  },

  async signup(input) {
    const r = await request<{ access_token: string; user: User }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    setToken(r.access_token)
    return { token: r.access_token, user: r.user }
  },

  me: () => request<User>('/auth/me'),

  searchCompanies: (query) =>
    query.trim()
      ? request<Company[]>(`/companies/search?q=${encodeURIComponent(query.trim())}`)
      : Promise.resolve([]),

  getCompany: (id) => request<Company>(`/companies/${id}`),

  getDashboard: (id, year, framework: Framework) =>
    request<Dashboard>(`/companies/${id}/dashboard?year=${year}&framework=${framework}`),

  getDataset: (id, year) => request<EsgDataset>(`/companies/${id}/data?year=${year}`),

  saveDataset: (ds) =>
    request<EsgDataset>(`/companies/${ds.companyId}/data?year=${ds.year}`, {
      method: 'PUT',
      body: JSON.stringify(ds),
    }),

  uploadReport: (companyId, year, file) => {
    const form = new FormData()
    form.append('company_id', String(companyId))
    form.append('year', String(year))
    form.append('file', file)
    return request<UploadResult>('/uploads', { method: 'POST', body: form })
  },

  getReport: (companyId, year, framework: Framework) =>
    request<Report>(`/reports?companyId=${companyId}&year=${year}&framework=${framework}`),

  generateSection: (reportId, section: ReportSectionKey, signal) =>
    request<Report>(`/reports/${reportId}/sections/${section}/generate`, {
      method: 'POST',
      signal,
    }),

  saveSection: (reportId, section, body) =>
    request<Report>(`/reports/${reportId}/sections/${section}`, {
      method: 'PUT',
      body: JSON.stringify({ body }),
    }),

  async exportPdf(reportId) {
    const res = await fetch(`${BASE}/api/reports/${reportId}/export`, {
      method: 'POST',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    })
    if (!res.ok) throw new ApiError(await readError(res), res.status)
    return res.blob()
  },

  chat: (messages: ChatMessage[], opts, signal) =>
    request<ChatMessage>('/assistant/chat', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        companyId: opts.companyId ?? null,
        year: opts.year ?? null,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    }),

  aiStatus: () => request('/meta/ai'),
}
