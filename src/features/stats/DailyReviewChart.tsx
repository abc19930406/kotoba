import type { DailyReviewCount } from '../../db/stats.ts'

interface DailyReviewChartProps {
  data: DailyReviewCount[]
}

const WIDTH = 300
const HEIGHT = 110
const LABEL_HEIGHT = 16
const CHART_HEIGHT = HEIGHT - LABEL_HEIGHT
const LABEL_EVERY = 5

/** Pure hand-drawn SVG bar chart — no charting library, per Phase 6 spec. Colors use CSS variables so dark mode needs no separate handling here. */
export function DailyReviewChart({ data }: DailyReviewChartProps) {
  if (data.length === 0) return null

  const max = Math.max(1, ...data.map((d) => d.count))
  const barWidth = WIDTH / data.length

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="daily-chart" role="img" aria-label="近 30 天每日複習量長條圖">
      {data.map((d, i) => {
        const barHeight = Math.max((d.count / max) * (CHART_HEIGHT - 4), d.count > 0 ? 1 : 0)
        const x = i * barWidth
        const y = CHART_HEIGHT - barHeight
        const showLabel = i % LABEL_EVERY === 0 || i === data.length - 1
        return (
          <g key={d.date}>
            <rect x={x + barWidth * 0.15} y={y} width={barWidth * 0.7} height={barHeight} fill="var(--accent)" rx={1} />
            {showLabel && (
              <text x={x + barWidth / 2} y={HEIGHT - 2} fontSize={7} textAnchor="middle" fill="var(--text)" opacity={0.6}>
                {d.date.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
