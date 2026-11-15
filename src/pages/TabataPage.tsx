import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, saveSettings } from '../db'
import { TopBar } from '../components/ui'
import { formatDuration } from '../lib/format'
import { PlayIcon } from '../components/icons'

const DEFAULT_WORK = 20
const DEFAULT_REST = 10
const DEFAULT_ROUNDS = 8
const PREPARE_SECONDS = 5

type Phase = 'idle' | 'prepare' | 'work' | 'rest' | 'done'
interface RunState {
  phase: Phase
  round: number
  endsAt: number | null
}

// Vibrationsmuster beim Phasenwechsel - "vibrate" existiert auf iOS Safari/PWA
// nicht (Feature-Detection via "in navigator"), dann bewusst stiller Verzicht
// statt Fehlermeldung.
function vibrate(pattern: number | number[]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

export default function TabataPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const workSeconds = settings?.tabataWorkSeconds ?? DEFAULT_WORK
  const restSeconds = settings?.tabataRestSeconds ?? DEFAULT_REST
  const rounds = settings?.tabataRounds ?? DEFAULT_ROUNDS

  const [run, setRun] = useState<RunState>({ phase: 'idle', round: 1, endsAt: null })
  const [left, setLeft] = useState(0)
  // Config waehrend eines laufenden Durchgangs einfrieren - eine Aenderung
  // mitten im Lauf soll die laufende Runde nicht verwirren.
  const cfg = useRef({ workSeconds, restSeconds, rounds })

  function nextState(s: RunState): RunState {
    const { workSeconds: w, restSeconds: r, rounds: n } = cfg.current
    if (s.phase === 'prepare') return { phase: 'work', round: 1, endsAt: Date.now() + w * 1000 }
    if (s.phase === 'work') {
      if (s.round >= n) return { phase: 'done', round: s.round, endsAt: null }
      return { phase: 'rest', round: s.round, endsAt: Date.now() + r * 1000 }
    }
    if (s.phase === 'rest') {
      return { phase: 'work', round: s.round + 1, endsAt: Date.now() + w * 1000 }
    }
    return s
  }

  // Absolute Zielzeit statt herunterzuzaehlen - ueberlebt Backgrounding
  // korrekt (gleiches Muster wie der Rest-Timer in ActiveWorkoutPage.tsx).
  useEffect(() => {
    if (!run.endsAt || run.phase === 'idle' || run.phase === 'done') return
    const tick = () => {
      const remaining = Math.max(0, Math.round((run.endsAt! - Date.now()) / 1000))
      setLeft(remaining)
      if (remaining <= 0) setRun((s) => nextState(s))
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.endsAt, run.phase])

  // Vibration getrennt von der State-Transition als eigener Effekt (reagiert
  // auf den Phasenwechsel, statt Seiteneffekte im State-Updater zu verstecken).
  const prevPhase = useRef<Phase>('idle')
  useEffect(() => {
    if (run.phase !== prevPhase.current) {
      if (run.phase === 'work' || run.phase === 'rest') vibrate(200)
      else if (run.phase === 'done') vibrate([200, 100, 200, 100, 200])
      prevPhase.current = run.phase
    }
  }, [run.phase])

  function start() {
    cfg.current = { workSeconds, restSeconds, rounds }
    setRun({ phase: 'prepare', round: 1, endsAt: Date.now() + PREPARE_SECONDS * 1000 })
  }

  function stop() {
    setRun({ phase: 'idle', round: 1, endsAt: null })
    setLeft(0)
  }

  const running = run.phase !== 'idle' && run.phase !== 'done'
  const bg =
    run.phase === 'work'
      ? 'bg-brand/15'
      : run.phase === 'rest'
        ? 'bg-success/15'
        : run.phase === 'done'
          ? 'bg-success/10'
          : ''
  const phaseLabel =
    run.phase === 'prepare'
      ? 'Vorbereitung'
      : run.phase === 'work'
        ? 'Belastung'
        : run.phase === 'rest'
          ? 'Pause'
          : run.phase === 'done'
            ? 'Fertig!'
            : ''

  return (
    <div>
      <TopBar title="Tabata" />

      <div
        className={
          'flex min-h-[60vh] flex-col items-center justify-center gap-6 p-4 transition-colors ' + bg
        }
      >
        {running || run.phase === 'done' ? (
          <>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">
              {phaseLabel}
              {run.phase === 'work' || run.phase === 'rest' ? ` · Runde ${run.round}/${rounds}` : ''}
            </p>
            <p className="font-mono text-7xl font-bold tabular-nums">
              {run.phase === 'done' ? '🎉' : formatDuration(left)}
            </p>
            <div className="mt-4 flex gap-3">
              <button className="btn-ghost" onClick={stop}>
                {run.phase === 'done' ? 'Zurück' : 'Abbrechen'}
              </button>
              {run.phase !== 'done' ? (
                <button className="btn-primary" onClick={start}>
                  Neu starten
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="card w-full max-w-xs space-y-3">
              <div>
                <label className="label">Belastung (Sek.)</label>
                <input
                  className="input text-center"
                  type="number"
                  inputMode="numeric"
                  value={workSeconds}
                  onChange={(e) =>
                    saveSettings({ tabataWorkSeconds: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                />
              </div>
              <div>
                <label className="label">Pause (Sek.)</label>
                <input
                  className="input text-center"
                  type="number"
                  inputMode="numeric"
                  value={restSeconds}
                  onChange={(e) =>
                    saveSettings({ tabataRestSeconds: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                />
              </div>
              <div>
                <label className="label">Runden</label>
                <input
                  className="input text-center"
                  type="number"
                  inputMode="numeric"
                  value={rounds}
                  onChange={(e) =>
                    saveSettings({ tabataRounds: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                />
              </div>
            </div>
            <button className="btn-primary w-full max-w-xs py-4 text-lg" onClick={start}>
              <PlayIcon className="h-5 w-5" /> Start
            </button>
            {!('vibrate' in navigator) ? (
              <p className="max-w-xs text-center text-xs text-neutral-600">
                Hinweis: Vibration beim Phasenwechsel wird auf diesem Gerät/Browser
                nicht unterstützt (z. B. iOS) – der Timer funktioniert trotzdem rein
                visuell.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
