import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, FileText, RefreshCw, Sparkles, Wand2 } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/lib/store'
import { metricLabel } from '@/lib/calculator'
import type { Report, ReportSectionKey } from '@/types'
import { Badge, Button, Callout, Card, CardHeader, Spinner } from '@/components/ui'

export default function ReportBuilder() {
  const { company, year, framework, aiEnabled } = useApp()
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<ReportSectionKey | 'all' | null>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<ReportSectionKey | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!company) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .getReport(company.id, year, framework)
      .then((r) => !cancelled && setReport(r))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [company, year, framework])

  const generate = useCallback(
    async (key: ReportSectionKey) => {
      if (!report) return
      setGenerating(key)
      setError(null)
      const controller = new AbortController()
      abortRef.current = controller
      try {
        // The endpoint returns the whole report, so there is nothing to
        // merge by hand — the server's copy is the source of truth.
        setReport(await api.generateSection(report.id, key, controller.signal))
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setGenerating(null)
        abortRef.current = null
      }
    },
    [report],
  )

  const generateAll = useCallback(async () => {
    if (!report) return
    setGenerating('all')
    setError(null)
    try {
      let latest = report
      for (const section of report.sections) {
        latest = await api.generateSection(latest.id, section.key)
        setReport(latest)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(null)
    }
  }, [report])

  const edit = (key: ReportSectionKey, body: string) => {
    setReport((r) =>
      r ? { ...r, sections: r.sections.map((s) => (s.key === key ? { ...s, body, edited: true } : s)) } : r,
    )
  }

  const save = async (key: ReportSectionKey) => {
    if (!report) return
    const section = report.sections.find((s) => s.key === key)
    if (!section) return
    setReport(await api.saveSection(report.id, key, section.body))
    setSavedKey(key)
    setTimeout(() => setSavedKey(null), 2000)
  }

  const exportPdf = async () => {
    if (!report) return
    setExporting(true)
    setError(null)
    try {
      const blob = await api.exportPdf(report.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = blob.type === 'application/pdf' ? 'pdf' : 'txt'
      a.download = `${company?.name.replace(/\s+/g, '-').toLowerCase() ?? 'esg'}-${year}-${framework.toLowerCase()}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  if (!company) {
    return <Callout>Choose a company in the search bar above to build its report.</Callout>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-muted">
        <Spinner /> Loading report
      </div>
    )
  }

  if (!report) {
    return <Callout tone="warning">{error ?? 'No report could be loaded.'}</Callout>
  }

  const anyGenerated = report.sections.some((s) => s.body)
  const wordCount = report.sections.reduce(
    (a, s) => a + (s.body ? s.body.trim().split(/\s+/).length : 0),
    0,
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Report</h1>
          <p className="mt-0.5 text-sm text-ink-2">
            {company?.name} · FY {year} · {framework} · {wordCount} words
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void generateAll()} disabled={generating !== null} size="sm">
            {generating === 'all' ? <Spinner size={14} /> : <Wand2 size={14} aria-hidden />}
            {generating === 'all' ? 'Drafting…' : 'Draft all sections'}
          </Button>
          <Button variant="primary" onClick={() => void exportPdf()} disabled={!anyGenerated || exporting} size="sm">
            {exporting ? <Spinner size={14} /> : <Download size={14} aria-hidden />}
            Export
          </Button>
        </div>
      </div>

      {error && <Callout tone="warning">{error}</Callout>}

      <Callout title="Review before you publish">
        Drafts are generated from the figures you entered and nothing else. Read every section
        before export — the model can phrase a correct number misleadingly, and no automated check
        catches that. Edits you make here are kept and are never overwritten unless you regenerate
        that section.
        {aiEnabled === false && (
          <>
            {' '}
            No Gemini key is configured, so the text is assembled from templates rather than a
            language model — the prose is more rigid, and each section says so.
          </>
        )}
      </Callout>

      <div className="space-y-4">
        {report.sections.map((section) => {
          const busy = generating === section.key || generating === 'all'
          return (
            <Card key={section.key}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {section.title}
                    {section.edited && <Badge tone="brand">Edited</Badge>}
                    {section.generatedAt && !section.edited && (
                      <Badge tone={section.usedAi ? 'brand' : 'warning'}>
                        {section.usedAi ? 'AI draft' : 'Template draft'}
                      </Badge>
                    )}
                  </span>
                }
                subtitle={
                  section.groundedIn.length > 0
                    ? `Grounded in ${section.groundedIn.length} metric${section.groundedIn.length === 1 ? '' : 's'}`
                    : 'No metrics available for this section yet'
                }
                action={
                  <div className="flex gap-2">
                    {section.body && (
                      <Button size="sm" onClick={() => void save(section.key)}>
                        {savedKey === section.key ? <Check size={13} aria-hidden /> : null}
                        {savedKey === section.key ? 'Saved' : 'Save'}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => void generate(section.key)} disabled={busy}>
                      {busy ? (
                        <Spinner size={13} />
                      ) : section.body ? (
                        <RefreshCw size={13} aria-hidden />
                      ) : (
                        <Sparkles size={13} aria-hidden />
                      )}
                      {busy ? 'Drafting' : section.body ? 'Regenerate' : 'Draft'}
                    </Button>
                  </div>
                }
              />

              <div className="p-5">
                {section.body ? (
                  <>
                    <textarea
                      value={section.body}
                      onChange={(e) => edit(section.key, e.target.value)}
                      // Sized from character count, not newlines — paragraphs
                      // wrap, so counting lines under-sizes the box badly.
                      rows={Math.min(
                        Math.max(
                          Math.ceil(section.body.length / 95) +
                            section.body.split('\n\n').length,
                          8,
                        ),
                        26,
                      )}
                      aria-label={`${section.title} text`}
                      className="w-full resize-y rounded-lg border border-hairline-strong bg-surface-1 p-3.5 text-sm leading-relaxed text-ink transition-colors focus:border-brand focus:outline-none"
                    />
                    {section.groundedIn.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                          Figures used
                        </span>
                        {[...new Set(section.groundedIn)].map((k) => (
                          <span
                            key={k}
                            className="rounded border border-hairline px-1.5 py-0.5 text-[10px] text-ink-muted"
                          >
                            {metricLabel(k)}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2.5 py-8 text-center">
                    <FileText size={22} className="text-ink-muted" aria-hidden />
                    <p className="text-sm text-ink-2">Not drafted yet.</p>
                    <Button size="sm" onClick={() => void generate(section.key)} disabled={busy}>
                      <Sparkles size={13} aria-hidden /> Draft this section
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
