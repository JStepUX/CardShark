import { StrictMode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import AppRoutes from './components/AppRoutes'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
)
