import kuromoji from 'kuromoji'
import path from 'node:path'

const CONTENT_POS = new Set(['名詞', '動詞', '形容詞', '副詞'])
const LENGTH_CORRECTION_THRESHOLD = 25
const MAX_DIFFICULTY = 6
const JMDICT_FALLBACK_LEVEL = 3
const KATAKANA_ONLY = /^[ァ-ヶー]+$/

// IPADIC's dictionary (basic) form for する is the archaic kanji 為る,
// which never appears in JLPT vocab lists (they use the kana する) — remap it
// so this extremely common verb doesn't fall back to "unknown".
const BASIC_FORM_ALIASES: Record<string, string> = {
  為る: 'する',
}

// Passive/causative auxiliaries — kuromoji/IPADIC tags these as 動詞 (verb)
// rather than 助動詞, so the plain POS filter below doesn't catch them, but
// they're grammar, not vocabulary, and never appear as JLPT word-list
// headwords. Excluded by lemma regardless of whatever POS they're tagged.
const EXCLUDE_LEMMAS = new Set(['れる', 'られる', 'せる', 'させる'])

// 動詞,接尾 / 動詞,非自立 covers auxiliary-verb usage (〜ている, 〜てくれる,
// 〜てやる, 〜てしまう, etc.) — grammatical function, not content vocabulary.
const EXCLUDE_VERB_DETAIL = new Set(['接尾', '非自立'])
// 名詞,数 is a digit/number token (２, ０, 一, 万, …); 名詞,記号 is a
// symbol miscategorized as a noun. Neither belongs in a difficulty count.
const EXCLUDE_NOUN_DETAIL = new Set(['数', '記号'])

export interface WordLevelDetail {
  surface: string
  baseForm: string
  pos: string
  level: number
}

export interface GradeResult {
  difficulty: number
  label: string
  words: WordLevelDetail[]
  tokenCount: number
}

export type Grader = (sentence: string) => GradeResult

function katakanaToHiragana(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
}

function percentile90(levels: number[]): number {
  if (levels.length === 0) return 1
  const sorted = [...levels].sort((a, b) => a - b)
  const idx = 0.9 * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  const weight = idx - lower
  const value = sorted[lower] + (sorted[upper] - sorted[lower]) * weight
  return Math.round(value)
}

export function levelToLabel(difficulty: number): string {
  const labels = ['', 'N5', 'N4', 'N3', 'N2', 'N1']
  return difficulty >= MAX_DIFFICULTY ? 'N1+' : (labels[difficulty] ?? 'N1+')
}

function buildTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  return new Promise((resolve, reject) => {
    kuromoji
      .builder({ dicPath: path.join(process.cwd(), 'node_modules/kuromoji/dict') })
      .build((err, tokenizer) => {
        if (err) reject(err)
        else resolve(tokenizer)
      })
  })
}

function normalizeBaseForm(t: kuromoji.IpadicFeatures): string {
  const raw = t.basic_form !== '*' ? t.basic_form : t.surface_form
  return BASIC_FORM_ALIASES[raw] ?? raw
}

function isExcludedToken(t: kuromoji.IpadicFeatures, baseForm: string): boolean {
  if (EXCLUDE_LEMMAS.has(baseForm)) return true
  if (t.pos === '動詞' && EXCLUDE_VERB_DETAIL.has(t.pos_detail_1)) return true
  if (t.pos === '名詞' && EXCLUDE_NOUN_DETAIL.has(t.pos_detail_1)) return true
  return false
}

/**
 * A word absent from the JLPT vocab list isn't necessarily obscure — jmdict
 * may still know it. Common jmdict words (any script) and existing katakana
 * loanwords are treated as mid-difficulty (L3) rather than "unknown" (L6),
 * which otherwise dominates the 90th-percentile score for one rare word.
 */
function classifyUnknown(
  baseForm: string,
  surface: string,
  jmdictCommonWords: Set<string>,
  jmdictAllWords: Set<string>,
): number {
  if (jmdictCommonWords.has(baseForm) || jmdictCommonWords.has(surface)) {
    return JMDICT_FALLBACK_LEVEL
  }
  const isKatakanaLoanword = KATAKANA_ONLY.test(baseForm) || KATAKANA_ONLY.test(surface)
  if (isKatakanaLoanword && (jmdictAllWords.has(baseForm) || jmdictAllWords.has(surface))) {
    return JMDICT_FALLBACK_LEVEL
  }
  return MAX_DIFFICULTY
}

export async function createGrader(
  levelMap: Map<string, number>,
  jmdictCommonWords: Set<string>,
  jmdictAllWords: Set<string>,
): Promise<Grader> {
  const tokenizer = await buildTokenizer()

  return function gradeSentence(sentence: string): GradeResult {
    const tokens = tokenizer.tokenize(sentence)
    const contentTokens = tokens.filter((t) => {
      const baseForm = normalizeBaseForm(t)
      if (isExcludedToken(t, baseForm)) return false
      return CONTENT_POS.has(t.pos)
    })

    const words: WordLevelDetail[] = contentTokens.map((t) => {
      const baseForm = normalizeBaseForm(t)
      const hiraganaReading = t.reading ? katakanaToHiragana(t.reading) : undefined
      const knownLevel =
        levelMap.get(baseForm) ??
        levelMap.get(t.surface_form) ??
        (hiraganaReading ? levelMap.get(hiraganaReading) : undefined)
      const level =
        knownLevel ?? classifyUnknown(baseForm, t.surface_form, jmdictCommonWords, jmdictAllWords)
      return { surface: t.surface_form, baseForm, pos: t.pos, level }
    })

    let difficulty = percentile90(words.map((w) => w.level))
    if (tokens.length > LENGTH_CORRECTION_THRESHOLD) {
      difficulty = Math.min(MAX_DIFFICULTY, difficulty + 1)
    }

    return { difficulty, label: levelToLabel(difficulty), words, tokenCount: tokens.length }
  }
}
