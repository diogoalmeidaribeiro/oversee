import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles.css' // real app styles — the hero mock reuses them
import './landing.css' // landing overrides + sections (loaded after, wins)
import { Landing } from './Landing.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
)
