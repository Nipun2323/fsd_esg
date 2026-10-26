import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, Save, Upload } from 'lucide-react'
import { useApp } from '@/lib/store'
import { METRICS, metricsForPillar } from '@/data/metrics'
import { PILLAR_LABEL } from '@/data/frameworks'
import type { Pillar } from '@/types'
import { Button, Card, CardHeader, Callout, Field, inputClass, Spinner } from '@/components/ui'

const PILLARS: Pillar[] = ['E', 'S', 'G']

export default function DataEntry() {
  const { dataset, year, company, saveDataset, importFile, loading } = useApp()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<Pillar>('E')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
      await saveDataset(values)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setNotice({ tone: 'err', text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const onImport = async (file: File) => {
    setNotice(null)
    try {
      const count = await importFile(file)
      setNotice({ tone: 'ok', text: `Imported ${count} value${count === 1 ? '' : 's'} from ${file.name}.` })
    } catch (e) {
      setNotice({ tone: 'err', text: (e as Error).message })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
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
          <Button onClick={() => fileRef.current?.click()} size="sm">
            <Upload size={14} aria-hidden /> Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImport(f)
            }}
          />
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

      <Callout title="CSV import format">
        A two-column file with headers <code className="font-mono">metric</code> and{' '}
        <code className="font-mono">value</code>. The <code className="font-mono">metric</code>{' '}
        column must use the machine keys from the template above — rows with an unrecognised key are
        skipped and reported rather than silently dropped.
      </Callout>
    </div>
  )
}
