import type { EsgApi } from './types'
import { httpApi } from './http'

/**
 * The backend is the only data source. Demo data has been removed — the
 * companies now come from the imported ratings dataset in ../backend.
 */
export const api: EsgApi = httpApi

export { ApiError } from './types'
export type { EsgApi } from './types'
export { getToken, setToken, setUnauthorizedHandler } from './http'
