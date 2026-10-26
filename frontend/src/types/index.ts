export type Pillar = 'E' | 'S' | 'G'

export type Framework = 'BRSR' | 'CSRD'

export interface Company {
  id: number
  name: string
  industry: string
  employees: number
  country: string
  /** Reporting currency, ISO 4217. */
  currency: string
  /** Financial years for which any data exists. */
  years: number[]
}

export interface MetricDefinition {
  /** Stable machine key, e.g. "electricity_kwh". */
  key: string
  label: string
  pillar: Pillar
  unit: string
  /** Short helper shown under the field. */
  help?: string
  /** Disclosure IDs this metric feeds, e.g. ["BRSR-P6-E", "ESRS-E1"]. */
  mapsTo: string[]
  kind: 'number' | 'boolean' | 'percent'
}

export interface MetricValue {
  key: string
  value: number | null
  unit: string
}

export interface EsgDataset {
  companyId: number
  year: number
  values: Record<string, number | null>
}

export interface CalculatedMetric {
  key: string
  label: string
  pillar: Pillar
  value: number
  unit: string
  /** Same metric a year earlier, when available. */
  previous?: number
  /** Lower is better — drives how a delta is coloured. */
  lowerIsBetter?: boolean
  /** Plain-language note on how it was derived. */
  basis?: string
}

export interface TrendPoint {
  year: number
  environmental: number
  social: number
  governance: number
}

export interface Score {
  pillar: Pillar
  label: string
  /** 0–100. */
  value: number
  previous?: number
}

/* ---------- compliance ---------- */

/**
 * `narrative` means no numeric metric in this platform maps to the
 * disclosure — it is not "done" and not "not applicable", it has to be
 * written up by a person. Keeping it distinct is what stops the
 * readiness figure from quietly excluding it.
 */
export type DisclosureStatus = 'complete' | 'partial' | 'missing' | 'narrative'

export interface Disclosure {
  id: string
  code: string
  title: string
  framework: Framework
  /** BRSR: "Section A" | "Section B" | "Section C". CSRD: "Cross-cutting" | "Environment" | ... */
  group: string
  pillar: Pillar | null
  status: DisclosureStatus
  /** Metric keys that satisfy this disclosure. */
  requires: string[]
  /** Which of `requires` are still unanswered. */
  missing: string[]
  mandatory: boolean
  note?: string
}

export interface ComplianceSummary {
  framework: Framework
  complete: number
  partial: number
  missing: number
  /** Mandatory disclosures with no numeric metric behind them. */
  narrative: number
  /** Disclosures this platform tracks numerically. */
  tracked: number
  total: number
  /** Mandatory disclosures this platform tracks. */
  mandatoryTracked: number
  /** Every mandatory disclosure, tracked or not. */
  mandatoryTotal: number
  /** 0–100 across `mandatoryTracked` only. Never across the whole framework. */
  coverage: number
}

/* ---------- report ---------- */

export type ReportSectionKey =
  | 'executive_summary'
  | 'environmental'
  | 'social'
  | 'governance'
  | 'recommendations'

export interface ReportSection {
  key: ReportSectionKey
  title: string
  /** AI draft, or the user's edit of it. */
  body: string
  /** True once a human has changed the AI text. */
  edited: boolean
  generatedAt?: string
  /** Metric keys the draft was grounded in. */
  groundedIn: string[]
}

export interface Report {
  id: number
  companyId: number
  year: number
  framework: Framework
  sections: ReportSection[]
  createdAt: string
  updatedAt: string
  status: 'draft' | 'in-review' | 'final'
}

/* ---------- assistant ---------- */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  /** Metric keys / disclosure codes the answer leaned on. */
  citations?: string[]
  pending?: boolean
}

/* ---------- data quality ---------- */

export interface DataGap {
  metricKey: string
  label: string
  pillar: Pillar
  severity: 'high' | 'medium' | 'low'
  blocks: string[]
  message: string
}
