import { writeFile } from 'node:fs/promises'
import type { GradeResult } from './grade.ts'
import { levelToLabel } from './grade.ts'
import type { IndexFile, JlptLevel } from './schemas.ts'

export interface ReportSample {
  sentence: string
  result: GradeResult
}

export interface ComparisonRow {
  sentence: string
  oldDifficulty: number
}

export interface GrammarDifficultyStat {
  level: JlptLevel
  total: number
  highDifficultyCount: number
}

/** Deterministic PRNG (mulberry32) so the "random" sample is stable across reruns. */
function mulberry32(seed: number): () => number {
  let state = seed
  return function next() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sampleDeterministic<T>(items: T[], count: number, seed = 42): T[] {
  const rand = mulberry32(seed)
  const pool = [...items]
  const picked: T[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length)
    picked.push(pool[idx])
    pool.splice(idx, 1)
  }
  return picked
}

function formatSampleSection(samples: ReportSample[]): string[] {
  const lines: string[] = []
  lines.push('## 隨機抽樣 30 句')
  lines.push('')
  lines.push('固定種子，重跑結果相同，供人工抽查分級方向是否合理。')
  lines.push('')
  samples.forEach((sample, i) => {
    lines.push(`### ${i + 1}. ${sample.sentence}`)
    lines.push('')
    lines.push(`- 判定難度：${sample.result.label}（內部值 ${sample.result.difficulty}）`)
    lines.push(`- 詞素數：${sample.result.tokenCount}`)
    if (sample.result.words.length > 0) {
      lines.push('- 實詞等級明細：')
      for (const w of sample.result.words) {
        lines.push(`  - ${w.surface}（基本形 ${w.baseForm}, ${w.pos}）→ L${w.level}`)
      }
    } else {
      lines.push('- 實詞等級明細：（無實詞）')
    }
    lines.push('')
  })
  return lines
}

function formatComparisonSection(rows: Array<ComparisonRow & { newResult: GradeResult }>): string[] {
  const lines: string[] = []
  lines.push('## 修正前後對照（上一版報告標記有問題的 10 句）')
  lines.push('')
  lines.push('| # | 句子 | 修正前 | 修正後 | 是否改善 |')
  lines.push('|---|---|---|---|---|')
  rows.forEach((row, i) => {
    const oldLabel = levelToLabel(row.oldDifficulty)
    const newLabel = row.newResult.label
    const improved = row.newResult.difficulty < row.oldDifficulty ? '是' : row.newResult.difficulty === row.oldDifficulty ? '持平' : '否（變更難）'
    lines.push(
      `| ${i + 1} | ${row.sentence} | ${oldLabel}（${row.oldDifficulty}） | ${newLabel}（${row.newResult.difficulty}） | ${improved} |`,
    )
  })
  lines.push('')
  return lines
}

function formatSummarySection(
  vocabCoverage: IndexFile['vocab'],
  grammarStats: GrammarDifficultyStat[],
): string[] {
  const lines: string[] = []
  lines.push('## 摘要統計')
  lines.push('')
  lines.push('### 各等級單字例句覆蓋率')
  lines.push('')
  lines.push('| 等級 | 單字總數 | 有例句 | 覆蓋率 |')
  lines.push('|---|---|---|---|')
  for (const v of vocabCoverage) {
    const pct = ((100 * v.withSentences) / v.count).toFixed(1)
    lines.push(`| ${v.level} | ${v.count} | ${v.withSentences} | ${pct}% |`)
  }
  lines.push('')
  lines.push('### 各等級文法例句「難度 ≥ N2（內部值 ≥ 4）」比例')
  lines.push('')
  lines.push('| 等級 | 例句總數 | 難度≥4 句數 | 比例 |')
  lines.push('|---|---|---|---|')
  for (const g of grammarStats) {
    const pct = g.total > 0 ? ((100 * g.highDifficultyCount) / g.total).toFixed(1) : '0.0'
    lines.push(`| ${g.level} | ${g.total} | ${g.highDifficultyCount} | ${pct}% |`)
  }
  lines.push('')
  return lines
}

export async function writeGradingReport(
  destPath: string,
  options: {
    comparisonRows: Array<ComparisonRow & { newResult: GradeResult }>
    vocabCoverage: IndexFile['vocab']
    grammarStats: GrammarDifficultyStat[]
    samples: ReportSample[]
  },
): Promise<void> {
  const lines: string[] = []
  lines.push('# 例句難度分級品質報告')
  lines.push('')
  lines.push(...formatSummarySection(options.vocabCoverage, options.grammarStats))
  lines.push(...formatComparisonSection(options.comparisonRows))
  lines.push(...formatSampleSection(options.samples))
  await writeFile(destPath, lines.join('\n'), 'utf-8')
}
