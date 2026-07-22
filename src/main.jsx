import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// A file dropped anywhere but a terminal would otherwise make Electron navigate to
// file://… and wipe the UI. Swallow stray drags globally; the terminal's own drop
// handler stops propagation first, so path-insertion still works there.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('root')).render(<App />)
