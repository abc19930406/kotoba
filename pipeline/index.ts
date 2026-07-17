import path from 'node:path'
import { fetchAll } from './fetch.ts'
import { buildLinkedData } from './link.ts'
import { emit } from './emit.ts'
import { translateMissing } from './translate.ts'
import { translateGrammarMissing } from './translateGrammar.ts'
import { sampleDeterministic, writeGradingReport, type GrammarDifficultyStat } from './report.ts'
import { LEVEL_ORDER } from './schemas.ts'

const REPORT_PATH = path.resolve(import.meta.dirname, 'report.md')
const REPORT_SAMPLE_SIZE = 30
const GRAMMAR_HIGH_DIFFICULTY_THRESHOLD = 4

// The 10 sentences the previous (pre-fix) report.md flagged as
// implausibly hard, with the difficulty that old grader assigned them.
// Kept here so `npm run pipeline` can regrade them and show a before/after
// diff without depending on the old report.md still existing on disk.
const FLAGGED_SENTENCES: Array<{ sentence: string; oldDifficulty: number }> = [
  { sentence: '負けたチームはゆっくりと競技場を去った。', oldDifficulty: 5 },
  { sentence: '私は５万円までつけがきく。', oldDifficulty: 5 },
  { sentence: 'あっさり断られると思いきや、彼女は承諾してくれました。', oldDifficulty: 5 },
  { sentence: '例えば、小鳥は特別な防御装置を備えている。', oldDifficulty: 5 },
  { sentence: '彼は当時町で最も金持ちだったといわれている。', oldDifficulty: 6 },
  { sentence: 'ひとりの高校生がこのロボットを作った。', oldDifficulty: 5 },
  { sentence: '彼は少なくとも年収２０００万円は稼いでる。', oldDifficulty: 6 },
  { sentence: '白ワインは魚料理にはつきものだ。', oldDifficulty: 5 },
  { sentence: '夕食の準備はできてるかな。', oldDifficulty: 5 },
  { sentence: '彼女の願いを聞いてやるように言われていたが、彼は完全に無視してしまった。', oldDifficulty: 6 },
]

async function main() {
  const force = process.argv.includes('--force')

  console.log('=== 1/4 fetch ===')
  const sourceVersions = await fetchAll(force)

  console.log('=== 2/4 grade + 3/4 link ===')
  const linked = await buildLinkedData()

  if (process.argv.includes('--translate')) {
    console.log('=== translate (zh-TW meanings) ===')
    await translateMissing(linked.vocab)
  }

  if (process.argv.includes('--translate-grammar')) {
    console.log('=== translate-grammar (zh-TW explanations) ===')
    await translateGrammarMissing(linked.grammar)
  }

  console.log('=== 4/4 emit ===')
  const index = await emit(linked, sourceVersions)

  console.log('=== report ===')
  const comparisonRows = FLAGGED_SENTENCES.map((f) => ({
    sentence: f.sentence,
    oldDifficulty: f.oldDifficulty,
    newResult: linked.grade(f.sentence),
  }))
  const improvedCount = comparisonRows.filter((r) => r.newResult.difficulty < r.oldDifficulty).length
  console.log(`comparison: ${improvedCount}/${comparisonRows.length} flagged sentences improved`)

  const grammarStats: GrammarDifficultyStat[] = LEVEL_ORDER.map((level) => {
    const allSentences = linked.grammar[level].flatMap((g) => g.sentences)
    const highDifficultyCount = allSentences.filter((s) => s.difficulty >= GRAMMAR_HIGH_DIFFICULTY_THRESHOLD).length
    return { level, total: allSentences.length, highDifficultyCount }
  })
  const n5Stat = grammarStats.find((s) => s.level === 'N5')!
  console.log(
    `grammar-n5: ${n5Stat.highDifficultyCount}/${n5Stat.total} example sentences graded difficulty>=4 (${((100 * n5Stat.highDifficultyCount) / n5Stat.total).toFixed(1)}%)`,
  )

  const samples = sampleDeterministic(
    Array.from(linked.gradedSentences.entries()).map(([sentence, result]) => ({ sentence, result })),
    REPORT_SAMPLE_SIZE,
  )

  await writeGradingReport(REPORT_PATH, {
    comparisonRows,
    vocabCoverage: index.vocab,
    grammarStats,
    samples,
  })
  console.log(`report: ${path.relative(process.cwd(), REPORT_PATH)} (${samples.length} samples)`)

  console.log('Pipeline complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
