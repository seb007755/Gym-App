import { useMemo } from 'react'
import { QUOTES } from '../lib/quotes'
import { PlanStartForm } from './PlanStartForm'
import { DumbbellIcon } from './icons'

// Startbildschirm: ueber keine Route/Nav erreichbar, erscheint stattdessen bei
// jedem App-Start automatisch anstelle der normalen Ansicht (siehe App.tsx).
// Reine Komponenten-State-Steuerung dort, bewusst kein localStorage-Flag -
// garantiert "jedes Mal ein neues Zitat" ohne Zusatzlogik.
export function SplashScreen({ onDismiss }: { onDismiss: () => void }) {
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], [])

  return (
    <div
      className="pt-safe pb-safe flex h-full flex-col overflow-y-auto bg-bg px-6"
      onClick={onDismiss}
    >
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <DumbbellIcon className="mb-6 h-10 w-10 text-brand" />
        <p className="text-xl font-semibold leading-snug text-ink">„{quote.text}"</p>
        <p className="mt-3 text-sm text-muted">— {quote.author}</p>
        <p className="mt-8 text-xs text-neutral-600">Tippen zum Fortfahren</p>
      </div>

      <div className="pb-6" onClick={(e) => e.stopPropagation()}>
        <PlanStartForm onStarted={onDismiss} />
      </div>
    </div>
  )
}
