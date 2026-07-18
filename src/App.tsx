import { useState } from 'react'
import { HomePage } from './features/review/HomePage.tsx'
import { ReviewSession } from './features/review/ReviewSession.tsx'
import { SuspendedListPage } from './features/review/SuspendedListPage.tsx'
import { VocabBrowsePage } from './features/vocab/VocabBrowsePage.tsx'
import { GrammarBrowsePage } from './features/grammar/GrammarBrowsePage.tsx'
import { AboutPage } from './features/about/AboutPage.tsx'

type View = 'home' | 'review' | 'vocab' | 'grammar' | 'suspended' | 'about'

function App() {
  const [view, setView] = useState<View>('home')

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
  return (
    <HomePage
      onStartReview={() => setView('review')}
      onBrowseVocab={() => setView('vocab')}
      onBrowseGrammar={() => setView('grammar')}
      onOpenSuspended={() => setView('suspended')}
      onOpenAbout={() => setView('about')}
    />
  )
}

export default App
