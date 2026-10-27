import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useApp } from '@/lib/store'
import { metricLabel } from '@/lib/calculator'
import { BRSR_CORE_ATTRIBUTES, NGRBC_PRINCIPLES } from '@/data/frameworks'
import { CoverageChart } from '@/components/Charts'
import { Badge, Callout, Card, CardHeader, Spinner, StatusPill } from '@/components/ui'
import type { DisclosureStatus } from '@/types'

const FILTERS: Array<{ value: DisclosureStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'complete', label: 'Complete' },
  { value: 'partial', label: 'Partial' },
  { value: 'missing', label: 'Not started' },
  { value: 'narrative', label: 'Needs narrative' },
]

export default function Compliance() {
  const { dashboard, framework, year, company, loading } = useApp()
  const [filter, setFilter] = useState<DisclosureStatus | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)

  const disclosures = useMemo(() => dashboard?.disclosures ?? [], [dashboard])
  const summary = dashboard?.compliance ?? null

  const coverage = useMemo(() => {
    const groups = new Map<
      string,
      { group: string; complete: number; partial: number; missing: number; narrative: number }
    >()
    for (const d of disclosures) {
      const row =
        groups.get(d.group) ??
        { group: d.group, complete: 0, partial: 0, missing: 0, narrative: 0 }
      row[d.status] += 1
      groups.set(d.group, row)
    }
    return [...groups.values()]
  }, [disclosures])

  const visible = disclosures.filter((d) => filter === 'all' || d.status === filter)

  const grouped = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const d of visible) {
      map.set(d.group, [...(map.get(d.group) ?? []), d])
    }
    return [...map.entries()]
  }, [visible])

  if (!company) {
    return (
      <Callout>Choose a company in the search bar above to see its readiness.</Callout>
    )
  }

  if (loading && !dashboard) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-muted">
        <Spinner /> Loading
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {framework} readiness
        </h1>
        <p className="mt-0.5 text-sm text-ink-2">
          {company?.name} · FY {year}
        </p>
      </div>

      <Callout tone="warning" title="What this page does and does not tell you">
        This maps the numeric metrics you have entered onto the disclosure structure of each
        framework. Neither BRSR nor the ESRS is satisfied by numbers alone — both require narrative,
        policy and process disclosures, and CSRD additionally requires a double-materiality
        assessment that decides which topical standards apply to you at all. Treat the percentage as
        a progress bar for data collection, not as a conformity opinion.
      </Callout>

      {summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              {
                label: 'Metric coverage',
                value: `${summary.coverage}%`,
                note: `of the ${summary.mandatoryTracked} mandatory disclosure${summary.mandatoryTracked === 1 ? '' : 's'} tracked numerically`,
              },
              { label: 'Complete', value: summary.complete, note: 'every mapped metric entered' },
              { label: 'Partial or missing', value: summary.partial + summary.missing, note: 'metrics still outstanding' },
              {
                label: 'Needs narrative',
                value: summary.narrative,
                note: 'no numeric metric maps to these',
              },
            ].map((t) => (
              <Card key={t.label} className="p-4" as="div">
                <p className="text-xs font-medium text-ink-2">{t.label}</p>
                <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-ink">
                  {t.value}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-ink-muted">{t.note}</p>
              </Card>
            ))}
          </div>
          <Callout tone="warning">
            Read the first figure precisely: it covers{' '}
            <strong className="font-semibold text-ink">
              {summary.mandatoryTracked} of {summary.mandatoryTotal}
            </strong>{' '}
            mandatory {framework} disclosures — the ones with a numeric metric behind them. The
            other {summary.mandatoryTotal - summary.mandatoryTracked}{' '}
            {summary.mandatoryTotal - summary.mandatoryTracked === 1 ? 'has' : 'have'} to be
            written up by a person, so {summary.coverage}% here does not mean the report is
            finished.
          </Callout>
        </>
      )}

      {coverage.length > 0 && <CoverageChart data={coverage} />}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink-2">Show</span>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === f.value
                ? 'border-brand bg-brand-wash text-brand-ink'
                : 'border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {grouped.map(([group, items]) => (
        <Card key={group}>
          <CardHeader title={group} subtitle={`${items.length} disclosure${items.length === 1 ? '' : 's'}`} />
          <ul className="divide-y divide-[var(--border)]">
            {items.map((d) => {
              const expanded = open === d.id
              return (
                <li key={d.id}>
                  <button
                    onClick={() => setOpen(expanded ? null : d.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <ChevronDown
                      size={15}
                      className={`mt-0.5 shrink-0 text-ink-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="tnum text-xs font-semibold text-ink-2">{d.code}</span>
                        <span className="text-sm text-ink">{d.title}</span>
                        {d.mandatory ? (
                          <Badge tone="brand">Mandatory</Badge>
                        ) : (
                          <Badge>Conditional</Badge>
                        )}
                      </p>
                      {d.requires.length > 0 && (
                        <p className="mt-1 text-xs text-ink-muted">
                          {d.requires.length - d.missing.length} of {d.requires.length} metrics
                          entered
                        </p>
                      )}
                    </div>
                    <StatusPill status={d.status} />
                  </button>

                  {expanded && (
                    <div className="animate-rise space-y-3 border-t border-hairline bg-surface-2 px-5 py-4 pl-13">
                      {d.note && <p className="text-xs leading-relaxed text-ink-2">{d.note}</p>}
                      {d.requires.length === 0 ? (
                        <p className="text-xs text-ink-muted">
                          No numeric metric in this platform maps to this disclosure. It will need
                          to be written up directly in the report.
                        </p>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                              Entered
                            </p>
                            <ul className="space-y-1">
                              {d.requires
                                .filter((k) => !d.missing.includes(k))
                                .map((k) => (
                                  <li key={k} className="text-xs text-ink-2">
                                    {metricLabel(k)}
                                  </li>
                                ))}
                              {d.requires.length === d.missing.length && (
                                <li className="text-xs text-ink-muted">None</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                              Still needed
                            </p>
                            <ul className="space-y-1">
                              {d.missing.map((k) => (
                                <li key={k} className="text-xs" style={{ color: 'var(--critical)' }}>
                                  {metricLabel(k)}
                                </li>
                              ))}
                              {d.missing.length === 0 && (
                                <li className="text-xs text-ink-muted">Nothing outstanding</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      ))}

      {framework === 'BRSR' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="The nine NGRBC principles"
              subtitle="Section C is organised as one block per principle, each split into essential (mandatory) and leadership (voluntary) indicators."
            />
            <ul className="divide-y divide-[var(--border)]">
              {NGRBC_PRINCIPLES.map((p) => (
                <li key={p.code} className="px-5 py-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    <span className="tnum text-xs text-ink-muted">{p.code}</span>
                    {p.short}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{p.statement}</p>
                </li>
              ))}
            </ul>
            <p className="border-t border-hairline px-5 py-3 text-[11px] text-ink-muted">
              The principles come from the Ministry of Corporate Affairs' National Guidelines on
              Responsible Business Conduct (2019). SEBI prescribes the BRSR disclosure format built
              around them.
            </p>
          </Card>
          <Card>
            <CardHeader
              title="BRSR Core attributes"
              subtitle="The subset SEBI singled out for assurance."
            />
            <ul className="divide-y divide-[var(--border)]">
              {BRSR_CORE_ATTRIBUTES.map((a) => (
                <li key={a} className="px-5 py-2.5 text-sm text-ink-2">
                  {a}
                </li>
              ))}
            </ul>
            <p className="border-t border-hairline px-5 py-3 text-[11px] text-ink-muted">
              Applicability and assurance timelines are phased by market capitalisation and have
              been revised more than once. Confirm the current position against the live SEBI
              circular before planning around a date.
            </p>
          </Card>
        </div>
      ) : (
        <Callout title="A note on CSRD scope">
          Which ESRS topical standards apply to you is determined by your own double-materiality
          assessment — assessing both how sustainability matters affect the business and how the
          business affects people and the environment. This platform does not perform that
          assessment, so every topical standard is shown here as conditional. Scope thresholds and
          timing under CSRD have been amended since the standards were adopted; verify where your
          company falls before committing to a reporting year.
        </Callout>
      )}
    </div>
  )
}
