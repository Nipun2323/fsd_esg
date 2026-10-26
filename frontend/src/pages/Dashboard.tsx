import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, TriangleAlert } from 'lucide-react'
import { useApp } from '@/lib/store'
import { calculate, findGaps, formatValue, overallScore, scorePillars } from '@/lib/calculator'
import { evaluate, summarise } from '@/lib/compliance'
import { DATASETS } from '@/api/mockData'
import {
  EmissionsTrendChart,
  EnergyMixChart,
  IntensityTrendChart,
  PillarScoreChart,
} from '@/components/Charts'
import { Button, Card, CardHeader, EmptyState, Spinner } from '@/components/ui'
import { DEFAULT_FACTORS } from '@/data/metrics'

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
        <Minus size={12} aria-hidden />
        flat
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
  basis,
}: {
  label: string
  value: number
  unit: string
  previous?: number
  lowerIsBetter?: boolean
  basis?: string
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
      {basis && <p className="mt-2 text-[11px] leading-snug text-ink-muted">{basis}</p>}
    </Card>
  )
}

export default function Dashboard() {
  const { company, year, dataset, previous, framework, factors, loading } = useApp()

  const calc = useMemo(
    () => (dataset ? calculate(dataset, { previous, factors }) : []),
    [dataset, previous, factors],
  )
  const scores = useMemo(
    () => (dataset ? scorePillars(dataset, previous) : []),
    [dataset, previous],
  )
  const gaps = useMemo(() => (dataset ? findGaps(dataset) : []), [dataset])
  const compliance = useMemo(
    () => (dataset ? summarise(evaluate(dataset, framework), framework) : null),
    [dataset, framework],
  )

  /** Multi-year series. With a live backend this is one extra endpoint. */
  const history = useMemo(() => {
    if (!company) return []
    const byYear = DATASETS[company.id]
    if (!byYear) return []
    return Object.entries(byYear)
      .map(([y, values]) => {
        const c = calculate({ companyId: company.id, year: Number(y), values }, { factors })
        const get = (k: string) => c.find((m) => m.key === k)?.value ?? 0
        return {
          year: Number(y),
          scope1: Math.round(get('scope1') * 10) / 10,
          scope2: Math.round(get('scope2') * 10) / 10,
          intensity: Math.round(get('intensityPerEmployee')),
          renewable: Math.round((values.renewable_kwh ?? 0) / 1000),
          grid: Math.round((values.electricity_kwh ?? 0) / 1000),
        }
      })
      .sort((a, b) => a.year - b.year)
  }, [company, factors])

  if (loading && !dataset) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-muted">
        <Spinner /> Loading
      </div>
    )
  }

  if (!dataset || Object.keys(dataset.values).length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} />}
          title={`No data for FY ${year}`}
          body="Nothing has been entered for this company and year yet. Add figures on the data entry page, or import a CSV."
          action={
            <Link to="/data">
              <Button variant="primary">
                Enter data <ArrowRight size={14} aria-hidden />
              </Button>
            </Link>
          }
        />
      </Card>
    )
  }

  const headline = ['totalCo2', 'renewableShare', 'genderDiversity', 'ltifr']
    .map((k) => calc.find((c) => c.key === k))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))

  const highGaps = gaps.filter((g) => g.severity === 'high')
  const factorChanged = factors.grid_electricity_in !== DEFAULT_FACTORS.grid_electricity_in

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{company?.name}</h1>
          <p className="mt-0.5 text-sm text-ink-2">
            FY {year} · {company?.industry} · {company?.employees} employees · {company?.country}
          </p>
        </div>
        {compliance && (
          <Link to="/compliance" className="text-right">
            <p className="text-xs text-ink-2">{framework} metric coverage</p>
            <p className="tnum text-2xl font-semibold tracking-tight text-ink">
              {compliance.coverage}%
            </p>
            <p className="text-[11px] text-ink-muted">
              {compliance.mandatoryTracked} of {compliance.mandatoryTotal} mandatory disclosures
              tracked
            </p>
          </Link>
        )}
      </div>

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

      {highGaps.length > 0 && (
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
              <li key={g.metricKey} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                <span className="text-ink">{g.label}</span>
                <span className="ml-auto text-xs text-ink-muted">{g.blocks.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <PillarScoreChart data={scores} />
        {history.length > 1 ? (
          <EmissionsTrendChart data={history} />
        ) : (
          <Card>
            <EmptyState
              icon={<TriangleAlert size={24} />}
              title="One year of data"
              body="Trends appear once a second year has been entered."
            />
          </Card>
        )}
        {history.length > 1 && (
          <IntensityTrendChart data={history.map((h) => ({ year: h.year, value: h.intensity }))} />
        )}
        {history.length > 1 && <EnergyMixChart data={history} />}
      </div>

      <Card>
        <CardHeader
          title="All calculated metrics"
          subtitle={`${calc.length} derived from your entered figures. Overall readiness ${overallScore(scores)}/100.`}
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
              {calc.map((m) => (
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
                    <Delta value={m.value} previous={m.previous} lowerIsBetter={m.lowerIsBetter} />
                  </td>
                  <td className="px-5 py-2.5 text-xs text-ink-muted">{m.basis ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-hairline px-5 py-3 text-[11px] leading-relaxed text-ink-muted">
          Scope 2 uses a grid factor of {factors.grid_electricity_in} kg CO₂e/kWh
          {factorChanged ? ' (overridden in Settings)' : ' (CEA weighted average, FY 2023-24)'}.
          Scope 3 is not calculated.
        </p>
      </Card>
    </div>
  )
}
