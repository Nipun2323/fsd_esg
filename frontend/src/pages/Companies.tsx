import { useState } from 'react'
import { Building2, Check, Plus } from 'lucide-react'
import { useApp } from '@/lib/store'
import { Button, Card, CardHeader, Field, inputClass, Spinner } from '@/components/ui'

const INDUSTRIES = [
  'Textiles & Apparel',
  'Food Processing',
  'Precision Engineering',
  'Chemicals',
  'Construction & Materials',
  'IT Services',
  'Logistics & Transport',
  'Retail',
  'Pharmaceuticals',
  'Other',
]

export default function Companies() {
  const { companies, company, setCompanyId, addCompany } = useApp()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    industry: INDUSTRIES[0],
    employees: '',
    country: 'India',
    currency: 'INR',
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await addCompany({
        name: form.name.trim(),
        industry: form.industry,
        employees: Number(form.employees) || 0,
        country: form.country,
        currency: form.currency,
      })
      setForm({ name: '', industry: INDUSTRIES[0], employees: '', country: 'India', currency: 'INR' })
      setOpen(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Companies</h1>
          <p className="mt-0.5 text-sm text-ink-2">
            {companies.length} reporting entit{companies.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setOpen((v) => !v)}>
          <Plus size={14} aria-hidden /> Add company
        </Button>
      </div>

      {open && (
        <Card className="animate-rise">
          <CardHeader title="New reporting entity" />
          <form onSubmit={(e) => void submit(e)} className="space-y-5 p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Company name">
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Acme Manufacturing Pvt Ltd"
                  required
                />
              </Field>
              <Field label="Industry">
                <select
                  className={inputClass}
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                >
                  {INDUSTRIES.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </Field>
              <Field label="Employees" unit="headcount">
                <input
                  type="number"
                  min="0"
                  className={`${inputClass} tnum`}
                  value={form.employees}
                  onChange={(e) => setForm({ ...form, employees: e.target.value })}
                  placeholder="120"
                />
              </Field>
              <Field label="Country" hint="Determines which grid emission factor is suggested.">
                <select
                  className={inputClass}
                  value={form.country}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      country: e.target.value,
                      currency: e.target.value === 'India' ? 'INR' : 'EUR',
                    })
                  }
                >
                  <option>India</option>
                  <option>Germany</option>
                  <option>France</option>
                  <option>Netherlands</option>
                  <option>Other</option>
                </select>
              </Field>
            </div>
            {error && <p className="text-xs" style={{ color: 'var(--critical)' }}>{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? <Spinner size={14} /> : null} Create
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {companies.map((c) => {
          const active = company?.id === c.id
          return (
            <Card
              key={c.id}
              as="div"
              className={`p-4 transition-colors ${active ? 'border-brand' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                  style={{ background: 'var(--brand-wash)', color: 'var(--brand-ink)' }}
                >
                  <Building2 size={17} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                  <p className="mt-0.5 text-xs text-ink-2">{c.industry}</p>
                </div>
                {active && <Check size={16} style={{ color: 'var(--brand)' }} aria-label="Selected" />}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {[
                  ['Employees', c.employees],
                  ['Country', c.country],
                  ['Years', c.years.length],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-ink-muted">{k}</dt>
                    <dd className="tnum mt-0.5 font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              {!active && (
                <Button size="sm" className="mt-3 w-full" onClick={() => setCompanyId(c.id)}>
                  Select
                </Button>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
