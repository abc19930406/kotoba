import { useEffect, useState } from 'react'
import { HomePage } from './features/review/HomePage.tsx'
import { ReviewSession } from './features/review/ReviewSession.tsx'
import { SuspendedListPage } from './features/review/SuspendedListPage.tsx'
import { VocabBrowsePage } from './features/vocab/VocabBrowsePage.tsx'
import { GrammarBrowsePage } from './features/grammar/GrammarBrowsePage.tsx'
import { AboutPage } from './features/about/AboutPage.tsx'
import { StatsPage } from './features/stats/StatsPage.tsx'
import { NotebookListPage } from './features/notebook/NotebookListPage.tsx'
import { getTheme, setTheme, DEFAULT_THEME } from './db/cards.ts'
import { applyTheme, type ThemePreference } from './shared/theme.ts'
import { pushLayer, goBack } from './shared/backStack.ts'

type View = 'home' | 'review' | 'vocab' | 'grammar' | 'suspended' | 'about' | 'stats' | 'notebook'

function App() {
  const [view, setView] = useState<View>('home')
  const [theme, setThemeState] = useState(DEFAULT_THEME)

  useEffect(() => {
    getTheme().then(setThemeState)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyTheme(theme, mq.matches)
    if (theme !== 'system') return
    const handler = () => applyTheme('system', mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  async function handleThemeChange(next: ThemePreference) {
    await setTheme(next)
    setThemeState(next)
  }

  // Pushes a history entry before switching away from home, so the system
  // back gesture/button (or an in-app "← 首頁" button via goBack()) can undo
  // it — see src/shared/backStack.ts.
  function navigate(next: View) {
    pushLayer(() => setView('home'))
    setView(next)
  }

  if (view === 'review') {
    return <ReviewSession onComplete={goBack} />
  }
  if (view === 'vocab') {
    return <VocabBrowsePage onBack={goBack} />
  }
  if (view === 'grammar') {
    return <GrammarBrowsePage onBack={goBack} />
  }
  if (view === 'suspended') {
    return <SuspendedListPage onBack={goBack} />
  }
  if (view === 'about') {
    return <AboutPage onBack={goBack} />
  }
  if (view === 'stats') {
    return <StatsPage onBack={goBack} />
  }
  if (view === 'notebook') {
    return <NotebookListPage onBack={goBack} />
  }
  return (
    <HomePage
      onStartReview={() => navigate('review')}
      onBrowseVocab={() => navigate('vocab')}
      onBrowseGrammar={() => navigate('grammar')}
      onOpenSuspended={() => navigate('suspended')}
      onOpenAbout={() => navigate('about')}
      onOpenStats={() => navigate('stats')}
      onOpenNotebook={() => navigate('notebook')}
      theme={theme}
      onThemeChange={handleThemeChange}
    />
  )
}

export default App
