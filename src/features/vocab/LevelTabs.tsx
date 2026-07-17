import { LEVEL_ORDER, type JlptLevel } from '../../shared/contentTypes.ts'

interface LevelTabsProps {
  current: JlptLevel
  onChange: (level: JlptLevel) => void
}

export function LevelTabs({ current, onChange }: LevelTabsProps) {
  return (
    <div className="level-tabs" role="tablist">
      {LEVEL_ORDER.map((level) => (
        <button
          key={level}
          type="button"
          role="tab"
          aria-selected={level === current}
          className={level === current ? 'level-tab active' : 'level-tab'}
          onClick={() => onChange(level)}
        >
          {level}
        </button>
      ))}
    </div>
  )
}
