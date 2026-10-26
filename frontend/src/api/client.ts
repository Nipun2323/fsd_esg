import type { EsgApi } from './types'
import { mockApi } from './mock'
import { httpApi } from './http'

/**
 * The single switch between demo data and the Python backend.
 *
 * Set VITE_USE_MOCK=false and VITE_API_BASE_URL=<your FastAPI host>
 * in .env, and every screen in the app talks to the real service
 * with no other change.
 */
export const USING_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

export const api: EsgApi = USING_MOCK ? mockApi : httpApi

export { ApiError } from './types'
export type { EsgApi } from './types'
