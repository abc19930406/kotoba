import { posLabel } from '../../shared/posLabels.ts'

interface VocabFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  posCodes: string[]
  selectedPos: Set<string>
  onTogglePos: (code: string) => void
}

export function VocabFilters({ search, onSearchChange, posCodes, selectedPos, onTogglePos }: VocabFiltersProps) {
  return (
    <div className="vocab-filters">
      <input
        type="search"
        className="vocab-search"
        placeholder="搜尋假名／漢字／釋義"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="搜尋單字"
      />
      {posCodes.length > 0 && (
        <div className="pos-chips">
          {posCodes.map((code) => (
            <button
              key={code}
              type="button"
              className={selectedPos.has(code) ? 'pos-chip active' : 'pos-chip'}
              aria-pressed={selectedPos.has(code)}
              onClick={() => onTogglePos(code)}
            >
              {posLabel(code)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
