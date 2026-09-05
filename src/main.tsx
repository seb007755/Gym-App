import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { runMigrations } from './db'
import './index.css'

// basename aus Vite-BASE_URL (z.B. "/Gym-App/") -> saubere URLs ohne #.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

// Ausserhalb der Render-Phase: Schreibzugriffe im liveQuery-Kontext wuerden
// in Dexie einen ReadOnlyError werfen.
void runMigrations()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
