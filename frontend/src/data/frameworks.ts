import type { Pillar } from '@/types'

/* ------------------------------------------------------------------
   BRSR — Business Responsibility and Sustainability Report (India).

   Disclosure format prescribed by SEBI; the nine principles it is
   organised around come from the Ministry of Corporate Affairs'
   National Guidelines on Responsible Business Conduct (NGRBC, 2019),
   not from SEBI itself.

   Structure: Section A general disclosures, Section B management and
   process disclosures, Section C principle-wise performance — where
   Section C has one block per NGRBC principle, each split into
   ESSENTIAL indicators (mandatory) and LEADERSHIP indicators
   (voluntary).

   Verify indicator-level detail against the current SEBI circular
   before relying on this for a filing.
------------------------------------------------------------------ */

export interface PrincipleDef {
  code: string
  short: string
  statement: string
  pillar: Pillar
}

export const NGRBC_PRINCIPLES: PrincipleDef[] = [
  {
    code: 'P1',
    short: 'Ethics & transparency',
    statement:
      'Businesses should conduct and govern themselves with integrity in a manner that is ethical, transparent and accountable.',
    pillar: 'G',
  },
  {
    code: 'P2',
    short: 'Sustainable & safe goods',
    statement:
      'Businesses should provide goods and services in a manner that is sustainable and safe.',
    pillar: 'E',
  },
  {
    code: 'P3',
    short: 'Employee wellbeing',
    statement:
      'Businesses should respect and promote the wellbeing of all employees, including those in their value chains.',
    pillar: 'S',
  },
  {
    code: 'P4',
    short: 'Stakeholder responsiveness',
    statement:
      'Businesses should respect the interests of and be responsive to all their stakeholders.',
    pillar: 'S',
  },
  {
    code: 'P5',
    short: 'Human rights',
    statement: 'Businesses should respect and promote human rights.',
    pillar: 'S',
  },
  {
    code: 'P6',
    short: 'Environment',
    statement:
      'Businesses should respect and make efforts to protect and restore the environment.',
    pillar: 'E',
  },
  {
    code: 'P7',
    short: 'Policy advocacy',
    statement:
      'Businesses, when engaging in influencing public and regulatory policy, should do so in a manner that is responsible and transparent.',
    pillar: 'G',
  },
  {
    code: 'P8',
    short: 'Inclusive growth',
    statement:
      'Businesses should promote inclusive growth and equitable development.',
    pillar: 'S',
  },
  {
    code: 'P9',
    short: 'Consumer value',
    statement:
      'Businesses should engage with and provide value to their consumers and customers in a responsible manner.',
    pillar: 'S',
  },
]

/**
 * BRSR Core — the subset of attributes SEBI singled out for assurance.
 * Treat the attribute list as a navigation aid, not a filing checklist.
 */
export const BRSR_CORE_ATTRIBUTES = [
  'Green-house gas footprint',
  'Water footprint',
  'Energy footprint',
  'Embracing circularity — waste management',
  'Employee wellbeing and safety',
  'Enabling gender diversity in business',
  'Enabling inclusive development',
  'Fairness in engaging with customers and suppliers',
  'Openness of business',
] as const

/* ------------------------------------------------------------------
   CSRD — reported against the European Sustainability Reporting
   Standards (ESRS). First set: 12 standards, two cross-cutting plus
   ten topical. Adopted as Commission Delegated Regulation (EU)
   2023/2772.

   Which topical standards apply to a given company is decided by its
   own double-materiality assessment — only ESRS 2 is unconditional.
   Scope and timing have been amended since adoption; check the
   current position before relying on a deadline.
------------------------------------------------------------------ */

export interface EsrsDef {
  code: string
  title: string
  group: 'Cross-cutting' | 'Environment' | 'Social' | 'Governance'
  pillar: Pillar | null
  /** ESRS 2 applies regardless of materiality; topical standards are materiality-gated. */
  alwaysApplies: boolean
}

export const ESRS_STANDARDS: EsrsDef[] = [
  { code: 'ESRS 1', title: 'General requirements', group: 'Cross-cutting', pillar: null, alwaysApplies: true },
  { code: 'ESRS 2', title: 'General disclosures', group: 'Cross-cutting', pillar: null, alwaysApplies: true },
  { code: 'ESRS E1', title: 'Climate change', group: 'Environment', pillar: 'E', alwaysApplies: false },
  { code: 'ESRS E2', title: 'Pollution', group: 'Environment', pillar: 'E', alwaysApplies: false },
  { code: 'ESRS E3', title: 'Water and marine resources', group: 'Environment', pillar: 'E', alwaysApplies: false },
  { code: 'ESRS E4', title: 'Biodiversity and ecosystems', group: 'Environment', pillar: 'E', alwaysApplies: false },
  { code: 'ESRS E5', title: 'Resource use and circular economy', group: 'Environment', pillar: 'E', alwaysApplies: false },
  { code: 'ESRS S1', title: 'Own workforce', group: 'Social', pillar: 'S', alwaysApplies: false },
  { code: 'ESRS S2', title: 'Workers in the value chain', group: 'Social', pillar: 'S', alwaysApplies: false },
  { code: 'ESRS S3', title: 'Affected communities', group: 'Social', pillar: 'S', alwaysApplies: false },
  { code: 'ESRS S4', title: 'Consumers and end-users', group: 'Social', pillar: 'S', alwaysApplies: false },
  { code: 'ESRS G1', title: 'Business conduct', group: 'Governance', pillar: 'G', alwaysApplies: false },
]

export const PILLAR_LABEL: Record<Pillar, string> = {
  E: 'Environmental',
  S: 'Social',
  G: 'Governance',
}

export const PILLAR_COLOR: Record<Pillar, string> = {
  E: 'var(--series-e)',
  S: 'var(--series-s)',
  G: 'var(--series-g)',
}
