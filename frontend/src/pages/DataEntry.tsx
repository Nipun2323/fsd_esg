import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Download, Save } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/lib/store'
import type { EsgDataset } from '@/types'
import { METRICS, metricsForPillar } from '@/data/metrics'
import { PILLAR_LABEL } from '@/data/frameworks'
import type { Pillar } from '@/types'
import { Button, Card, CardHeader, Callout, Field, inputClass, Spinner } from '@/components/ui'

const PILLARS: Pillar[] = ['E', 'S', 'G']

export default function DataEntry() {
  const { year, company, refresh } = useApp()
  const [dataset, setDataset] = useState<EsgDataset | null>(null)
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<Pillar>('E')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const loadDataset = useCallback(async () => {
    if (!company) return
    setLoading(true)
    try {
      setDataset(await api.getDataset(company.id, year))
    } catch (e) {
      setNotice({ tone: 'err', text: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }, [company, year])

  useEffect(() => {
    void loadDataset()
  }, [loadDataset])

  useEffect(() => {
    if (!dataset) return
    const next: Record<string, string> = {}
    for (const m of METRICS) {
      const v = dataset.values[m.key]
      next[m.key] = v === null || v === undefined ? '' : String(v)
    }
    setDraft(next)
    setSaved(false)
  }, [dataset])

  const dirty = useMemo(() => {
    if (!dataset) return false
    return METRICS.some((m) => {
      const original = dataset.values[m.key]
      const current = draft[m.key]
      const normalised = current === '' || current === undefined ? null : Number(current)
      return (original ?? null) !== normalised
    })
  }, [draft, dataset])

  const filled = METRICS.filter((m) => draft[m.key] !== '' && draft[m.key] !== undefined).length

  const set = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
  }

  const onSave = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const values: Record<string, number | null> = {}
      for (const m of METRICS) {
        const raw = draft[m.key]
        values[m.key] = raw === '' || raw === undefined ? null : Number(raw)
      }
      if (!company) return
      const saved = await api.saveDataset({ companyId: company.id, year, values })
      setDataset(saved)
      await refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setNotice({ tone: 'err', text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }


  const downloadTemplate = () => {
    const csv = ['metric,value,unit,label', ...METRICS.map((m) => `${m.key},,${m.unit},"${m.label}"`)].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'esg-data-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!company) {
    return <Callout>Choose a company in the search bar above to enter its data.</Callout>
  }

  if (loading && !dataset) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-muted">
        <Spinner /> Loading
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Data entry</h1>
          <p className="mt-0.5 text-sm text-ink-2">
            {company?.name} · FY {year} · {filled} of {METRICS.length} metrics entered
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={downloadTemplate} size="sm">
            <Download size={14} aria-hidden /> CSV template
          </Button>
          <Button variant="primary" onClick={() => void onSave()} disabled={!dirty || saving} size="sm">
            {saving ? <Spinner size={14} /> : saved ? <Check size={14} aria-hidden /> : <Save size={14} aria-hidden />}
            {saving ? 'Saving' : saved ? 'Saved' : 'Save'}
          </Button>
        </div>
      </div>

      {notice && (
        <Callout tone={notice.tone === 'err' ? 'warning' : 'info'}>{notice.text}</Callout>
      )}

      <div className="flex gap-1 rounded-lg border border-hairline bg-surface-1 p-1" role="tablist">
        {PILLARS.map((p) => {
          const defs = metricsForPillar(p)
          const done = defs.filter((m) => draft[m.key]).length
          return (
            <button
              key={p}
              role="tab"
              aria-selected={tab === p}
              onClick={() => setTab(p)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                tab === p ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <span
                className="inline-block h-2 w-2 rounded-[2px]"
                style={{ background: `var(--series-${p.toLowerCase()})` }}
                aria-hidden
              />
              {PILLAR_LABEL[p]}
              <span className="tnum text-xs text-ink-muted">
                {done}/{defs.length}
              </span>
            </button>
          )
        })}
      </div>

      <Card>
        <CardHeader
          title={`${PILLAR_LABEL[tab]} metrics`}
          subtitle="Leave a field blank if the figure is genuinely unavailable — a blank is reported as a gap, never as a zero."
        />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {metricsForPillar(tab).map((m) => (
            <Field key={m.key} label={m.label} hint={`${m.help ? `${m.help} ` : ''}Feeds ${m.mapsTo.join(', ')}.`} unit={m.unit}>
              {m.kind === 'boolean' ? (
                <select
                  className={inputClass}
                  value={draft[m.key] ?? ''}
                  onChange={(e) => set(m.key, e.target.value)}
                >
                  <option value="">Not answered</option>
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
              ) : (
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className={`${inputClass} tnum`}
                  value={draft[m.key] ?? ''}
                  placeholder="—"
                  onChange={(e) => set(m.key, e.target.value)}
                />
              )}
            </Field>
          ))}
        </div>
      </Card>

      <Callout title="Prefer to upload a report?">
        The upload page reads a PDF, spreadsheet or text report and extracts these figures
        from it, so you do not have to key them in. Anything it finds lands here, where you
        can correct it.
      </Callout>
    </div>
  )
}
