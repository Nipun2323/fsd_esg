import type { CalculatedMetric, DataGap, EsgDataset, Pillar, Score } from '@/types'
import { DEFAULT_FACTORS, METRICS, METRICS_BY_KEY } from '@/data/metrics'

/**
 * Mirrors calculator.py. Kept pure and dependency-free so the same
 * arithmetic can be ported to Python line for line.
 */

const num = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

const ratio = (a: number | null, b: number | null): number | null =>
  a === null || b === null || b === 0 ? null : (a / b) * 100

export interface CalcOptions {
  factors?: Record<string, number>
  previous?: EsgDataset | null
}

export function calculate(data: EsgDataset, opts: CalcOptions = {}): CalculatedMetric[] {
  const f = { ...DEFAULT_FACTORS, ...(opts.factors ?? {}) }
  const v = data.values
  const prevValues = opts.previous?.values

  const derive = (src: Record<string, number | null>) => {
    const electricity = num(src.electricity_kwh)
    const renewable = num(src.renewable_kwh)
    const diesel = num(src.diesel_litres)
    const petrol = num(src.petrol_litres)

    // Scope 2 — purchased electricity, location-based.
    const scope2 =
      electricity === null ? null : (electricity * f.grid_electricity_in) / 1000 // tCO2e

    // Scope 1 — fuel burned on site or in owned vehicles.
    const scope1 =
      diesel === null && petrol === null
        ? null
        : ((diesel ?? 0) * f.diesel + (petrol ?? 0) * f.petrol) / 1000 // tCO2e

    const totalCo2 =
      scope1 === null && scope2 === null ? null : (scope1 ?? 0) + (scope2 ?? 0)

    const employees = num(src.employees_total)
    const totalEnergy =
      electricity === null && renewable === null ? null : (electricity ?? 0) + (renewable ?? 0)

    return {
      scope1,
      scope2,
      totalCo2,
      totalEnergy,
      renewableShare: ratio(renewable, totalEnergy),
      intensityPerEmployee:
        totalCo2 === null || employees === null || employees === 0
          ? null
          : (totalCo2 * 1000) / employees, // kgCO2e per head
      waterIntensity:
        num(src.water_kl) === null || employees === null || employees === 0
          ? null
          : num(src.water_kl)! / employees,
      waterRecycledShare: ratio(num(src.water_recycled_kl), num(src.water_kl)),
      wasteDivertedShare: ratio(num(src.waste_recycled_t), num(src.waste_total_t)),
      genderDiversity: ratio(num(src.employees_female), employees),
      trainingPerEmployee:
        num(src.training_hours) === null || employees === null || employees === 0
          ? null
          : num(src.training_hours)! / employees,
      // Injuries per one million hours worked — the conventional LTIFR base.
      ltifr:
        num(src.ltifr) === null || num(src.hours_worked) === null || num(src.hours_worked) === 0
          ? null
          : (num(src.ltifr)! * 1_000_000) / num(src.hours_worked)!,
      boardIndependence: ratio(num(src.board_independent), num(src.board_size)),
      boardDiversity: ratio(num(src.board_female), num(src.board_size)),
    }
  }

  const cur = derive(v)
  const prev = prevValues ? derive(prevValues) : null

  const rows: Array<
    [keyof typeof cur, string, Pillar, string, boolean?, string?]
  > = [
    ['totalCo2', 'Total GHG emissions', 'E', 'tCO₂e', true, 'Scope 1 + Scope 2 (location-based)'],
    ['scope1', 'Scope 1 emissions', 'E', 'tCO₂e', true, 'Diesel and petrol combusted'],
    ['scope2', 'Scope 2 emissions', 'E', 'tCO₂e', true, 'Grid electricity × CEA factor'],
    ['intensityPerEmployee', 'Emissions intensity', 'E', 'kgCO₂e/employee', true],
    ['totalEnergy', 'Total energy consumed', 'E', 'kWh', true],
    ['renewableShare', 'Renewable energy share', 'E', '%', false],
    ['waterIntensity', 'Water intensity', 'E', 'kL/employee', true],
    ['waterRecycledShare', 'Water recycled', 'E', '%', false],
    ['wasteDivertedShare', 'Waste diverted from disposal', 'E', '%', false],
    ['genderDiversity', 'Gender diversity', 'S', '%', false],
    ['trainingPerEmployee', 'Training per employee', 'S', 'hours', false],
    ['ltifr', 'LTIFR', 'S', 'per 1M hours', true, 'Lost-time injuries per million hours worked'],
    ['boardIndependence', 'Board independence', 'G', '%', false],
    ['boardDiversity', 'Board gender diversity', 'G', '%', false],
  ]

  return rows
    .filter(([k]) => cur[k] !== null)
    .map(([k, label, pillar, unit, lowerIsBetter, basis]) => ({
      key: String(k),
      label,
      pillar,
      value: round(cur[k] as number),
      unit,
      previous: prev && prev[k] !== null ? round(prev[k] as number) : undefined,
      lowerIsBetter,
      basis,
    }))
}

const round = (n: number) => Math.round(n * 100) / 100

/* ------------------------------------------------------------------
   Pillar scores.

   This is a COMPLETENESS-AND-PERFORMANCE heuristic of our own, not a
   rating from any agency and not something BRSR or CSRD defines.
   Treat it as an internal progress signal. It is labelled as such
   everywhere it appears in the UI.
------------------------------------------------------------------ */

export function scorePillars(
  data: EsgDataset,
  previous?: EsgDataset | null,
): Score[] {
  const score = (src: EsgDataset): Record<Pillar, number> => {
    const out = {} as Record<Pillar, number>
    for (const pillar of ['E', 'S', 'G'] as Pillar[]) {
      const defs = METRICS.filter((m) => m.pillar === pillar)
      const answered = defs.filter((m) => num(src.values[m.key]) !== null).length
      const completeness = defs.length === 0 ? 0 : answered / defs.length

      const calc = calculate(src)
      const byKey = Object.fromEntries(calc.map((c) => [c.key, c.value]))
      let performance = 0.5
      if (pillar === 'E') {
        performance = avg([
          pct(byKey.renewableShare),
          pct(byKey.wasteDivertedShare),
          pct(byKey.waterRecycledShare),
        ])
      } else if (pillar === 'S') {
        performance = avg([
          pct(byKey.genderDiversity, 50),
          clamp01((byKey.trainingPerEmployee ?? 0) / 24),
          byKey.ltifr === undefined ? 0.5 : clamp01(1 - byKey.ltifr / 10),
        ])
      } else {
        const policies = [
          src.values.anti_corruption_policy,
          src.values.whistleblower_policy,
          src.values.grievance_mechanism,
          src.values.board_esg_oversight,
        ]
        const held = policies.filter((p) => p === 1).length
        performance = avg([
          held / policies.length,
          pct(byKey.boardIndependence, 50),
          pct(byKey.boardDiversity, 33),
        ])
      }
      out[pillar] = Math.round((completeness * 0.4 + performance * 0.6) * 100)
    }
    return out
  }

  const cur = score(data)
  const prev = previous ? score(previous) : null
  const labels: Record<Pillar, string> = {
    E: 'Environmental',
    S: 'Social',
    G: 'Governance',
  }
  return (['E', 'S', 'G'] as Pillar[]).map((p) => ({
    pillar: p,
    label: labels[p],
    value: cur[p],
    previous: prev?.[p],
  }))
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const pct = (n: number | undefined, target = 100) =>
  n === undefined ? 0 : clamp01(n / target)
const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)

export const overallScore = (scores: Score[]) =>
  Math.round(scores.reduce((a, s) => a + s.value, 0) / Math.max(scores.length, 1))

/* ------------------------------------------------------------------
   Gap detection — AI feature (2) from the outline, done
   deterministically so it cannot hallucinate.
------------------------------------------------------------------ */

const HIGH_PRIORITY = new Set([
  'electricity_kwh',
  'employees_total',
  'water_kl',
  'waste_total_t',
  'board_size',
  'anti_corruption_policy',
])

export function findGaps(data: EsgDataset): DataGap[] {
  return METRICS.filter((m) => num(data.values[m.key]) === null).map((m) => {
    const severity: DataGap['severity'] = HIGH_PRIORITY.has(m.key)
      ? 'high'
      : m.mapsTo.some((d) => d.endsWith('-E') || d === 'ESRS 2')
        ? 'medium'
        : 'low'
    return {
      metricKey: m.key,
      label: m.label,
      pillar: m.pillar,
      severity,
      blocks: m.mapsTo,
      message: `${m.label} has not been entered. It feeds ${m.mapsTo.join(', ')}.`,
    }
  })
}

export const formatValue = (value: number, unit: string): string => {
  if (unit === '%') return `${value.toFixed(1)}%`
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 10_000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/** Labels for the derived keys produced by `calculate`, so citations read in plain English. */
const CALCULATED_LABELS: Record<string, string> = {
  totalCo2: 'Total GHG emissions',
  scope1: 'Scope 1 emissions',
  scope2: 'Scope 2 emissions',
  intensityPerEmployee: 'Emissions intensity',
  totalEnergy: 'Total energy consumed',
  renewableShare: 'Renewable energy share',
  waterIntensity: 'Water intensity',
  waterRecycledShare: 'Water recycled',
  wasteDivertedShare: 'Waste diverted from disposal',
  genderDiversity: 'Gender diversity',
  trainingPerEmployee: 'Training per employee',
  ltifr: 'LTIFR',
  boardIndependence: 'Board independence',
  boardDiversity: 'Board gender diversity',
}

export const metricLabel = (key: string) =>
  METRICS_BY_KEY[key]?.label ?? CALCULATED_LABELS[key] ?? key
