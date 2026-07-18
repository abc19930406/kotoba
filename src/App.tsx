import { useState } from 'react'
import { HomePage } from './features/review/HomePage.tsx'
import { ReviewSession } from './features/review/ReviewSession.tsx'
import { SuspendedListPage } from './features/review/SuspendedListPage.tsx'
import { VocabBrowsePage } from './features/vocab/VocabBrowsePage.tsx'

type View = 'home' | 'review' | 'vocab' | 'suspended'

function App() {
  const [view, setView] = useState<View>('home')

  if (view === 'review') {
    return <ReviewSession onComplete={() => setView('home')} />
  }
  if (view === 'vocab') {
    return <VocabBrowsePage onBack={() => setView('home')} />
  }
  if (view === 'suspended') {
    return <SuspendedListPage onBack={() => setView('home')} />
  }
  return (
    <HomePage
      onStartReview={() => setView('review')}
      onBrowseVocab={() => setView('vocab')}
      onOpenSuspended={() => setView('suspended')}
    />
  )
}

export default App
