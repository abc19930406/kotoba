import { useEffect, useState } from 'react'
import { getCurrentLevel, getShowFurigana } from '../../db/cards.ts'
import { buildDailyPackage, buildKnownWordsSample, type DailyPackage } from '../../db/dailyPackage.ts'
import { getCachedMaterial, saveCachedMaterial, incrementRegenerateCount } from '../../db/dailyMaterialCache.ts'
import { fetchDailyMaterial, type DailyMaterialErrorReason } from '../../shared/dailyMaterialClient.ts'
import { getDailyPasscode } from '../../shared/dailyPasscode.ts'
import { JapaneseSentence } from '../../shared/JapaneseSentence.tsx'
import { SpeakButton } from '../../shared/SpeakButton.tsx'
import { DailyPackageVocabItem } from './DailyPackageVocabItem.tsx'
import { DailyPackageGrammarItem } from './DailyPackageGrammarItem.tsx'
import type { DailyMaterialResponseBody } from '../../shared/dailyMaterialTypes.ts'
import type { JlptLevel } from '../../shared/contentTypes.ts'

interface DailyMaterialPageProps {
  onBack: () => void
}

type EssayState = 'no-passcode' | 'loading' | 'success' | 'error'

const REGENERATE_LIMIT = 2

const ERROR_MESSAGES: Record<DailyMaterialErrorReason, string> = {
  passcode: '通行碼錯誤，請至首頁設定欄確認通行碼',
  'rate-limit': '已達今日生成次數上限，請明天再試',
  network: '離線或網路連線失敗',
  server: '生成失敗，請稍後再試',
}

export function DailyMaterialPage({ onBack }: DailyMaterialPageProps) {
  const [level, setLevel] = useState<JlptLevel | null>(null)
  const [pkg, setPkg] = useState<DailyPackage | null>(null)
  const [showFurigana, setShowFuriganaState] = useState(true)
  const [essayState, setEssayState] = useState<EssayState>('loading')
  const [essayData, setEssayData] = useState<DailyMaterialResponseBody | null>(null)
  const [errorReason, setErrorReason] = useState<DailyMaterialErrorReason | null>(null)
  const [regenerateCount, setRegenerateCount] = useState(0)
  const [lastAttemptWasRegenerate, setLastAttemptWasRegenerate] = useState(false)

  async function generate(targetPkg: DailyPackage, targetLevel: JlptLevel, isRegenerate: boolean) {
    setEssayState('loading')
    setLastAttemptWasRegenerate(isRegenerate)
    const knownWords = await buildKnownWordsSample()
    const result = await fetchDailyMaterial({
      level: targetLevel,
      knownWords,
      newWords: targetPkg.newVocab.map((v) => ({ kanji: v.kanji, kana: v.kana })),
    })
    if (result.ok) {
      if (isRegenerate) {
        const count = await incrementRegenerateCount(targetPkg.date, targetLevel, result.data)
        setRegenerateCount(count)
      } else {
        await saveCachedMaterial(targetPkg.date, targetLevel, result.data)
      }
      setEssayData(result.data)
      setEssayState('success')
    } else {
      setErrorReason(result.error.reason)
      setEssayState('error')
    }
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      const [currentLevel, furigana] = await Promise.all([getCurrentLevel(), getShowFurigana()])
      if (cancelled) return
      setLevel(currentLevel)
      setShowFuriganaState(furigana)

      const builtPkg = await buildDailyPackage(currentLevel)
      if (cancelled) return
      setPkg(builtPkg)

      if (!getDailyPasscode()) {
        setEssayState('no-passcode')
        return
      }

      const cached = await getCachedMaterial(builtPkg.date, currentLevel)
      if (cancelled) return
      if (cached) {
        setEssayData({
          paragraphs: cached.paragraphs,
          zh: cached.zh,
          comprehensionPoints: cached.comprehensionPoints,
          // Defensive — a cache row matching the current versioned key should
          // always have this, but don't trust the type over runtime reality.
          grammarNotes: cached.grammarNotes ?? [],
        })
        setRegenerateCount(cached.regenerateCount)
        setEssayState('success')
        return
      }

      await generate(builtPkg, currentLevel, false)
    }

    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleRetry() {
    if (!pkg || !level) return
    generate(pkg, level, lastAttemptWasRegenerate)
  }

  function handleRegenerate() {
    if (!pkg || !level) return
    generate(pkg, level, true)
  }

  return (
    <div className="daily-material-page vocab-browse-page">
      <div className="vocab-browse-header">
        <button type="button" className="vocab-browse-back" onClick={onBack}>
          ← 首頁
        </button>
        <h1>今日教材</h1>
      </div>

      {!pkg && <p className="vocab-status">載入中…</p>}

      {pkg && level && (
        <section className="daily-package-section">
          <h2>今日學習包</h2>
          <div>
            <h3>新字</h3>
            {pkg.newVocab.length === 0 ? (
              <p className="vocab-status">目前沒有未開始的新字。</p>
            ) : (
              <div className="daily-package-list">
                {pkg.newVocab.map((v) => (
                  <DailyPackageVocabItem key={v.id} entry={v} currentLevel={level} showFurigana={showFurigana} />
                ))}
              </div>
            )}
          </div>
          <div>
            <h3>新文法</h3>
            {pkg.newGrammar.length === 0 ? (
              <p className="vocab-status">目前沒有未開始的新文法點。</p>
            ) : (
              <div className="daily-package-list">
                {pkg.newGrammar.map((g) => (
                  <DailyPackageGrammarItem key={g.id} entry={g} currentLevel={level} showFurigana={showFurigana} />
                ))}
              </div>
            )}
          </div>
          <div>
            <h3>快忘清單</h3>
            {pkg.reviewVocab.length === 0 ? (
              <p className="vocab-status">目前沒有需要加強複習的到期字。</p>
            ) : (
              <div className="daily-package-list">
                {pkg.reviewVocab.map((v) => (
                  <DailyPackageVocabItem key={v.id} entry={v} currentLevel={level} showFurigana={showFurigana} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="daily-essay-section">
        <h2>今日短文</h2>
        {essayState === 'no-passcode' && (
          <p className="vocab-status">
            尚未設定每日教材通行碼。請至首頁設定欄輸入通行碼（需與 Vercel 後台的 DAILY_SECRET 相符）以啟用 AI 短文功能。
          </p>
        )}
        {essayState === 'loading' && <p className="vocab-status">短文生成中…</p>}
        {essayState === 'error' && errorReason && (
          <div>
            <p className="vocab-error-inline">{ERROR_MESSAGES[errorReason]}</p>
            <button type="button" className="daily-regenerate-button" onClick={handleRetry}>
              重試
            </button>
          </div>
        )}
        {essayState === 'success' && essayData && (
          <div className="daily-essay-content">
            {essayData.paragraphs.map((paragraph, i) => (
              <div className="daily-essay-paragraph" key={i}>
                <JapaneseSentence jpSegments={paragraph} showFurigana={showFurigana} className="jp" />
                <SpeakButton text={paragraph.map((s) => s[0]).join('')} context="sentence" />
              </div>
            ))}
            <div className="daily-essay-meta">
              <h3>繁中翻譯</h3>
              <p>{essayData.zh}</p>
              <h3>讀解要點</h3>
              <ul>
                {essayData.comprehensionPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
            {(essayData.grammarNotes?.length ?? 0) > 0 && (
              <div className="daily-grammar-notes">
                <h3>文法解析</h3>
                {essayData.grammarNotes!.map((note, i) => (
                  <div className="daily-grammar-note" key={i}>
                    <div className="sentence-jp-row">
                      <JapaneseSentence jpSegments={note.sentence} showFurigana={showFurigana} className="jp" />
                      <SpeakButton text={note.sentence.map((s) => s[0]).join('')} context="sentence" />
                    </div>
                    <p className="daily-grammar-note-point">{note.grammarPoint}</p>
                    <p className="daily-grammar-note-explanation">{note.explanation}</p>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="daily-regenerate-button"
              onClick={handleRegenerate}
              disabled={regenerateCount >= REGENERATE_LIMIT}
            >
              重新生成（今日已使用 {regenerateCount}/{REGENERATE_LIMIT} 次）
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
