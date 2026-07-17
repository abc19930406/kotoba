import { useState } from 'react'
import { HomePage } from './features/review/HomePage.tsx'
import { ReviewSession } from './features/review/ReviewSession.tsx'

type View = 'home' | 'review'

function App() {
  const [view, setView] = useState<View>('home')

  if (view === 'review') {
    return <ReviewSession onComplete={() => setView('home')} />
  }
  return <HomePage onStartReview={() => setView('review')} />
}

export default App
