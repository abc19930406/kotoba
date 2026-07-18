import { useEffect, useState } from 'react'
import { HomePage } from './features/review/HomePage.tsx'
import { ReviewSession } from './features/review/ReviewSession.tsx'
import { SuspendedListPage } from './features/review/SuspendedListPage.tsx'
import { VocabBrowsePage } from './features/vocab/VocabBrowsePage.tsx'
import { GrammarBrowsePage } from './features/grammar/GrammarBrowsePage.tsx'
import { AboutPage } from './features/about/AboutPage.tsx'
import { StatsPage } from './features/stats/StatsPage.tsx'
import { getTheme, setTheme, DEFAULT_THEME } from './db/cards.ts'
import { applyTheme, type ThemePreference } from './shared/theme.ts'

type View = 'home' | 'review' | 'vocab' | 'grammar' | 'suspended' | 'about' | 'stats'

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

  if (view === 'review') {
    return <ReviewSession onComplete={() => setView('home')} />
  }
  if (view === 'vocab') {
    return <VocabBrowsePage onBack={() => setView('home')} />
  }
  if (view === 'grammar') {
    return <GrammarBrowsePage onBack={() => setView('home')} />
  }
  if (view === 'suspended') {
    return <SuspendedListPage onBack={() => setView('home')} />
  }
  if (view === 'about') {
    return <AboutPage onBack={() => setView('home')} />
  }
  if (view === 'stats') {
    return <StatsPage onBack={() => setView('home')} />
  }
  return (
    <HomePage
      onStartReview={() => setView('review')}
      onBrowseVocab={() => setView('vocab')}
      onBrowseGrammar={() => setView('grammar')}
      onOpenSuspended={() => setView('suspended')}
      onOpenAbout={() => setView('about')}
      onOpenStats={() => setView('stats')}
      theme={theme}
      onThemeChange={handleThemeChange}
    />
  )
}

export default App
