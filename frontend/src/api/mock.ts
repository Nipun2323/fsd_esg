import type { EsgApi } from './types'
import { ApiError } from './types'
import type {
  ChatMessage,
  Company,
  EsgDataset,
  Framework,
  Report,
  ReportSection,
  ReportSectionKey,
} from '@/types'
import { COMPANIES, DATASETS } from './mockData'
import { calculate, findGaps, formatValue, overallScore, scorePillars } from '@/lib/calculator'
import { evaluate, summarise } from '@/lib/compliance'
import { METRICS_BY_KEY } from '@/data/metrics'

/**
 * In-memory stand-in for the Python backend.
 *
 * The narrative text below is TEMPLATED from the company's own
 * numbers — it is deliberately not a language model. That keeps the
 * demo honest (nothing here can invent a figure) and it keeps the
 * contract in ai_service.py unchanged: swap VITE_USE_MOCK to false
 * and the real model answers the same call shapes.
 */

const companies: Company[] = structuredClone(COMPANIES)
const datasets: Record<string, EsgDataset> = {}
const reports: Record<string, Report> = {}
let nextCompanyId = companies.length + 1
let nextReportId = 1

for (const [cid, byYear] of Object.entries(DATASETS)) {
  for (const [year, values] of Object.entries(byYear)) {
    datasets[`${cid}:${year}`] = {
      companyId: Number(cid),
      year: Number(year),
      values: structuredClone(values),
    }
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
const jitter = (base: number) => base + Math.random() * base * 0.5

const datasetFor = (companyId: number, year: number): EsgDataset =>
  datasets[`${companyId}:${year}`] ?? { companyId, year, values: {} }

const previousFor = (companyId: number, year: number): EsgDataset | null =>
  datasets[`${companyId}:${year - 1}`] ?? null

/* ---------------- narrative ---------------- */

const SECTION_TITLES: Record<ReportSectionKey, string> = {
  executive_summary: 'Executive summary',
  environmental: 'Environmental performance',
  social: 'Social performance',
  governance: 'Governance',
  recommendations: 'Priorities for the coming year',
}

const pctChange = (cur: number, prev?: number): string | null => {
  if (prev === undefined || prev === 0) return null
  const d = ((cur - prev) / prev) * 100
  // Below half a percent is noise; calling it "up 0.0%" reads as a finding.
  if (Math.abs(d) < 0.5) return 'unchanged year on year'
  return `${d > 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)}% year on year`
}

function compose(
  key: ReportSectionKey,
  company: Company,
  data: EsgDataset,
  framework: Framework,
): { body: string; groundedIn: string[] } {
  const prev = previousFor(company.id, data.year)
  const calc = calculate(data, { previous: prev })
  const by = Object.fromEntries(calc.map((c) => [c.key, c]))
  const scores = scorePillars(data, prev)
  const gaps = findGaps(data)
  const grounded: string[] = []

  const say = (k: string, suffix = '') => {
    const m = by[k]
    if (!m) return null
    grounded.push(k)
    const change = pctChange(m.value, m.previous)
    // formatValue already carries the % sign; appending the unit again
    // produced "20.5% %".
    const amount =
      m.unit === '%' ? formatValue(m.value, m.unit) : `${formatValue(m.value, m.unit)} ${m.unit}`
    return `${amount}${suffix}${change ? ` (${change})` : ''}`
  }

  const standard = framework === 'BRSR' ? 'SEBI’s BRSR format' : 'the ESRS under CSRD'

  switch (key) {
    case 'executive_summary': {
      const lines = [
        `${company.name} is a ${company.industry.toLowerCase()} business employing ${company.employees} people in ${company.country}. This report covers FY ${data.year} and is structured against ${standard}.`,
      ]
      const co2 = say('totalCo2')
      if (co2) lines.push(`Total greenhouse gas emissions for the year were ${co2}, combining Scope 1 fuel combustion with Scope 2 purchased electricity.`)
      const ren = say('renewableShare')
      if (ren) lines.push(`Renewable sources supplied ${ren} of electricity consumed.`)
      const div = say('genderDiversity')
      if (div) lines.push(`Women made up ${div} of the workforce.`)
      lines.push(
        `Internal readiness scores stand at ${scores.map((s) => `${s.label} ${s.value}`).join(', ')}, an overall ${overallScore(scores)} out of 100. These are this platform’s own completeness-and-performance indicators, not a third-party ESG rating.`,
      )
      if (gaps.filter((g) => g.severity === 'high').length > 0) {
        lines.push(
          `${gaps.filter((g) => g.severity === 'high').length} high-priority data points remain unreported and are flagged in the compliance view.`,
        )
      }
      return { body: lines.join('\n\n'), groundedIn: grounded }
    }

    case 'environmental': {
      const lines: string[] = []
      const s1 = say('scope1')
      const s2 = say('scope2')
      if (s1 || s2) {
        lines.push(
          `Scope 1 emissions were ${s1 ?? 'not reported'} and Scope 2 ${s2 ?? 'not reported'}. Scope 2 is calculated on a location-based method using the CEA grid factor for India; the factor and its vintage are recorded in Settings so the figure can be reproduced.`,
        )
      }
      const en = say('totalEnergy')
      const ren = say('renewableShare')
      if (en) lines.push(`Total energy consumed was ${en}${ren ? `, of which ${ren} came from renewable sources` : ''}.`)
      const w = say('waterIntensity')
      const wr = say('waterRecycledShare')
      if (w) lines.push(`Water intensity was ${w}${wr ? `, with ${wr} of withdrawal recycled or reused` : ''}.`)
      const wd = say('wasteDivertedShare')
      if (wd) lines.push(`${wd} of waste generated was diverted from disposal.`)
      lines.push(
        framework === 'BRSR'
          ? 'These figures support Principle 6 essential indicators in Section C of the BRSR.'
          : 'These figures support ESRS E1, E3 and E5, subject to those topics being material under your double-materiality assessment.',
      )
      return { body: lines.join('\n\n'), groundedIn: grounded }
    }

    case 'social': {
      const lines: string[] = []
      const d = say('genderDiversity')
      if (d) lines.push(`Women represented ${d} of total headcount.`)
      const t = say('trainingPerEmployee')
      if (t) lines.push(`The business delivered ${t} of training per employee across the year.`)
      const l = say('ltifr')
      if (l) lines.push(`The lost-time injury frequency rate was ${l}, expressed per one million hours worked.`)
      if (typeof data.values.attrition_pct === 'number') {
        grounded.push('attrition_pct')
        lines.push(`Voluntary attrition stood at ${data.values.attrition_pct}%.`)
      }
      lines.push(
        framework === 'BRSR'
          ? 'These disclosures map to Principles 3, 5 and 8 of the NGRBC as reflected in Section C.'
          : 'These disclosures map to ESRS S1 own workforce, with value-chain workers covered under S2 where material.',
      )
      return { body: lines.join('\n\n'), groundedIn: grounded }
    }

    case 'governance': {
      const lines: string[] = []
      const bi = say('boardIndependence')
      const bd = say('boardDiversity')
      if (bi) lines.push(`Independent directors made up ${bi} of the board${bd ? `, and women ${bd}` : ''}.`)
      const policies: string[] = []
      const held: string[] = []
      for (const k of ['anti_corruption_policy', 'whistleblower_policy', 'grievance_mechanism', 'board_esg_oversight']) {
        const label = METRICS_BY_KEY[k]?.label ?? k
        if (data.values[k] === 1) { held.push(label); grounded.push(k) }
        else if (data.values[k] === 0) { policies.push(label); grounded.push(k) }
      }
      if (held.length) lines.push(`The following are in force: ${held.join(', ')}.`)
      if (policies.length) lines.push(`Not yet in place: ${policies.join(', ')}. Each is a named expectation under both frameworks and should be prioritised.`)
      if (typeof data.values.corruption_cases === 'number') {
        grounded.push('corruption_cases')
        lines.push(`${data.values.corruption_cases} confirmed corruption incidents were recorded during the period.`)
      }
      lines.push(
        framework === 'BRSR'
          ? 'Governance content sits in Section B management and process disclosures and under Principle 1 in Section C.'
          : 'Governance content sits in ESRS 2 general disclosures and ESRS G1 business conduct.',
      )
      return { body: lines.join('\n\n'), groundedIn: grounded }
    }

    case 'recommendations': {
      const recs: string[] = []
      const high = gaps.filter((g) => g.severity === 'high')
      if (high.length) {
        recs.push(`Close the ${high.length} high-priority data gaps first — ${high.slice(0, 3).map((g) => g.label.toLowerCase()).join(', ')}. Without them the mandatory disclosures cannot be completed.`)
      }
      const ren = by.renewableShare
      if (ren && ren.value < 30) {
        grounded.push('renewableShare')
        recs.push(`Renewable share is ${ren.value.toFixed(1)}%. A rooftop solar or open-access power purchase agreement is the usual next step at this scale and moves Scope 2 directly.`)
      }
      const wd = by.wasteDivertedShare
      if (wd && wd.value < 60) {
        grounded.push('wasteDivertedShare')
        recs.push(`Waste diversion is ${wd.value.toFixed(1)}%. Segregation at source is the cheapest lever before any processing investment.`)
      }
      const l = by.ltifr
      if (l && l.value > 2) {
        grounded.push('ltifr')
        recs.push(`An LTIFR of ${l.value.toFixed(2)} is high enough to warrant a documented root-cause review of each incident.`)
      }
      if (data.values.whistleblower_policy === 0) {
        recs.push('Adopt a whistleblower mechanism. It is low cost, and both frameworks ask about it directly.')
      }
      if (recs.length === 0) recs.push('No material gaps were detected in the reported set. Focus the coming year on assurance readiness and value-chain data.')
      return {
        body: recs.map((r, i) => `${i + 1}. ${r}`).join('\n\n'),
        groundedIn: grounded,
      }
    }
  }
}

function buildReport(company: Company, year: number, framework: Framework): Report {
  const data = datasetFor(company.id, year)
  const now = new Date().toISOString()
  const sections: ReportSection[] = (
    ['executive_summary', 'environmental', 'social', 'governance', 'recommendations'] as ReportSectionKey[]
  ).map((key) => ({
    key,
    title: SECTION_TITLES[key],
    body: '',
    edited: false,
    groundedIn: compose(key, company, data, framework).groundedIn,
  }))
  return {
    id: nextReportId++,
    companyId: company.id,
    year,
    framework,
    sections,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
  }
}

/* ---------------- assistant ---------------- */

function answer(companyId: number, year: number, question: string): ChatMessage {
  const company = companies.find((c) => c.id === companyId)
  const data = datasetFor(companyId, year)
  const prev = previousFor(companyId, year)
  const calc = calculate(data, { previous: prev })
  const by = Object.fromEntries(calc.map((c) => [c.key, c]))
  const q = question.toLowerCase()
  const citations: string[] = []

  const hit = (...kw: string[]) => kw.some((k) => q.includes(k))

  let body: string

  if (hit('gap', 'missing', 'incomplete', 'what do i still')) {
    const gaps = findGaps(data)
    const high = gaps.filter((g) => g.severity === 'high')
    citations.push(...gaps.slice(0, 6).map((g) => g.metricKey))
    body = gaps.length === 0
      ? `Nothing is missing for FY ${year} — every metric in the catalogue has a value.`
      : `${gaps.length} metrics are unreported for FY ${year}, ${high.length} of them high priority.\n\n${gaps.slice(0, 6).map((g) => `• **${g.label}** (${g.severity}) — feeds ${g.blocks.join(', ')}`).join('\n')}${gaps.length > 6 ? `\n\n…and ${gaps.length - 6} more. The Compliance page lists all of them.` : ''}`
  } else if (hit('brsr', 'sebi', 'ngrbc', 'principle')) {
    const d = evaluate(data, 'BRSR')
    const s = summarise(d, 'BRSR')
    body = `For BRSR you have **${s.coverage}% metric coverage** across the ${s.mandatoryTracked} mandatory disclosures this platform tracks numerically: ${s.complete} complete, ${s.partial} partial, ${s.missing} not started.\n\nRead that carefully — BRSR has ${s.mandatoryTotal} mandatory disclosures in total, so ${s.mandatoryTotal - s.mandatoryTracked} of them have no numeric metric behind them and still need writing up.\n\nBRSR has three sections: A general disclosures, B management and process, C principle-wise performance against the nine NGRBC principles. Section C splits each principle into essential indicators, which are mandatory, and leadership indicators, which are voluntary.`
  } else if (hit('csrd', 'esrs', 'europe', 'eu ')) {
    const d = evaluate(data, 'CSRD')
    const s = summarise(d, 'CSRD')
    body = `For CSRD you have **${s.coverage}% metric coverage** across the ESRS datapoints tracked here, and ${s.narrative} standards have no numeric metric mapped at all.\n\nThe first set of ESRS is 12 standards: ESRS 1 and 2 are cross-cutting, then E1–E5, S1–S4 and G1. Only ESRS 2 applies unconditionally — which topical standards apply to you is decided by your own double-materiality assessment, which this platform does not perform.\n\nSo treat this percentage as progress on data collection, not as readiness to file.`
  } else if (hit('emission', 'co2', 'carbon', 'scope', 'ghg')) {
    const t = by.totalCo2, s1 = by.scope1, s2 = by.scope2
    if (t) {
      citations.push('totalCo2', 'scope1', 'scope2')
      const ch = pctChange(t.value, t.previous)
      body = `Total emissions for FY ${year} were **${formatValue(t.value, t.unit)} tCO₂e**${ch ? ` — ${ch}` : ''}.\n\n• Scope 1 (diesel + petrol): ${s1 ? formatValue(s1.value, s1.unit) : '—'} tCO₂e\n• Scope 2 (grid electricity): ${s2 ? formatValue(s2.value, s2.unit) : '—'} tCO₂e\n\nScope 2 uses the location-based method with the CEA grid factor of 0.727 kg CO₂e/kWh (FY 2023-24). Scope 3 is not calculated here.`
    } else {
      body = `I can't compute emissions for FY ${year} — electricity and fuel figures haven't been entered yet.`
    }
  } else if (hit('water')) {
    const w = by.waterIntensity, r = by.waterRecycledShare
    citations.push('waterIntensity', 'waterRecycledShare')
    body = w
      ? `Water intensity is **${formatValue(w.value, w.unit)} kL per employee**${r ? `, with ${r.value.toFixed(1)}% of withdrawal recycled or reused` : ''}. This feeds BRSR Principle 6 and ESRS E3.`
      : `No water data has been entered for FY ${year}.`
  } else if (hit('waste', 'circular')) {
    const wd = by.wasteDivertedShare
    citations.push('wasteDivertedShare')
    body = wd
      ? `**${wd.value.toFixed(1)}%** of waste was diverted from disposal in FY ${year}. This supports BRSR Principle 6 and ESRS E5 resource use and circular economy.`
      : `No waste data has been entered for FY ${year}.`
  } else if (hit('diversity', 'women', 'gender')) {
    const d = by.genderDiversity, b = by.boardDiversity
    citations.push('genderDiversity', 'boardDiversity')
    body = d
      ? `Women are **${d.value.toFixed(1)}%** of the workforce${b ? ` and ${b.value.toFixed(1)}% of the board` : ''} in FY ${year}. Gender diversity is one of the nine BRSR Core attributes and sits under ESRS S1.`
      : `Headcount breakdown hasn't been entered for FY ${year}.`
  } else if (hit('safety', 'injur', 'ltifr', 'accident')) {
    const l = by.ltifr
    citations.push('ltifr')
    body = l
      ? `LTIFR for FY ${year} is **${l.value.toFixed(2)}** per million hours worked${l.previous !== undefined ? ` (previously ${l.previous.toFixed(2)})` : ''}. Employee wellbeing and safety is a BRSR Core attribute and an ESRS S1 disclosure.`
      : `Injury and hours-worked figures are needed before I can give you a rate.`
  } else if (hit('score', 'how are we doing', 'performance', 'overall')) {
    const sc = scorePillars(data, prev)
    body = `Internal readiness for FY ${year}: **${overallScore(sc)}/100** overall.\n\n${sc.map((s) => `• ${s.label}: ${s.value}${s.previous !== undefined ? ` (was ${s.previous})` : ''}`).join('\n')}\n\nTo be clear about what this is: a blend of how complete your data is and how the numbers compare against internal targets. It is not a rating from MSCI, Sustainalytics or any agency, and no regulator recognises it.`
  } else if (hit('factor', '0.82', 'grid')) {
    body = `The grid factor in use is **0.727 kg CO₂e/kWh**, the CEA weighted average for FY 2023-24.\n\nIf you've seen 0.82 quoted, that's the FY 2015-16 figure — India's grid has decarbonised since. You can override the factor in Settings, and whatever you set is recorded alongside the result so the calculation stays reproducible.`
  } else if (hit('help', 'what can you')) {
    body = `I answer from this company's own saved numbers — I don't invent figures. Try:\n\n• "What's our carbon footprint?"\n• "What data are we missing?"\n• "How ready are we for BRSR?"\n• "Explain the CSRD requirements"\n• "How's our safety record?"`
  } else {
    body = `I work from ${company?.name ?? 'this company'}'s FY ${year} data, so I can answer on emissions, energy, water, waste, diversity, safety, governance, and readiness against BRSR or CSRD.\n\nI don't have anything on that specific question. Ask me "what can you help with?" for the list.`
  }

  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: body,
    createdAt: new Date().toISOString(),
    citations: citations.length ? [...new Set(citations)] : undefined,
  }
}

/* ---------------- api ---------------- */

export const mockApi: EsgApi = {
  async listCompanies() {
    await delay(jitter(180))
    return structuredClone(companies)
  },

  async createCompany(input) {
    await delay(jitter(260))
    const company: Company = { ...input, id: nextCompanyId++, years: [new Date().getFullYear()] }
    companies.push(company)
    return structuredClone(company)
  },

  async getDataset(companyId, year) {
    await delay(jitter(200))
    return structuredClone(datasetFor(companyId, year))
  },

  async saveDataset(dataset) {
    await delay(jitter(320))
    datasets[`${dataset.companyId}:${dataset.year}`] = structuredClone(dataset)
    const company = companies.find((c) => c.id === dataset.companyId)
    if (company && !company.years.includes(dataset.year)) {
      company.years = [...company.years, dataset.year].sort()
    }
    return structuredClone(dataset)
  },

  async importDataset(companyId, year, file) {
    await delay(jitter(700))
    const text = await file.text()
    const rows = text.split(/\r?\n/).filter(Boolean)
    if (rows.length < 2) throw new ApiError('That file has no data rows.')

    const header = rows[0].split(',').map((h) => h.trim().toLowerCase())
    const keyIdx = header.findIndex((h) => h === 'metric' || h === 'key' || h === 'metric_key')
    const valIdx = header.findIndex((h) => h === 'value')
    if (keyIdx === -1 || valIdx === -1) {
      throw new ApiError('Expected a CSV with "metric" and "value" columns.')
    }

    const existing = datasetFor(companyId, year)
    const values = { ...existing.values }
    let applied = 0
    const unknown: string[] = []

    for (const row of rows.slice(1)) {
      const cells = row.split(',')
      const key = (cells[keyIdx] ?? '').trim()
      const raw = (cells[valIdx] ?? '').trim()
      if (!key) continue
      if (!METRICS_BY_KEY[key]) { unknown.push(key); continue }
      const n = Number(raw)
      if (raw === '' || Number.isNaN(n)) continue
      values[key] = n
      applied++
    }

    if (applied === 0) {
      throw new ApiError(
        unknown.length
          ? `No rows matched a known metric. Unrecognised: ${unknown.slice(0, 4).join(', ')}.`
          : 'No usable numeric rows were found.',
      )
    }

    const next = { companyId, year, values }
    datasets[`${companyId}:${year}`] = next
    return structuredClone(next)
  },

  async getReport(companyId, year, framework: Framework) {
    await delay(jitter(240))
    const key = `${companyId}:${year}:${framework}`
    if (!reports[key]) {
      const company = companies.find((c) => c.id === companyId)
      if (!company) throw new ApiError('Unknown company', 404)
      reports[key] = buildReport(company, year, framework)
    }
    return structuredClone(reports[key])
  },

  async generateSection(reportId, section: ReportSectionKey, signal) {
    // Deliberately slow — a real model call takes this long, and the UI
    // needs to be built against that, not against an instant return.
    await delay(jitter(1100))
    if (signal?.aborted) throw new ApiError('Generation cancelled')

    const report = Object.values(reports).find((r) => r.id === reportId)
    if (!report) throw new ApiError('Unknown report', 404)
    const company = companies.find((c) => c.id === report.companyId)
    if (!company) throw new ApiError('Unknown company', 404)

    const data = datasetFor(report.companyId, report.year)
    const { body, groundedIn } = compose(section, company, data, report.framework)
    const generatedAt = new Date().toISOString()

    const target = report.sections.find((s) => s.key === section)
    if (target) {
      target.body = body
      target.groundedIn = groundedIn
      target.generatedAt = generatedAt
      target.edited = false
    }
    report.updatedAt = generatedAt
    return { body, groundedIn, generatedAt }
  },

  async saveSection(reportId, section, body) {
    await delay(jitter(160))
    const report = Object.values(reports).find((r) => r.id === reportId)
    const target = report?.sections.find((s) => s.key === section)
    if (report && target) {
      target.body = body
      target.edited = true
      report.updatedAt = new Date().toISOString()
    }
  },

  async exportPdf(reportId) {
    await delay(jitter(900))
    const report = Object.values(reports).find((r) => r.id === reportId)
    if (!report) throw new ApiError('Unknown report', 404)
    const company = companies.find((c) => c.id === report.companyId)

    // The real PDF comes from pdf_service.py / ReportLab. This stand-in
    // produces a readable text file so the download path is testable.
    const text = [
      `${company?.name ?? 'Company'} — ESG Report FY ${report.year}`,
      `Framework: ${report.framework}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      '--- PREVIEW BUILD ---',
      'In production this file is produced by pdf_service.py using ReportLab.',
      'The mock backend emits plain text so the download flow can be tested.',
      '',
      ...report.sections.flatMap((s) => [s.title.toUpperCase(), '', s.body || '(not generated)', '']),
    ].join('\n')

    return new Blob([text], { type: 'text/plain' })
  },

  async chat(companyId, year, messages: ChatMessage[], signal) {
    await delay(jitter(850))
    if (signal?.aborted) throw new ApiError('Cancelled')
    const last = [...messages].reverse().find((m) => m.role === 'user')
    return answer(companyId, year, last?.content ?? '')
  },
}
