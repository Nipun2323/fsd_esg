import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  FileUp,
  Minus,
  Search,
  TriangleAlert,
} from 'lucide-react'
import { useApp } from '@/lib/store'
import { formatValue } from '@/lib/calculator'
import { CompanySearch } from '@/components/CompanySearch'
import { RatingPanel } from '@/components/RatingPanel'
import {
  EmissionsTrendChart,
  EnergyMixChart,
  IntensityTrendChart,
  PillarScoreChart,
} from '@/components/Charts'
import { Button, Callout, Card, CardHeader, EmptyState, Spinner } from '@/components/ui'

function Delta({
  value,
  previous,
  lowerIsBetter,
}: {
  value: number
  previous?: number
  lowerIsBetter?: boolean
}) {
  if (previous === undefined || previous === 0) {
    return <span className="text-xs text-ink-muted">no prior year</span>
  }
  const pct = ((value - previous) / Math.abs(previous)) * 100
  if (Math.abs(pct) < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
        <Minus size={12} aria-hidden /> flat
      </span>
    )
  }
  const rising = pct > 0
  const good = lowerIsBetter ? !rising : rising
  const Icon = rising ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium"
      style={{ color: good ? 'var(--success-text)' : 'var(--critical)' }}
    >
      <Icon size={12} aria-hidden />
      {Math.abs(pct).toFixed(1)}%
      <span className="sr-only">{good ? 'improved' : 'worsened'} versus prior year</span>
    </span>
  )
}

function StatTile({
  label,
  value,
  unit,
  previous,
  lowerIsBetter,
}: {
  label: string
  value: number
  unit: string
  previous?: number
  lowerIsBetter?: boolean
}) {
  return (
    <Card className="p-4" as="div">
      <p className="text-xs font-medium text-ink-2">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-ink">
          {formatValue(value, unit)}
        </span>
        {unit !== '%' && <span className="text-xs text-ink-muted">{unit}</span>}
      </p>
      <div className="mt-1.5">
        <Delta value={value} previous={previous} lowerIsBetter={lowerIsBetter} />
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const { company, dashboard, loading, error, year, framework, selectCompany } = useApp()

  // Nothing is fetched until a company is named — this is the resting
  // state of the app, not an error.
  if (!company) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="mb-6 text-center">
          <span
            className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl"
            style={{ background: 'var(--brand-wash)', color: 'var(--brand-ink)' }}
          >
            <Search size={20} aria-hidden />
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            Which company?
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            Search the imported dataset by name or ticker. Nothing is loaded until you pick
            one.
          </p>
        </div>
        <CompanySearch onSelect={selectCompany} autoFocus />
        <p className="mt-4 text-center text-xs text-ink-muted">
          Try “Disney”, “Tesla”, or a ticker like “DIS”.
        </p>
      </div>
    )
  }

  if (loading && !dashboard) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-muted">
        <Spinner /> Loading {company.name}
      </div>
    )
  }

  if (error) {
    return <Callout tone="warning" title="Could not load this company">{error}</Callout>
  }

  if (!dashboard) return null

  const { metrics, scores, gaps, compliance, history, ratingPillars, industryBenchmark } =
    dashboard

  const headline = ['totalCo2', 'renewableShare', 'genderDiversity', 'ltifr']
    .map((k) => metrics.find((m) => m.key === k))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))

  const highGaps = gaps.filter((g) => g.severity === 'high')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt=""
              className="h-10 w-10 rounded-lg border border-hairline bg-white object-contain p-1"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-ink-muted">
              <Building2 size={18} aria-hidden />
            </span>
          )}
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{company.name}</h1>
            <p className="mt-0.5 text-sm text-ink-2">
              {[company.ticker, company.industry, `FY ${year}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <Link to="/compliance" className="text-right">
          <p className="text-xs text-ink-2">{framework} metric coverage</p>
          <p className="tnum text-2xl font-semibold tracking-tight text-ink">
            {compliance.coverage}%
          </p>
          <p className="text-[11px] text-ink-muted">
            {compliance.mandatoryTracked} of {compliance.mandatoryTotal} mandatory tracked
          </p>
        </Link>
      </div>

      {!dashboard.hasActivityData && (
        <Card>
          <EmptyState
            icon={<FileUp size={28} />}
            title={`No activity data for FY ${year}`}
            body={
              'The ratings dataset carries scores and grades, but no energy, water, waste or ' +
              'headcount figures — so emissions cannot be calculated from it. Upload this ' +
              "company's own report and those numbers are extracted from it."
            }
            action={
              <Link to="/upload">
                <Button variant="primary">
                  Upload a report <ArrowRight size={14} aria-hidden />
                </Button>
              </Link>
            }
          />
        </Card>
      )}

      {ratingPillars.length > 0 && (
        <RatingPanel pillars={ratingPillars} benchmark={industryBenchmark} />
      )}

      {headline.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {headline.map((m) => (
            <StatTile
              key={m.key}
              label={m.label}
              value={m.value}
              unit={m.unit}
              previous={m.previous}
              lowerIsBetter={m.lowerIsBetter}
            />
          ))}
        </div>
      )}

      {highGaps.length > 0 && dashboard.hasActivityData && (
        <Card as="div">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <TriangleAlert size={15} style={{ color: 'var(--warning)' }} aria-hidden />
                {highGaps.length} high-priority data gap{highGaps.length === 1 ? '' : 's'}
              </span>
            }
            subtitle="These block mandatory disclosures under the selected framework."
            action={
              <Link to="/data">
                <Button size="sm">Fill them in</Button>
              </Link>
            }
          />
          <ul className="divide-y divide-[var(--border)]">
            {highGaps.slice(0, 4).map((g) => (
              <li
                key={g.metricKey}
                className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm"
              >
                <span className="text-ink">{g.label}</span>
                <span className="ml-auto text-xs text-ink-muted">{g.blocks.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dashboard.hasActivityData && (
        <div className="grid gap-4 lg:grid-cols-2">
          <PillarScoreChart data={scores} />
          {history.length > 1 ? (
            <EmissionsTrendChart data={history} />
          ) : (
            <Card>
              <EmptyState
                icon={<TriangleAlert size={24} />}
                title="One year of data"
                body="Trends appear once a second year has been entered or uploaded."
              />
            </Card>
          )}
          {history.length > 1 && (
            <IntensityTrendChart
              data={history.map((h) => ({ year: h.year, value: h.intensity }))}
            />
          )}
          {history.length > 1 && <EnergyMixChart data={history} />}
        </div>
      )}

      {metrics.length > 0 && (
        <Card>
          <CardHeader
            title="All calculated metrics"
            subtitle={`${metrics.length} derived from the figures on record. Overall readiness ${dashboard.overall}/100.`}
          />
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  {['Metric', 'Pillar', 'Value', 'Prior year', 'Change', 'Basis'].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-xs font-semibold text-ink-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.key} className="border-b border-hairline last:border-0">
                    <td className="px-5 py-2.5 text-ink">{m.label}</td>
                    <td className="px-5 py-2.5">
                      <span
                        className="inline-block h-2 w-2 rounded-[2px]"
                        style={{ background: `var(--series-${m.pillar.toLowerCase()})` }}
                        aria-hidden
                      />
                      <span className="ml-2 text-ink-2">{m.pillar}</span>
                    </td>
                    <td className="tnum px-5 py-2.5 font-medium text-ink">
                      {formatValue(m.value, m.unit)}{' '}
                      <span className="text-xs font-normal text-ink-muted">{m.unit}</span>
                    </td>
                    <td className="tnum px-5 py-2.5 text-ink-2">
                      {m.previous !== undefined ? formatValue(m.previous, m.unit) : '—'}
                    </td>
                    <td className="px-5 py-2.5">
                      <Delta
                        value={m.value}
                        previous={m.previous}
                        lowerIsBetter={m.lowerIsBetter}
                      />
                    </td>
                    <td className="px-5 py-2.5 text-xs text-ink-muted">{m.basis ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-hairline px-5 py-3 text-[11px] leading-relaxed text-ink-muted">
            Scope 2 uses a grid factor of 0.727 kg CO₂e/kWh (CEA weighted average, FY
            2023-24). Scope 3 is not calculated.
          </p>
        </Card>
      )}
    </div>
  )
}
