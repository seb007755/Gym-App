import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getActiveSession } from './db'
import { ClockIcon, CogIcon, DumbbellIcon, PlayIcon } from './components/icons'
import PlansPage from './pages/PlansPage'
import PlanDayEditPage from './pages/PlanDayEditPage'
import StartPage from './pages/StartPage'
import ActiveWorkoutPage from './pages/ActiveWorkoutPage'
import SummaryPage from './pages/SummaryPage'
import HistoryPage from './pages/HistoryPage'
import HistoryDetailPage from './pages/HistoryDetailPage'
import SettingsPage from './pages/SettingsPage'
import { ReloadPrompt } from './components/ReloadPrompt'

function BottomNav() {
  const active = useLiveQuery(() => getActiveSession(), [])
  const items = [
    { to: '/', label: 'Pläne', icon: DumbbellIcon, end: true },
    { to: '/start', label: 'Training', icon: PlayIcon },
    { to: '/history', label: 'Verlauf', icon: ClockIcon },
    { to: '/settings', label: 'Mehr', icon: CogIcon },
  ]
  return (
    <nav className="pb-safe sticky bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {items.map((it) => {
          const Icon = it.icon
          const showDot = it.to === '/start' && active
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                'relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ' +
                (isActive ? 'text-brand' : 'text-neutral-500')
              }
            >
              <Icon className="h-6 w-6" />
              {it.label}
              {showDot ? (
                <span className="absolute right-[22%] top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-bg" />
              ) : null}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

export default function App() {
  const location = useLocation()
  // Vollbild-Screens ohne Bottom-Nav (aktives Training, Zusammenfassung).
  const fullscreen =
    location.pathname.startsWith('/workout') ||
    location.pathname.startsWith('/summary')

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<PlansPage />} />
          <Route path="/plan/:planId/day/:dayId" element={<PlanDayEditPage />} />
          <Route path="/start" element={<StartPage />} />
          <Route path="/workout" element={<ActiveWorkoutPage />} />
          <Route path="/summary/:sessionId" element={<SummaryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:sessionId" element={<HistoryDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      {!fullscreen && <BottomNav />}
      <ReloadPrompt />
    </div>
  )
}
