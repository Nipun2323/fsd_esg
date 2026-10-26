import type { MetricDefinition } from '@/types'

/* ------------------------------------------------------------------
   Emission factors.

   These are DEFAULTS, surfaced in Settings so a company can override
   them. Every figure carries its source and vintage — an ESG number
   without a cited factor is not auditable.
------------------------------------------------------------------ */

export interface EmissionFactor {
  key: string
  label: string
  value: number
  unit: string
  source: string
  vintage: string
  caveat?: string
}

export const EMISSION_FACTORS: EmissionFactor[] = [
  {
    key: 'grid_electricity_in',
    label: 'Grid electricity — India',
    value: 0.727,
    unit: 'kg CO₂e / kWh',
    source: 'CEA CO₂ Baseline Database (weighted average, renewables-adjusted)',
    vintage: 'FY 2023-24',
    caveat:
      'Widely-circulated 0.82 is the FY 2015-16 figure and is out of date. Confirm the current value against the CEA user guide before filing.',
  },
  {
    key: 'grid_electricity_eu',
    label: 'Grid electricity — EU average',
    value: 0.23,
    unit: 'kg CO₂e / kWh',
    source: 'European Environment Agency, EU-27 average grid intensity',
    vintage: 'indicative',
    caveat:
      'Placeholder. EU intensity varies enormously by member state — use your own country factor.',
  },
  {
    key: 'diesel',
    label: 'Diesel (stationary / mobile)',
    value: 2.68,
    unit: 'kg CO₂e / litre',
    source: 'DEFRA / BEIS GHG conversion factors',
    vintage: 'indicative',
  },
  {
    key: 'petrol',
    label: 'Petrol',
    value: 2.31,
    unit: 'kg CO₂e / litre',
    source: 'DEFRA / BEIS GHG conversion factors',
    vintage: 'indicative',
  },
  {
    key: 'lpg',
    label: 'LPG',
    value: 1.56,
    unit: 'kg CO₂e / kg',
    source: 'DEFRA / BEIS GHG conversion factors',
    vintage: 'indicative',
  },
]

export const DEFAULT_FACTORS: Record<string, number> = Object.fromEntries(
  EMISSION_FACTORS.map((f) => [f.key, f.value]),
)

/* ------------------------------------------------------------------
   Metric catalogue. `mapsTo` is what drives the compliance screen —
   a disclosure is satisfied when every metric pointing at it is
   answered.
------------------------------------------------------------------ */

export const METRICS: MetricDefinition[] = [
  /* ---------------- Environmental ---------------- */
  {
    key: 'electricity_kwh',
    label: 'Grid electricity purchased',
    pillar: 'E',
    unit: 'kWh',
    help: 'Total drawn from the grid across all sites for the year.',
    mapsTo: ['BRSR-P6-E', 'ESRS E1'],
    kind: 'number',
  },
  {
    key: 'renewable_kwh',
    label: 'Renewable electricity',
    pillar: 'E',
    unit: 'kWh',
    help: 'Self-generated or purchased with certificates.',
    mapsTo: ['BRSR-P6-E', 'ESRS E1'],
    kind: 'number',
  },
  {
    key: 'diesel_litres',
    label: 'Diesel consumed',
    pillar: 'E',
    unit: 'L',
    help: 'Generators and owned vehicles.',
    mapsTo: ['BRSR-P6-E', 'ESRS E1'],
    kind: 'number',
  },
  {
    key: 'petrol_litres',
    label: 'Petrol consumed',
    pillar: 'E',
    unit: 'L',
    mapsTo: ['BRSR-P6-E', 'ESRS E1'],
    kind: 'number',
  },
  {
    key: 'water_kl',
    label: 'Water withdrawn',
    pillar: 'E',
    unit: 'kL',
    help: 'All sources combined.',
    mapsTo: ['BRSR-P6-E', 'ESRS E3'],
    kind: 'number',
  },
  {
    key: 'water_recycled_kl',
    label: 'Water recycled or reused',
    pillar: 'E',
    unit: 'kL',
    mapsTo: ['BRSR-P6-L', 'ESRS E3'],
    kind: 'number',
  },
  {
    key: 'waste_total_t',
    label: 'Total waste generated',
    pillar: 'E',
    unit: 't',
    mapsTo: ['BRSR-P6-E', 'ESRS E5'],
    kind: 'number',
  },
  {
    key: 'waste_recycled_t',
    label: 'Waste diverted from disposal',
    pillar: 'E',
    unit: 't',
    help: 'Recycled, reused or recovered.',
    mapsTo: ['BRSR-P6-E', 'ESRS E5'],
    kind: 'number',
  },
  {
    key: 'hazardous_waste_t',
    label: 'Hazardous waste',
    pillar: 'E',
    unit: 't',
    mapsTo: ['BRSR-P6-E', 'ESRS E2'],
    kind: 'number',
  },

  /* ---------------- Social ---------------- */
  {
    key: 'employees_total',
    label: 'Total employees',
    pillar: 'S',
    unit: 'headcount',
    help: 'Permanent and contractual, at year end.',
    mapsTo: ['BRSR-A', 'BRSR-P3-E', 'ESRS S1'],
    kind: 'number',
  },
  {
    key: 'employees_female',
    label: 'Female employees',
    pillar: 'S',
    unit: 'headcount',
    mapsTo: ['BRSR-A', 'BRSR-P5-E', 'ESRS S1'],
    kind: 'number',
  },
  {
    key: 'women_in_management_pct',
    label: 'Women in management',
    pillar: 'S',
    unit: '%',
    mapsTo: ['BRSR-P5-E', 'ESRS S1'],
    kind: 'percent',
  },
  {
    key: 'training_hours',
    label: 'Training hours delivered',
    pillar: 'S',
    unit: 'hours',
    help: 'Total across the workforce, all topics.',
    mapsTo: ['BRSR-P3-E', 'ESRS S1'],
    kind: 'number',
  },
  {
    key: 'ltifr',
    label: 'Lost-time injuries',
    pillar: 'S',
    unit: 'count',
    help: 'Recordable work-related injuries causing lost time.',
    mapsTo: ['BRSR-P3-E', 'ESRS S1'],
    kind: 'number',
  },
  {
    key: 'hours_worked',
    label: 'Total hours worked',
    pillar: 'S',
    unit: 'hours',
    help: 'Needed to express injuries as a rate.',
    mapsTo: ['BRSR-P3-E', 'ESRS S1'],
    kind: 'number',
  },
  {
    key: 'attrition_pct',
    label: 'Voluntary attrition',
    pillar: 'S',
    unit: '%',
    mapsTo: ['BRSR-P3-E', 'ESRS S1'],
    kind: 'percent',
  },
  {
    key: 'csr_spend',
    label: 'Community investment',
    pillar: 'S',
    unit: 'currency',
    mapsTo: ['BRSR-P8-E', 'ESRS S3'],
    kind: 'number',
  },
  {
    key: 'complaints_consumer',
    label: 'Consumer complaints received',
    pillar: 'S',
    unit: 'count',
    mapsTo: ['BRSR-P9-E', 'ESRS S4'],
    kind: 'number',
  },
  {
    key: 'supplier_assessed_pct',
    label: 'Suppliers assessed on social criteria',
    pillar: 'S',
    unit: '%',
    mapsTo: ['BRSR-P3-L', 'ESRS S2'],
    kind: 'percent',
  },

  /* ---------------- Governance ---------------- */
  {
    key: 'board_size',
    label: 'Board size',
    pillar: 'G',
    unit: 'members',
    mapsTo: ['BRSR-B', 'ESRS 2', 'ESRS G1'],
    kind: 'number',
  },
  {
    key: 'board_female',
    label: 'Women on the board',
    pillar: 'G',
    unit: 'members',
    mapsTo: ['BRSR-B', 'ESRS 2'],
    kind: 'number',
  },
  {
    key: 'board_independent',
    label: 'Independent directors',
    pillar: 'G',
    unit: 'members',
    mapsTo: ['BRSR-B', 'ESRS 2'],
    kind: 'number',
  },
  {
    key: 'anti_corruption_policy',
    label: 'Anti-corruption policy in force',
    pillar: 'G',
    unit: 'yes/no',
    mapsTo: ['BRSR-P1-E', 'ESRS G1'],
    kind: 'boolean',
  },
  {
    key: 'whistleblower_policy',
    label: 'Whistleblower mechanism',
    pillar: 'G',
    unit: 'yes/no',
    mapsTo: ['BRSR-P1-E', 'ESRS G1'],
    kind: 'boolean',
  },
  {
    key: 'grievance_mechanism',
    label: 'Stakeholder grievance mechanism',
    pillar: 'G',
    unit: 'yes/no',
    mapsTo: ['BRSR-P4-E', 'ESRS 2'],
    kind: 'boolean',
  },
  {
    key: 'corruption_cases',
    label: 'Confirmed corruption incidents',
    pillar: 'G',
    unit: 'count',
    mapsTo: ['BRSR-P1-E', 'ESRS G1'],
    kind: 'number',
  },
  {
    key: 'data_breaches',
    label: 'Data privacy breaches',
    pillar: 'G',
    unit: 'count',
    mapsTo: ['BRSR-P9-E', 'ESRS S4'],
    kind: 'number',
  },
  {
    key: 'board_esg_oversight',
    label: 'Board-level ESG oversight',
    pillar: 'G',
    unit: 'yes/no',
    help: 'A named director or committee accountable for sustainability.',
    mapsTo: ['BRSR-B', 'ESRS 2'],
    kind: 'boolean',
  },
]

export const METRICS_BY_KEY: Record<string, MetricDefinition> = Object.fromEntries(
  METRICS.map((m) => [m.key, m]),
)

export const metricsForPillar = (p: 'E' | 'S' | 'G') => METRICS.filter((m) => m.pillar === p)
