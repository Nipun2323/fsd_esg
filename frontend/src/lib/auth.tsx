import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from '@/api/client'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  signup: (input: {
    username: string
    password: string
    email?: string
    company_name?: string
    ticker?: string
    industry?: string
  }) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  // A 401 from any request drops us back to the login screen rather
  // than leaving the UI in a half-authenticated state.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  // Restore the session from a stored token on first load.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    let cancelled = false
    api
      .me()
      .then((u) => !cancelled && setUser(u))
      .catch(() => {
        if (!cancelled) setToken(null)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const { user: u } = await api.login(username, password)
    setUser(u)
  }, [])

  const signup = useCallback(async (input: Parameters<AuthState['signup']>[0]) => {
    const { user: u } = await api.signup(input)
    setUser(u)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading, login, signup, logout],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
