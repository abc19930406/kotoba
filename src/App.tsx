import { useState } from 'react'
import { HomePage } from './features/review/HomePage.tsx'
import { ReviewSession } from './features/review/ReviewSession.tsx'
import { VocabBrowsePage } from './features/vocab/VocabBrowsePage.tsx'

type View = 'home' | 'review' | 'vocab'

function App() {
  const [view, setView] = useState<View>('home')

  if (view === 'review') {
    return <ReviewSession onComplete={() => setView('home')} />
  }
  if (view === 'vocab') {
    return <VocabBrowsePage onBack={() => setView('home')} />
  }
  return <HomePage onStartReview={() => setView('review')} onBrowseVocab={() => setView('vocab')} />
}

export default App
