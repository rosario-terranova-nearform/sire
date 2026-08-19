import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installModelErrorSink } from '@/lib/error-sink'
import { installOnlineRecovery } from '@/ai/demo-mode'

// §7.1 — a model failure the AI layer already handled must not reach the user
// as a stack trace. Installed before the first render, so nothing slips past.
installModelErrorSink()

// T-25 — lift an offline recording the moment the connection returns.
installOnlineRecovery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
