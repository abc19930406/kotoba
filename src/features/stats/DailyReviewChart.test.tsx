import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { DailyReviewChart } from './DailyReviewChart.tsx'
import type { DailyReviewCount } from '../../db/stats.ts'

function makeData(counts: number[]): DailyReviewCount[] {
  return counts.map((count, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, count }))
}

describe('DailyReviewChart', () => {
  it('renders one bar per data point', () => {
    const { container } = render(<DailyReviewChart data={makeData([0, 3, 5, 1, 0, 2, 4, 0, 1, 2])} />)
    expect(container.querySelectorAll('rect')).toHaveLength(10)
  })

  it('renders without throwing when every count is zero (no divide-by-zero)', () => {
    const { container } = render(<DailyReviewChart data={makeData([0, 0, 0])} />)
    expect(container.querySelectorAll('rect')).toHaveLength(3)
  })

  it('renders nothing for empty data', () => {
    const { container } = render(<DailyReviewChart data={[]} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
