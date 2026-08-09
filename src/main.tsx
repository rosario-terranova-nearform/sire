import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installModelErrorSink } from '@/lib/error-sink'

// §7.1 — a model failure the AI layer already handled must not reach the user
// as a stack trace. Installed before the first render, so nothing slips past.
installModelErrorSink()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
