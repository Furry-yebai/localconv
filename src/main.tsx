import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import * as ffmpegEngine from './engines/ffmpegEngine'

// Test hook: lets Playwright bootstrap video fixtures through the wasm engine.
// Gated behind ?e2e=1 — no effect for normal visitors.
declare global {
  interface Window {
    __e2e?: typeof ffmpegEngine
  }
}

if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e')) {
  window.__e2e = ffmpegEngine
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
