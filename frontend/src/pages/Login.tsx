import { useState } from 'react'
import { Leaf, LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button, Callout, Field, inputClass, Spinner } from '@/components/ui'

type Mode = 'login' | 'signup'

export default function Login() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    username: '',
    password: '',
    email: '',
    company_name: '',
    ticker: '',
    industry: '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login(form.username.trim(), form.password)
      } else {
        await signup({
          username: form.username.trim(),
          password: form.password,
          email: form.email.trim() || undefined,
          company_name: form.company_name.trim() || undefined,
          ticker: form.ticker.trim() || undefined,
          industry: form.industry.trim() || undefined,
        })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const useDemo = () => {
    setMode('login')
    setForm({ ...form, username: 'Admin', password: '12345' })
    setError(null)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2.5 text-center">
          <span
            className="grid h-11 w-11 place-items-center rounded-xl text-white"
            style={{ background: 'var(--brand)' }}
          >
            <Leaf size={22} aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">Verdant ESG</h1>
            <p className="text-xs text-ink-2">
              ESG reporting for BRSR and CSRD
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-surface-1 p-6">
          <div
            className="mb-5 flex gap-0.5 rounded-lg border border-hairline p-0.5"
            role="tablist"
          >
            {(['login', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m)
                  setError(null)
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === m ? 'bg-brand text-white' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <Field label="Username">
              <input
                id="username"
                className={inputClass}
                value={form.username}
                onChange={set('username')}
                autoComplete="username"
                required
                minLength={3}
              />
            </Field>

            <Field label="Password">
              <input
                id="password"
                type="password"
                className={inputClass}
                value={form.password}
                onChange={set('password')}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'signup' ? 5 : undefined}
              />
            </Field>

            {mode === 'signup' && (
              <>
                <Field label="Email" hint="Optional.">
                  <input
                    id="email"
                    type="email"
                    className={inputClass}
                    value={form.email}
                    onChange={set('email')}
                    autoComplete="email"
                  />
                </Field>
                <Field
                  label="Company"
                  hint="If it is already in the database we'll link to it rather than create a duplicate."
                >
                  <input
                    id="company_name"
                    className={inputClass}
                    value={form.company_name}
                    onChange={set('company_name')}
                    placeholder="Walt Disney Co"
                  />
                </Field>
                <Field label="Ticker" hint="Optional, helps match the right company.">
                  <input
                    id="ticker"
                    className={`${inputClass} uppercase`}
                    value={form.ticker}
                    onChange={set('ticker')}
                    placeholder="DIS"
                    maxLength={8}
                  />
                </Field>
              </>
            )}

            {error && (
              <p className="text-xs leading-relaxed" style={{ color: 'var(--critical)' }}>
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" disabled={busy} className="w-full">
              {busy ? (
                <Spinner size={14} />
              ) : mode === 'login' ? (
                <LogIn size={14} aria-hidden />
              ) : (
                <UserPlus size={14} aria-hidden />
              )}
              {busy ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>

        <div className="mt-4">
          <Callout title="Demo login">
            Username <code className="font-mono">Admin</code>, password{' '}
            <code className="font-mono">12345</code>.{' '}
            <button
              type="button"
              onClick={useDemo}
              className="font-medium underline underline-offset-2"
              style={{ color: 'var(--brand-ink)' }}
            >
              Fill it in
            </button>
            <br />
            <span className="mt-1 block">
              These credentials are for local development. Change{' '}
              <code className="font-mono">DEFAULT_ADMIN_PASSWORD</code> before this is
              reachable from anywhere but your own machine.
            </span>
          </Callout>
        </div>
      </div>
    </div>
  )
}
