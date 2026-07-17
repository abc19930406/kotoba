import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the placeholder home page', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'kotoba' })).toBeInTheDocument()
  })
})
