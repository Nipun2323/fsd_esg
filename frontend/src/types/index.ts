export type Pillar = 'E' | 'S' | 'G'

export type Framework = 'BRSR' | 'CSRD'

export interface CompanyRating {
  environment_score: number | null
  environment_grade: string | null
  environment_level: string | null
  environment_percentile: number | null
  social_score: number | null
  social_grade: string | null
  social_level: string | null
  social_percentile: number | null
  governance_score: number | null
  governance_grade: string | null
  governance_level: string | null
  governance_percentile: number | null
  total_score: number | null
  total_grade: string | null
  total_level: string | null
  total_percentile: number | null
  last_processing_date: string | null
}

export interface Company {
  id: number
  name: string
  ticker: string | null
  industry: string | null
  exchange?: string | null
  currency?: string
  logo_url?: string | null
  web_url?: string | null
  employees?: number | null
  country?: string | null
  /** Financial years for which activity data exists. */
  years?: number[]
  /** Third-party rating from the imported dataset. Null for companies added by hand. */
  rating?: CompanyRating | null
  /** Present on search results only. */
  total_grade?: string | null
}

export interface User {
  id: number
  username: string
  email: string | null
  is_admin: boolean
  company_id: number | null
}

export interface RatingPillar {
  pillar: Pillar
  label: string
  score: number
  grade: string | null
  level: string | null
  percentile: number | null
}

export interface IndustryBenchmark {
  industry: string
  peers: number
  companyScore: number
  industryAverage: number
}

export interface HistoryPoint {
  year: number
  scope1: number
  scope2: number
  intensity: number
  renewable: number
  grid: number
}

/** Everything one dashboard screen needs, in a single response. */
export interface Dashboard {
  company: Company
  year: number
  framework: Framework
  hasActivityData: boolean
  metrics: CalculatedMetric[]
  scores: Score[]
  overall: number
  gaps: DataGap[]
  compliance: ComplianceSummary
  disclosures: Disclosure[]
  history: HistoryPoint[]
  ratingPillars: RatingPillar[]
  industryBenchmark: IndustryBenchmark | null
}

export interface UploadResult {
  id: number
  companyId: number
  filename: string
  sizeBytes: number
  year: number | null
  status: 'pending' | 'parsed' | 'failed'
  extracted: Record<string, number>
  extractionNote: string | null
  usedAi: boolean
  createdAt: string
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
  source?: string
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
  generatedAt?: string | null
  /** Metric keys the draft was grounded in. */
  groundedIn: string[]
  /** False when the deterministic fallback produced this, not a model. */
  usedAi?: boolean
}

export interface Report {
  id: number
  companyId: number
  year: number
  framework: Framework
  sections: ReportSection[]
  createdAt: string
  updatedAt: string
  status: string
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
  /** False when the deterministic fallback answered, not a model. */
  usedAi?: boolean
  /** Which company the backend resolved from the question, if any. */
  companyId?: number | null
  companyName?: string | null
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
