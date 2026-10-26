import { useId, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Table2, ChartColumn } from 'lucide-react'
import type { Pillar } from '@/types'

/* ------------------------------------------------------------------
   Chart colours come from the validated three-slot palette defined in
   index.css. Adding a fourth hue requires re-running the palette
   validator — the all-pairs CVD gate is only cleared for three.

   Light-mode aqua sits below 3:1 against the surface, so every chart
   here ships direct labels AND a table view. That is the documented
   relief for the contrast warning, not a nicety.
------------------------------------------------------------------ */

const PILLAR_VAR: Record<Pillar, string> = {
  E: 'var(--series-e)',
  S: 'var(--series-s)',
  G: 'var(--series-g)',
}

const axisStyle = { fill: 'var(--text-muted)', fontSize: 11 }

/**
 * Direct value labels. Recharts' own `formatter` types are too loose to
 * reach the row's other fields, so the label is rendered explicitly.
 */
function ValueLabel({
  x,
  y,
  width,
  value,
  dy = -6,
}: {
  x?: number | string
  y?: number | string
  width?: number | string
  value?: number | string
  dy?: number
}) {
  if (value === undefined || value === null || value === '') return null
  const cx = Number(x) + Number(width ?? 0) / 2
  if (!Number.isFinite(cx) || !Number.isFinite(Number(y))) return null
  const text =
    typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value
  return (
    <text
      x={cx}
      y={Number(y)}
      dy={dy}
      textAnchor="middle"
      fontSize={11}
      fill="var(--text-secondary)"
    >
      {text}
    </text>
  )
}

function ChartFrame({
  title,
  caption,
  children,
  table,
}: {
  title: string
  caption?: string
  children: ReactNode
  table: { head: string[]; rows: (string | number)[][] }
}) {
  const [showTable, setShowTable] = useState(false)
  const id = useId()

  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>
          {caption && <p className="mt-0.5 text-xs text-ink-2">{caption}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          aria-controls={id}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline-strong px-2 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          {showTable ? <ChartColumn size={13} aria-hidden /> : <Table2 size={13} aria-hidden />}
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>

      <div id={id}>
        {showTable ? (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  {table.head.map((h) => (
                    <th key={h} className="py-2 pr-4 text-xs font-semibold text-ink-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0">
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={`py-2 pr-4 ${j === 0 ? 'text-ink' : 'tnum text-ink-2'}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function TooltipBox({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>
  label?: string | number
  unit?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-2">
          <span
            className="inline-block h-2 w-2 rounded-[2px]"
            style={{ background: p.color }}
            aria-hidden
          />
          <span>{p.name}</span>
          <span className="tnum ml-auto font-medium text-ink">
            {typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
            {unit ? ` ${unit}` : ''}
          </span>
        </p>
      ))}
    </div>
  )
}

/* ---------------- pillar scores ---------------- */

export function PillarScoreChart({
  data,
}: {
  data: Array<{ pillar: Pillar; label: string; value: number; previous?: number }>
}) {
  return (
    <ChartFrame
      title="Readiness by pillar"
      caption="This platform's own completeness-and-performance indicator (0–100). Not a third-party ESG rating."
      table={{
        head: ['Pillar', 'Score', 'Previous year'],
        rows: data.map((d) => [d.label, d.value, d.previous ?? '—']),
      }}
    >
      <div className="space-y-4">
        {data.map((d) => (
          <div key={d.pillar}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 text-sm text-ink">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: PILLAR_VAR[d.pillar] }}
                  aria-hidden
                />
                {d.label}
              </span>
              <span className="tnum text-sm font-semibold text-ink">
                {d.value}
                {d.previous !== undefined && (
                  <span className="ml-2 text-xs font-normal text-ink-muted">
                    from {d.previous}
                  </span>
                )}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
              role="meter"
              aria-valuenow={d.value}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${d.label} readiness`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${d.value}%`, background: PILLAR_VAR[d.pillar] }}
              />
            </div>
          </div>
        ))}
      </div>
    </ChartFrame>
  )
}

/* ---------------- emissions trend ---------------- */

export function EmissionsTrendChart({
  data,
}: {
  data: Array<{ year: number; scope1: number; scope2: number }>
}) {
  const withTotal = data.map((d) => ({ ...d, total: Math.round((d.scope1 + d.scope2) * 10) / 10 }))

  return (
    <ChartFrame
      title="Greenhouse gas emissions"
      caption="Scope 1 and Scope 2, tCO₂e. Scope 2 is location-based. Scope 3 is not calculated."
      table={{
        head: ['Year', 'Scope 1', 'Scope 2', 'Total'],
        rows: withTotal.map((d) => [d.year, d.scope1, d.scope2, d.total]),
      }}
    >
      <>
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'var(--series-s)' }} aria-hidden />
            Scope 1
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'var(--series-e)' }} aria-hidden />
            Scope 2
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={withTotal} margin={{ top: 16, right: 8, left: -16, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="year"
              tick={axisStyle}
              axisLine={{ stroke: 'var(--axis)' }}
              tickLine={false}
            />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              content={<TooltipBox unit="tCO₂e" />}
              cursor={{ fill: 'var(--surface-2)' }}
            />
            <Bar dataKey="scope1" name="Scope 1" stackId="a" fill="var(--series-s)" radius={[0, 0, 0, 0]} />
            <Bar
              dataKey="scope2"
              name="Scope 2"
              stackId="a"
              fill="var(--series-e)"
              radius={[4, 4, 0, 0]}
              stroke="var(--surface-1)"
              strokeWidth={2}
            >
              <LabelList dataKey="total" content={<ValueLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </>
    </ChartFrame>
  )
}

/* ---------------- intensity trend ---------------- */

export function IntensityTrendChart({
  data,
}: {
  data: Array<{ year: number; value: number }>
}) {
  return (
    <ChartFrame
      title="Emissions intensity per employee"
      caption="kgCO₂e per employee. Normalising by headcount separates efficiency from growth."
      table={{
        head: ['Year', 'kgCO₂e / employee'],
        rows: data.map((d) => [d.year, d.value]),
      }}
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 26, right: 28, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="year"
            tick={axisStyle}
            axisLine={{ stroke: 'var(--axis)' }}
            tickLine={false}
            padding={{ left: 24, right: 12 }}
          />
          <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={<TooltipBox unit="kgCO₂e" />} cursor={{ stroke: 'var(--axis)' }} />
          <Line
            type="monotone"
            dataKey="value"
            name="Intensity"
            stroke="var(--series-e)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--series-e)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: 'var(--surface-1)', strokeWidth: 2 }}
          >
            <LabelList dataKey="value" content={<ValueLabel dy={-12} />} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/* ---------------- energy mix ---------------- */

export function EnergyMixChart({
  data,
}: {
  data: Array<{ year: number; renewable: number; grid: number }>
}) {
  return (
    <ChartFrame
      title="Electricity sourcing"
      caption="MWh purchased from the grid versus renewable supply."
      table={{
        head: ['Year', 'Renewable (MWh)', 'Grid (MWh)', 'Renewable share'],
        rows: data.map((d) => [
          d.year,
          d.renewable,
          d.grid,
          `${(((d.renewable) / Math.max(d.renewable + d.grid, 1)) * 100).toFixed(1)}%`,
        ]),
      }}
    >
      <>
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'var(--series-e)' }} aria-hidden />
            Renewable
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'var(--series-g)' }} aria-hidden />
            Grid
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="year" tick={axisStyle} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={56} />
            <Tooltip content={<TooltipBox unit="MWh" />} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="renewable" name="Renewable" stackId="e" fill="var(--series-e)" stroke="var(--surface-1)" strokeWidth={2} />
            <Bar dataKey="grid" name="Grid" stackId="e" fill="var(--series-g)" radius={[4, 4, 0, 0]} stroke="var(--surface-1)" strokeWidth={2} />
          </BarChart>
        </ResponsiveContainer>
      </>
    </ChartFrame>
  )
}

/* ---------------- disclosure coverage ---------------- */

export function CoverageChart({
  data,
}: {
  data: Array<{
    group: string
    complete: number
    partial: number
    missing: number
    narrative: number
  }>
}) {
  return (
    <ChartFrame
      title="Disclosure coverage"
      caption="Every disclosure in the framework, including those no numeric metric can satisfy."
      table={{
        head: ['Group', 'Complete', 'Partial', 'Not started', 'Needs narrative'],
        rows: data.map((d) => [d.group, d.complete, d.partial, d.missing, d.narrative]),
      }}
    >
      <>
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-2">
          {[
            ['Complete', 'var(--good)'],
            ['Partial', 'var(--warning)'],
            ['Not started', 'var(--critical)'],
            ['Needs narrative', 'var(--text-muted)'],
          ].map(([label, color]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: color }} aria-hidden />
              {label}
            </span>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={Math.max(140, data.length * 54)}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--grid)" />
            <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="group"
              tick={axisStyle}
              axisLine={false}
              tickLine={false}
              width={96}
            />
            <Tooltip content={<TooltipBox />} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="complete" name="Complete" stackId="c" fill="var(--good)" stroke="var(--surface-1)" strokeWidth={2} />
            <Bar dataKey="partial" name="Partial" stackId="c" fill="var(--warning)" stroke="var(--surface-1)" strokeWidth={2} />
            <Bar dataKey="missing" name="Not started" stackId="c" fill="var(--critical)" stroke="var(--surface-1)" strokeWidth={2} />
            <Bar dataKey="narrative" name="Needs narrative" stackId="c" fill="var(--text-muted)" radius={[0, 4, 4, 0]} stroke="var(--surface-1)" strokeWidth={2} />
          </BarChart>
        </ResponsiveContainer>
      </>
    </ChartFrame>
  )
}

export { PILLAR_VAR, Cell }
