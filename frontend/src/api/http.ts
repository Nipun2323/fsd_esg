import type { EsgApi } from './types'
import { ApiError } from './types'
import type { ChatMessage, Company, EsgDataset, Framework, Report, ReportSectionKey } from '@/types'

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT ?? 30000)

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  const signal = init.signal ?? controller.signal

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new ApiError(detail || `${res.status} ${res.statusText}`, res.status)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if ((err as Error).name === 'AbortError') throw new ApiError('Request timed out')
    throw new ApiError((err as Error).message)
  } finally {
    clearTimeout(timer)
  }
}

export const httpApi: EsgApi = {
  listCompanies: () => request<Company[]>('/companies'),

  createCompany: (input) =>
    request<Company>('/companies', { method: 'POST', body: JSON.stringify(input) }),

  getDataset: (companyId, year) =>
    request<EsgDataset>(`/companies/${companyId}/data?year=${year}`),

  saveDataset: (dataset) =>
    request<EsgDataset>(`/companies/${dataset.companyId}/data?year=${dataset.year}`, {
      method: 'PUT',
      body: JSON.stringify(dataset),
    }),

  importDataset: (companyId, year, file) => {
    const form = new FormData()
    form.append('file', file)
    return request<EsgDataset>(`/companies/${companyId}/data/import?year=${year}`, {
      method: 'POST',
      body: form,
    })
  },

  getReport: (companyId, year, framework: Framework) =>
    request<Report>(`/companies/${companyId}/reports?year=${year}&framework=${framework}`),

  generateSection: (reportId, section: ReportSectionKey, signal) =>
    request(`/reports/${reportId}/sections/${section}/generate`, { method: 'POST', signal }),

  saveSection: (reportId, section, body) =>
    request<void>(`/reports/${reportId}/sections/${section}`, {
      method: 'PUT',
      body: JSON.stringify({ body }),
    }),

  exportPdf: async (reportId) => {
    const res = await fetch(`${BASE}/reports/${reportId}/export`, { method: 'POST' })
    if (!res.ok) throw new ApiError(`Export failed: ${res.status}`, res.status)
    return res.blob()
  },

  chat: (companyId, year, messages: ChatMessage[], signal) =>
    request<ChatMessage>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ companyId, year, messages }),
      signal,
    }),
}
