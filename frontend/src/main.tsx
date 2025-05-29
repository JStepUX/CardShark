import { StrictMode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import './styles/performance.css'
import AppRoutes from './components/AppRoutes'
import { PerformanceProvider } from './contexts/PerformanceContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PerformanceProvider>
        <AppRoutes />
      </PerformanceProvider>
    </BrowserRouter>
  </StrictMode>,
)
