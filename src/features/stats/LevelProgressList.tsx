import type { LevelProgress } from '../../db/stats.ts'

interface LevelProgressListProps {
  title: string
  progress: LevelProgress[]
}

export function LevelProgressList({ title, progress }: LevelProgressListProps) {
  return (
    <div className="level-progress-group">
      <h3>{title}</h3>
      <ul className="level-progress-list">
        {progress.map((p) => {
          const total = p.active + p.suspended + p.notStarted
          const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
          return (
            <li key={p.level} className="level-progress-row">
              <span className="level-progress-label">{p.level}</span>
              <div
                className="level-progress-bar"
                role="img"
                aria-label={`${p.level}：學習中 ${p.active}、已熟悉 ${p.suspended}、未開始 ${p.notStarted}`}
              >
                <span className="level-progress-segment active" style={{ width: `${pct(p.active)}%` }} />
                <span className="level-progress-segment suspended" style={{ width: `${pct(p.suspended)}%` }} />
                <span className="level-progress-segment not-started" style={{ width: `${pct(p.notStarted)}%` }} />
              </div>
              <span className="level-progress-numbers">
                {p.active} 學習中 / {p.suspended} 已熟悉 / {p.notStarted} 未開始
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
