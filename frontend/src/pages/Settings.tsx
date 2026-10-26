import { useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { useApp } from '@/lib/store'
import { DEFAULT_FACTORS, EMISSION_FACTORS } from '@/data/metrics'
import { USING_MOCK } from '@/api/client'
import { Badge, Button, Callout, Card, CardHeader, Field, inputClass } from '@/components/ui'

export default function Settings() {
  const { factors, setFactors } = useApp()
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, String(v)])),
  )
  const [saved, setSaved] = useState(false)

  const apply = () => {
    const next: Record<string, number> = {}
    for (const [k, v] of Object.entries(draft)) {
      const n = Number(v)
      next[k] = Number.isFinite(n) && n > 0 ? n : DEFAULT_FACTORS[k]
    }
    setFactors(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const reset = () => {
    setDraft(Object.fromEntries(Object.entries(DEFAULT_FACTORS).map(([k, v]) => [k, String(v)])))
    setFactors({ ...DEFAULT_FACTORS })
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-sm text-ink-2">Emission factors and backend connection.</p>
      </div>

      <Card>
        <CardHeader
          title="Emission factors"
          subtitle="Every derived emissions figure depends on these. Change one and recalculation is immediate."
          action={
            <div className="flex gap-2">
              <Button size="sm" onClick={reset}>
                <RotateCcw size={13} aria-hidden /> Reset
              </Button>
              <Button size="sm" variant="primary" onClick={apply}>
                {saved ? <Check size={13} aria-hidden /> : null}
                {saved ? 'Applied' : 'Apply'}
              </Button>
            </div>
          }
        />
        <div className="divide-y divide-[var(--border)]">
          {EMISSION_FACTORS.map((f) => {
            const overridden = Number(draft[f.key]) !== f.value
            return (
              <div key={f.key} className="grid gap-4 p-5 sm:grid-cols-[1fr_200px]">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {f.label}
                    {overridden && <Badge tone="brand">Overridden</Badge>}
                  </p>
                  <p className="mt-1 text-xs text-ink-2">
                    {f.source} · {f.vintage}
                  </p>
                  {f.caveat && (
                    <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--serious)' }}>
                      {f.caveat}
                    </p>
                  )}
                </div>
                <Field label="Value" unit={f.unit}>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className={`${inputClass} tnum`}
                    value={draft[f.key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  />
                </Field>
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Backend connection" />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink">Current mode</span>
            <Badge tone={USING_MOCK ? 'warning' : 'brand'}>
              {USING_MOCK ? 'Demo — bundled data' : 'Live backend'}
            </Badge>
          </div>
          <Callout title="Switching to the Python backend">
            Set these in <code className="font-mono">.env</code> and restart the dev server. No
            other change is needed — every screen goes through one typed API client.
            <pre className="mt-2 overflow-x-auto rounded-md bg-surface-1 p-3 font-mono text-[11px] leading-relaxed text-ink-2">
{`VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:8000`}
            </pre>
          </Callout>
          <p className="text-xs leading-relaxed text-ink-2">
            The endpoints the client expects are declared in{' '}
            <code className="font-mono">src/api/types.ts</code>, and{' '}
            <code className="font-mono">BACKEND.md</code> maps each one to the Python module in
            your outline that should serve it.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Scope and limitations" />
        <ul className="space-y-2.5 p-5 text-xs leading-relaxed text-ink-2">
          {[
            'Scope 3 (value-chain) emissions are not calculated. For many SMEs these dominate the total footprint.',
            'Scope 2 uses the location-based method only. A market-based figure needs contractual instrument data this platform does not collect.',
            'Readiness percentages reflect numeric metrics only. Both BRSR and the ESRS also require narrative, policy and process disclosures.',
            'CSRD applicability depends on a double-materiality assessment, which this platform does not perform.',
            'Nothing here constitutes assurance. Figures should be reviewed by a competent person before filing.',
          ].map((l) => (
            <li key={l} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" aria-hidden />
              {l}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
