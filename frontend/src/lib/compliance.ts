import type {
  ComplianceSummary,
  Disclosure,
  DisclosureStatus,
  EsgDataset,
  Framework,
} from '@/types'
import { ESRS_STANDARDS, NGRBC_PRINCIPLES } from '@/data/frameworks'
import { METRICS } from '@/data/metrics'

/**
 * Builds the disclosure checklist for a dataset by asking, for each
 * disclosure, which metrics claim to feed it and how many are answered.
 *
 * This is a readiness indicator, not a conformity assessment. Neither
 * BRSR nor ESRS is satisfied by filling numeric fields alone — both
 * require narrative, policy and process disclosures a form cannot
 * verify.
 */

const answered = (data: EsgDataset, key: string) => {
  const v = data.values[key]
  return typeof v === 'number' && Number.isFinite(v)
}

function statusFor(requires: string[], missing: string[]): DisclosureStatus {
  if (requires.length === 0) return 'narrative'
  if (missing.length === 0) return 'complete'
  if (missing.length === requires.length) return 'missing'
  return 'partial'
}

/* ---------------- BRSR ---------------- */

interface BrsrBlock {
  id: string
  code: string
  title: string
  group: string
  mandatory: boolean
  note?: string
}

const BRSR_BLOCKS: BrsrBlock[] = [
  {
    id: 'BRSR-A',
    code: 'Section A',
    title: 'General disclosures',
    group: 'Section A',
    mandatory: true,
    note: 'Entity details, products and services, operations, employees, holding and subsidiary structure, CSR details.',
  },
  {
    id: 'BRSR-B',
    code: 'Section B',
    title: 'Management and process disclosures',
    group: 'Section B',
    mandatory: true,
    note: 'Policy and management processes covering each of the nine NGRBC principles, plus governance and oversight.',
  },
  ...NGRBC_PRINCIPLES.flatMap((p) => [
    {
      id: `BRSR-${p.code}-E`,
      code: `${p.code} · Essential`,
      title: p.short,
      group: 'Section C',
      mandatory: true,
      note: p.statement,
    },
    {
      id: `BRSR-${p.code}-L`,
      code: `${p.code} · Leadership`,
      title: `${p.short} — leadership indicators`,
      group: 'Section C',
      mandatory: false,
      note: 'Voluntary indicators for entities choosing to go beyond the essential tier.',
    },
  ]),
]

/* ---------------- evaluation ---------------- */

export function evaluate(data: EsgDataset, framework: Framework): Disclosure[] {
  if (framework === 'BRSR') {
    return BRSR_BLOCKS.map((block) => {
      const requires = METRICS.filter((m) => m.mapsTo.includes(block.id)).map((m) => m.key)
      const missing = requires.filter((k) => !answered(data, k))
      const pillar =
        NGRBC_PRINCIPLES.find((p) => block.id.startsWith(`BRSR-${p.code}-`))?.pillar ?? null
      return {
        id: block.id,
        code: block.code,
        title: block.title,
        framework: 'BRSR' as const,
        group: block.group,
        pillar,
        status: statusFor(requires, missing),
        requires,
        missing,
        mandatory: block.mandatory,
        note: block.note,
      }
    })
  }

  return ESRS_STANDARDS.map((std) => {
    const requires = METRICS.filter((m) => m.mapsTo.includes(std.code)).map((m) => m.key)
    const missing = requires.filter((k) => !answered(data, k))
    return {
      id: std.code,
      code: std.code,
      title: std.title,
      framework: 'CSRD' as const,
      group: std.group,
      pillar: std.pillar,
      status: statusFor(requires, missing),
      requires,
      missing,
      mandatory: std.alwaysApplies,
      note: std.alwaysApplies
        ? 'Applies regardless of the materiality assessment.'
        : 'Applies only if your double-materiality assessment finds this topic material.',
    }
  })
}

/**
 * The percentage reported here is deliberately narrow: it is coverage
 * of the mandatory disclosures this platform tracks numerically, and
 * the summary carries the denominator alongside it. Disclosures with
 * no mapped metric are counted and surfaced rather than filtered out —
 * silently excluding them is how a half-finished report shows 100%.
 */
export function summarise(disclosures: Disclosure[], framework: Framework): ComplianceSummary {
  const tracked = disclosures.filter((d) => d.status !== 'narrative')
  const complete = tracked.filter((d) => d.status === 'complete').length
  const partial = tracked.filter((d) => d.status === 'partial').length
  const missing = tracked.filter((d) => d.status === 'missing').length

  const mandatoryAll = disclosures.filter((d) => d.mandatory)
  const mandatoryTracked = mandatoryAll.filter((d) => d.status !== 'narrative')
  const earned = mandatoryTracked.reduce(
    (acc, d) => acc + (d.requires.length - d.missing.length) / d.requires.length,
    0,
  )

  return {
    framework,
    complete,
    partial,
    missing,
    narrative: disclosures.filter((d) => d.status === 'narrative').length,
    tracked: tracked.length,
    total: disclosures.length,
    mandatoryTracked: mandatoryTracked.length,
    mandatoryTotal: mandatoryAll.length,
    coverage:
      mandatoryTracked.length === 0 ? 0 : Math.round((earned / mandatoryTracked.length) * 100),
  }
}

export const STATUS_META: Record<
  DisclosureStatus,
  { label: string; color: string; icon: 'check' | 'alert' | 'x' | 'minus' }
> = {
  complete: { label: 'Complete', color: 'var(--good)', icon: 'check' },
  partial: { label: 'Partial', color: 'var(--warning)', icon: 'alert' },
  missing: { label: 'Not started', color: 'var(--critical)', icon: 'x' },
  narrative: { label: 'Needs narrative', color: 'var(--text-muted)', icon: 'minus' },
}
