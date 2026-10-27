import type { IndustryBenchmark, RatingPillar } from '@/types'
import { Card, CardHeader } from './ui'

const PILLAR_VAR: Record<string, string> = {
  E: 'var(--series-e)',
  S: 'var(--series-s)',
  G: 'var(--series-g)',
}

/**
 * The third-party rating from the imported dataset.
 *
 * The three pillar scores sit on different scales, so the bar shows the
 * company's percentile within the imported set — the raw score is
 * printed beside it rather than drawn, because comparing raw E to raw G
 * would be meaningless.
 */
export function RatingPanel({
  pillars,
  benchmark,
}: {
  pillars: RatingPillar[]
  benchmark: IndustryBenchmark | null
}) {
  if (pillars.length === 0) return null

  return (
    <Card>
      <CardHeader
        title="Third-party ESG rating"
        subtitle="From the imported ratings dataset. Bars show this company's percentile among the companies in that dataset; higher is better."
      />
      <div className="space-y-4 p-5">
        {pillars.map((p) => (
          <div key={p.pillar}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 text-sm text-ink">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: PILLAR_VAR[p.pillar] }}
                  aria-hidden
                />
                {p.label}
                {p.grade && (
                  <span className="rounded border border-hairline px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
                    {p.grade}
                  </span>
                )}
              </span>
              <span className="tnum text-sm text-ink-2">
                <span className="font-semibold text-ink">
                  {p.percentile !== null ? `${p.percentile.toFixed(0)}th` : '—'}
                </span>{' '}
                <span className="text-xs text-ink-muted">
                  pct · score {p.score.toLocaleString()}
                </span>
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
              role="meter"
              aria-valuenow={p.percentile ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${p.label} percentile`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${p.percentile ?? 0}%`,
                  background: PILLAR_VAR[p.pillar],
                }}
              />
            </div>
          </div>
        ))}

        {benchmark && (
          <div className="mt-1 rounded-lg bg-surface-2 px-4 py-3">
            <p className="text-xs text-ink-2">
              Against <strong className="font-semibold text-ink">{benchmark.industry}</strong>{' '}
              peers ({benchmark.peers} companies)
            </p>
            <p className="tnum mt-1 text-sm text-ink">
              {benchmark.companyScore.toLocaleString()}{' '}
              <span className="text-xs font-normal text-ink-muted">
                vs {benchmark.industryAverage.toLocaleString()} average
              </span>{' '}
              <span
                className="text-xs font-medium"
                style={{
                  color:
                    benchmark.companyScore >= benchmark.industryAverage
                      ? 'var(--success-text)'
                      : 'var(--critical)',
                }}
              >
                {benchmark.companyScore >= benchmark.industryAverage ? 'above' : 'below'}
              </span>
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
