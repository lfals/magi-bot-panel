import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { captureTokenFromUrl } from './auth/token'
import './index.css'
import App from './App.tsx'

captureTokenFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
