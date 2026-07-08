import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  db,
  discardSession,
  finishSession,
  getActiveSession,
  newSet,
  uid,
  upsertExerciseByName,
} from '../db'
import type { SessionExercise, SetLog, WorkoutSession } from '../types'
import { TopBar, Sheet, Confirm } from '../components/ui'
import { formatDuration } from '../lib/format'
import { CheckIcon, PlusIcon, TrashIcon } from '../components/icons'

// Live-Timer aus Startzeitstempel (Backgrounding-sicher).
function useElapsed(startTime: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    const onVis = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  if (!startTime) return 0
  return Math.max(0, Math.round((now - startTime) / 1000))
}

export default function ActiveWorkoutPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [loading, setLoading] = useState(true)
  const elapsed = useElapsed(session?.startTime)

  const [confirmFinish, setConfirmFinish] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [addExOpen, setAddExOpen] = useState(false)
  const [newExName, setNewExName] = useState('')

  // Rest-Timer (SOLL, optional)
  const [rest, setRest] = useState<{ endsAt: number } | null>(null)
  const [restLeft, setRestLeft] = useState(0)
  const restDur = useRef(90)

  useEffect(() => {
    let cancelled = false
    getActiveSession().then((s) => {
      if (cancelled) return
      if (!s) {
        navigate('/start', { replace: true })
      } else {
        setSession(s)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  useEffect(() => {
    if (!rest) return
    const tick = () => {
      const left = Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000))
      setRestLeft(left)
      if (left <= 0) setRest(null)
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [rest])

  // Persistiert Aenderungen sofort in IndexedDB.
  const persist = useCallback((next: WorkoutSession) => {
    setSession(next)
    void db.sessions.put(next)
  }, [])

  function mutateExercise(exId: string, fn: (ex: SessionExercise) => SessionExercise) {
    if (!session) return
    persist({
      ...session,
      exercises: session.exercises.map((e) => (e.id === exId ? fn(e) : e)),
    })
  }

  function setSet(exId: string, setId: string, patch: Partial<SetLog>) {
    mutateExercise(exId, (ex) => ({
      ...ex,
      sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
    }))
  }

  function toggleDone(exId: string, s: SetLog) {
    const willBeDone = !s.done
    setSet(exId, s.id, { done: willBeDone })
    if (willBeDone) startRest()
  }

  function startRest() {
    setRest({ endsAt: Date.now() + restDur.current * 1000 })
  }

  function addSet(exId: string) {
    mutateExercise(exId, (ex) => {
      // Neuen Satz mit Werten des letzten Satzes vorbelegen.
      const last = ex.sets[ex.sets.length - 1]
      const s = newSet()
      if (last) {
        s.weight = last.weight
        s.reps = last.reps
      }
      return { ...ex, sets: [...ex.sets, s] }
    })
  }

  function removeSet(exId: string, setId: string) {
    mutateExercise(exId, (ex) => ({
      ...ex,
      sets: ex.sets.filter((s) => s.id !== setId),
    }))
  }

  function removeExercise(exId: string) {
    if (!session) return
    persist({ ...session, exercises: session.exercises.filter((e) => e.id !== exId) })
  }

  async function addExercise() {
    if (!session) return
    const name = newExName.trim()
    if (!name) return
    const exerciseId = await upsertExerciseByName(name)
    const ex: SessionExercise = {
      id: uid(),
      exerciseId,
      name,
      sets: [newSet()],
    }
    persist({ ...session, exercises: [...session.exercises, ex] })
    setNewExName('')
    setAddExOpen(false)
  }

  async function doFinish() {
    if (!session) return
    await finishSession(session.id)
    navigate(`/summary/${session.id}`, { replace: true })
  }

  async function doDiscard() {
    if (!session) return
    await discardSession(session.id)
    navigate('/start', { replace: true })
  }

  if (loading || !session) {
    return (
      <div>
        <TopBar title="Training" back={() => navigate('/start')} />
      </div>
    )
  }

  const doneSets = session.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => s.done).length,
    0,
  )
  const totalSets = session.exercises.reduce((n, e) => n + e.sets.length, 0)

  return (
    <div className="pb-28">
      <TopBar
        title={session.dayName ?? 'Freies Training'}
        back={() => navigate('/start')}
        right={
          <div className="flex items-center gap-1 rounded-full bg-surface2 px-3 py-1.5 font-mono text-sm tabular-nums">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
            {formatDuration(elapsed)}
          </div>
        }
      />

      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between text-sm text-neutral-400">
          <span>
            {session.location || 'Ohne Ort'} · {session.equipmentManufacturer}
          </span>
          <span className="tabular-nums">
            {doneSets}/{totalSets} Sätze
          </span>
        </div>

        {session.exercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            onToggle={(s) => toggleDone(ex.id, s)}
            onSet={(sid, patch) => setSet(ex.id, sid, patch)}
            onAddSet={() => addSet(ex.id)}
            onRemoveSet={(sid) => removeSet(ex.id, sid)}
            onRemoveExercise={() => removeExercise(ex.id)}
          />
        ))}

        <button className="btn-ghost w-full" onClick={() => setAddExOpen(true)}>
          <PlusIcon className="h-5 w-5" /> Übung ergänzen
        </button>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button className="btn-ghost" onClick={() => setConfirmDiscard(true)}>
            Verwerfen
          </button>
          <button className="btn-primary" onClick={() => setConfirmFinish(true)}>
            Beenden
          </button>
        </div>
      </div>

      {/* Rest-Timer */}
      {rest ? (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
          <div className="card flex w-full max-w-md items-center gap-3 border-brand/50 shadow-lg">
            <div className="font-mono text-2xl font-bold tabular-nums text-brand">
              {formatDuration(restLeft)}
            </div>
            <span className="flex-1 text-sm text-neutral-400">Pause</span>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setRest({ endsAt: Date.now() + restLeft * 1000 + 30000 })}
            >
              +30s
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setRest(null)}>
              Stop
            </button>
          </div>
        </div>
      ) : null}

      {/* Übung ergänzen */}
      <Sheet open={addExOpen} onClose={() => setAddExOpen(false)} title="Übung ergänzen">
        <input
          className="input"
          autoFocus
          placeholder="Name der Übung"
          value={newExName}
          onChange={(e) => setNewExName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addExercise()}
        />
        <button className="btn-primary mt-4 w-full" onClick={addExercise}>
          Hinzufügen
        </button>
      </Sheet>

      <Confirm
        open={confirmFinish}
        title="Training beenden?"
        message="Die Zusammenfassung wird erstellt. Nicht abgehakte Sätze werden nicht gezählt."
        confirmLabel="Beenden"
        danger={false}
        onConfirm={doFinish}
        onCancel={() => setConfirmFinish(false)}
      />
      <Confirm
        open={confirmDiscard}
        title="Training verwerfen?"
        message="Das laufende Training wird gelöscht und nicht gespeichert."
        confirmLabel="Verwerfen"
        onConfirm={doDiscard}
        onCancel={() => setConfirmDiscard(false)}
      />

    </div>
  )
}

function ExerciseCard({
  ex,
  onToggle,
  onSet,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
}: {
  ex: SessionExercise
  onToggle: (s: SetLog) => void
  onSet: (setId: string, patch: Partial<SetLog>) => void
  onAddSet: () => void
  onRemoveSet: (setId: string) => void
  onRemoveExercise: () => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <section className="card p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 truncate text-base font-bold">{ex.name}</h3>
        <button
          className="p-1 text-neutral-600 active:text-red-400"
          onClick={() => setConfirmDel(true)}
          aria-label="Übung entfernen"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 px-1 text-xs text-neutral-500">
        <span className="text-center">#</span>
        <span className="text-center">kg</span>
        <span className="text-center">Wdh.</span>
        <span />
      </div>

      <ul className="space-y-2">
        {ex.sets.map((s, i) => (
          <li
            key={s.id}
            className={
              'grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 rounded-xl p-1 ' +
              (s.done ? 'bg-brand/10' : '')
            }
          >
            <span className="text-center text-sm font-semibold text-neutral-500">
              {i + 1}
            </span>
            <input
              className="input px-2 py-2.5 text-center text-lg"
              type="number"
              inputMode="decimal"
              placeholder="–"
              value={s.weight ?? ''}
              onChange={(e) =>
                onSet(s.id, {
                  weight: e.target.value === '' ? null : parseFloat(e.target.value.replace(',', '.')),
                })
              }
            />
            <input
              className="input px-2 py-2.5 text-center text-lg"
              type="number"
              inputMode="numeric"
              placeholder="–"
              value={s.reps ?? ''}
              onChange={(e) =>
                onSet(s.id, {
                  reps: e.target.value === '' ? null : parseInt(e.target.value, 10),
                })
              }
            />
            <button
              className={
                'flex h-11 items-center justify-center rounded-xl transition-colors ' +
                (s.done
                  ? 'bg-brand text-white'
                  : 'bg-surface2 text-neutral-500 active:bg-line')
              }
              onClick={() => onToggle(s)}
              aria-label={s.done ? 'Satz erledigt' : 'Satz abhaken'}
            >
              <CheckIcon className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex gap-2">
        <button className="btn-ghost btn-sm flex-1" onClick={onAddSet}>
          <PlusIcon className="h-4 w-4" /> Satz
        </button>
        {ex.sets.length > 1 ? (
          <button
            className="btn-ghost btn-sm text-neutral-400"
            onClick={() => onRemoveSet(ex.sets[ex.sets.length - 1].id)}
          >
            Satz entfernen
          </button>
        ) : null}
      </div>

      <Confirm
        open={confirmDel}
        title="Übung entfernen?"
        message={`"${ex.name}" aus diesem Training entfernen (Plan bleibt unverändert).`}
        confirmLabel="Entfernen"
        onConfirm={() => {
          setConfirmDel(false)
          onRemoveExercise()
        }}
        onCancel={() => setConfirmDel(false)}
      />
    </section>
  )
}
