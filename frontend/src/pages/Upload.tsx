import { useRef, useState } from 'react'
import { CheckCircle2, FileUp, Sparkles, TriangleAlert, Upload as UploadIcon } from 'lucide-react'
import { api } from '@/api/client'
import { useApp } from '@/lib/store'
import { METRICS_BY_KEY } from '@/data/metrics'
import type { UploadResult } from '@/types'
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Spinner } from '@/components/ui'

const ACCEPT = '.pdf,.txt,.md,.csv,.xlsx,.xlsm,.html'

export default function UploadPage() {
  const { company, year, refresh, aiEnabled } = useApp()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!company) {
    return (
      <Card>
        <EmptyState
          icon={<FileUp size={28} />}
          title="Choose a company first"
          body="Search for a company in the bar above, then upload its report here."
        />
      </Card>
    )
  }

  const send = async (file: File) => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.uploadReport(company.id, year, file)
      setResult(res)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const extractedCount = result ? Object.keys(result.extracted).length : 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Upload a report</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          {company.name} · FY {year}
        </p>
      </div>

      <Callout title="What happens to your file">
        The report is read, the ESG figures are extracted from it, and those figures are
        merged into this company's data for FY {year}. A metric the document does not state
        is left out — never recorded as zero. Review everything on the dashboard before you
        rely on it.
        {aiEnabled === false && (
          <>
            {' '}
            <strong className="font-semibold text-ink">
              No Gemini key is configured
            </strong>
            , so extraction falls back to pattern matching, which finds far less and is
            easier to fool. Set <code className="font-mono">GEMINI_API_KEY</code> in{' '}
            <code className="font-mono">backend/.env</code> for proper extraction.
          </>
        )}
      </Callout>

      <Card>
        <CardHeader
          title="Report file"
          subtitle="PDF, Excel, CSV, Markdown, HTML or plain text. Up to 20 MB."
        />
        <div className="p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) void send(f)
            }}
            className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
              dragging ? 'border-brand bg-brand-wash' : 'border-hairline-strong'
            }`}
          >
            {busy ? (
              <>
                <Spinner size={24} />
                <p className="text-sm text-ink">Reading the document…</p>
                <p className="max-w-sm text-xs text-ink-muted">
                  A long report can take a while. The figures are extracted, not guessed.
                </p>
              </>
            ) : (
              <>
                <UploadIcon size={26} className="text-ink-muted" aria-hidden />
                <p className="text-sm text-ink">Drop a file here, or</p>
                <Button variant="primary" onClick={() => fileRef.current?.click()}>
                  <FileUp size={14} aria-hidden /> Choose a file
                </Button>
                <p className="text-xs text-ink-muted">
                  Scanned PDFs have no text layer and need OCR first.
                </p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void send(f)
              }}
            />
          </div>
        </div>
      </Card>

      {error && (
        <Callout tone="warning" title="That upload did not work">
          {error}
        </Callout>
      )}

      {result && (
        <Card className="animate-rise">
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {extractedCount > 0 ? (
                  <CheckCircle2 size={15} style={{ color: 'var(--good)' }} aria-hidden />
                ) : (
                  <TriangleAlert size={15} style={{ color: 'var(--warning)' }} aria-hidden />
                )}
                {result.filename}
                {result.usedAi ? (
                  <Badge tone="brand">
                    <Sparkles size={9} className="mr-1 inline" aria-hidden />
                    AI extracted
                  </Badge>
                ) : (
                  <Badge tone="warning">Pattern matched</Badge>
                )}
              </span>
            }
            subtitle={`${(result.sizeBytes / 1024).toFixed(0)} KB · ${extractedCount} metric${
              extractedCount === 1 ? '' : 's'
            } found`}
          />

          <div className="space-y-4 p-5">
            {result.extractionNote && (
              <p className="text-xs leading-relaxed text-ink-2">{result.extractionNote}</p>
            )}

            {extractedCount === 0 ? (
              <p className="text-sm text-ink-2">
                No recognisable ESG figures were found. Check the document actually contains
                them, or enter the numbers by hand on the data entry page.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left">
                      <th className="py-2 pr-4 text-xs font-semibold text-ink-2">Metric</th>
                      <th className="py-2 pr-4 text-xs font-semibold text-ink-2">Value</th>
                      <th className="py-2 text-xs font-semibold text-ink-2">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.extracted).map(([key, value]) => {
                      const def = METRICS_BY_KEY[key]
                      const isBool = def?.kind === 'boolean'
                      return (
                        <tr key={key} className="border-b border-hairline last:border-0">
                          <td className="py-2 pr-4 text-ink">{def?.label ?? key}</td>
                          <td className="tnum py-2 pr-4 font-medium text-ink">
                            {isBool ? (value === 1 ? 'Yes' : 'No') : value.toLocaleString()}
                          </td>
                          <td className="py-2 text-xs text-ink-muted">
                            {isBool ? '' : (def?.unit ?? '')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
