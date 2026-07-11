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
import type { Progression, SessionExercise, SetLog, WorkoutSession } from '../types'
import { TopBar, Sheet, Confirm } from '../components/ui'
import { formatDuration } from '../lib/format'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDown,
  NoteIcon,
  PlusIcon,
  TrashIcon,
  TrendDown,
  TrendFlat,
  TrendUp,
} from '../components/icons'

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
  // Welche Übungen sind aufgeklappt (Default: eingeklappt).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggleExpand = (exId: string) =>
    setExpanded((o) => ({ ...o, [exId]: !o[exId] }))

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

  function setExerciseField(exId: string, patch: Partial<SessionExercise>) {
    mutateExercise(exId, (ex) => ({ ...ex, ...patch }))
  }

  function removeExercise(exId: string) {
    if (!session) return
    persist({ ...session, exercises: session.exercises.filter((e) => e.id !== exId) })
  }

  // Übung im Ablauf nach oben/unten schieben (z.B. Gerät besetzt).
  function moveExercise(exId: string, dir: -1 | 1) {
    if (!session) return
    const list = session.exercises
    const i = list.findIndex((e) => e.id === exId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const next = list.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    persist({ ...session, exercises: next })
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

        {session.exercises.map((ex, i) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            open={!!expanded[ex.id]}
            onToggleOpen={() => toggleExpand(ex.id)}
            isFirst={i === 0}
            isLast={i === session.exercises.length - 1}
            onMoveUp={() => moveExercise(ex.id, -1)}
            onMoveDown={() => moveExercise(ex.id, 1)}
            onToggle={(s) => toggleDone(ex.id, s)}
            onSet={(sid, patch) => setSet(ex.id, sid, patch)}
            onAddSet={() => addSet(ex.id)}
            onRemoveSet={(sid) => removeSet(ex.id, sid)}
            onRemoveExercise={() => removeExercise(ex.id)}
            onProgression={(p) => setExerciseField(ex.id, { progression: p })}
            onNextNote={(t) => setExerciseField(ex.id, { nextNote: t })}
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

const PROGRESSIONS: { key: Progression; label: string; Icon: typeof TrendUp; color: string }[] = [
  { key: 'up', label: 'steigern', Icon: TrendUp, color: 'text-success' },
  { key: 'same', label: 'halten', Icon: TrendFlat, color: 'text-muted' },
  { key: 'down', label: 'reduzieren', Icon: TrendDown, color: 'text-brand' },
]

// Kompakter Hinweis vom letzten Mal (Pfeil + Notiz).
function HintBanner({ ex }: { ex: SessionExercise }) {
  if (!ex.hintProgression && !ex.hintNote) return null
  const p = PROGRESSIONS.find((x) => x.key === ex.hintProgression)
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-muted">
      <span className="shrink-0 font-semibold uppercase tracking-wide">Letztes Mal</span>
      {p ? (
        <span className={'inline-flex items-center gap-0.5 font-semibold ' + p.color}>
          <p.Icon className="h-3.5 w-3.5" /> {p.label}
        </span>
      ) : null}
      {ex.hintNote ? <span className="truncate italic">„{ex.hintNote}"</span> : null}
    </div>
  )
}

function ExerciseCard({
  ex,
  open,
  onToggleOpen,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onToggle,
  onSet,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
  onProgression,
  onNextNote,
}: {
  ex: SessionExercise
  open: boolean
  onToggleOpen: () => void
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onToggle: (s: SetLog) => void
  onSet: (setId: string, patch: Partial<SetLog>) => void
  onAddSet: () => void
  onRemoveSet: (setId: string) => void
  onRemoveExercise: () => void
  onProgression: (p: Progression) => void
  onNextNote: (t: string) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  // Welche Satz-Notizfelder sind aufgeklappt
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({})
  const toggleNote = (id: string) =>
    setOpenNotes((o) => ({ ...o, [id]: !o[id] }))

  const doneCount = ex.sets.filter((s) => s.done).length
  const complete = ex.sets.length > 0 && doneCount === ex.sets.length

  return (
    <section className={'card p-3 ' + (complete ? 'border-success/40' : '')}>
      {/* Kopf: antippen zum Auf-/Zuklappen */}
      <div className="flex items-center gap-1">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
          onClick={onToggleOpen}
          aria-expanded={open}
        >
          <ChevronDown
            className={
              'h-5 w-5 shrink-0 text-muted transition-transform ' +
              (open ? '' : '-rotate-90')
            }
          />
          {complete ? (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-bg">
              <CheckIcon className="h-4 w-4" />
            </span>
          ) : null}
          <h3
            className={
              'min-w-0 flex-1 truncate text-base font-bold ' +
              (complete ? 'text-success' : '')
            }
          >
            {ex.name}
          </h3>
          <span
            className={
              'shrink-0 text-xs tabular-nums ' + (complete ? 'text-success' : 'text-muted')
            }
          >
            {doneCount}/{ex.sets.length}
          </span>
        </button>
        <button
          className="p-1.5 text-muted active:text-brand disabled:opacity-25"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label="Übung nach oben"
        >
          <ArrowUpIcon className="h-5 w-5" />
        </button>
        <button
          className="p-1.5 text-muted active:text-brand disabled:opacity-25"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label="Übung nach unten"
        >
          <ArrowDownIcon className="h-5 w-5" />
        </button>
      </div>

      {open ? (
        <div className="mt-3">
      <HintBanner ex={ex} />

      <div className="mb-1 grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-muted">
        <span className="text-center">#</span>
        <span className="text-center">kg</span>
        <span className="text-center">Wdh.</span>
        <span />
      </div>

      <ul className="space-y-2">
        {ex.sets.map((s, i) => {
          const hasRef = s.prevWeight != null || s.prevReps != null
          const noteOpen = openNotes[s.id] || !!s.note
          return (
            <li
              key={s.id}
              className={'rounded-xl p-1 ' + (s.done ? 'bg-success/10' : '')}
            >
              <div className="grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2">
                <span className="text-center text-sm font-semibold text-muted">
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
                    'flex h-11 items-center justify-center rounded-lg transition-colors ' +
                    (s.done
                      ? 'bg-success text-bg'
                      : 'bg-white/5 text-muted active:bg-white/10')
                  }
                  onClick={() => onToggle(s)}
                  aria-label={s.done ? 'Satz erledigt' : 'Satz abhaken'}
                >
                  <CheckIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Referenz vom letzten Mal + optionaler Kommentar */}
              <div className="mt-1 flex min-h-[1.25rem] items-center gap-2 pl-9 pr-1 text-xs">
                <span className="flex-1 text-muted">
                  {hasRef
                    ? `zuletzt: ${s.prevWeight != null ? s.prevWeight + ' kg' : '–'} × ${s.prevReps ?? '–'}`
                    : ''}
                </span>
                <button
                  className={
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 ' +
                    (noteOpen ? 'text-ink' : 'text-muted active:text-ink')
                  }
                  onClick={() => toggleNote(s.id)}
                >
                  <NoteIcon className="h-3.5 w-3.5" />
                  {s.note ? '' : 'Notiz'}
                </button>
              </div>
              {noteOpen ? (
                <input
                  className="input mt-1 py-2 text-sm"
                  placeholder="Kommentar (optional), z. B. Hammer / Curl"
                  value={s.note ?? ''}
                  onChange={(e) => onSet(s.id, { note: e.target.value || undefined })}
                />
              ) : null}
            </li>
          )
        })}
      </ul>

      <div className="mt-2 flex gap-2">
        <button className="btn-ghost btn-sm flex-1" onClick={onAddSet}>
          <PlusIcon className="h-4 w-4" /> Satz
        </button>
        {ex.sets.length > 1 ? (
          <button
            className="btn-ghost btn-sm text-muted"
            onClick={() => onRemoveSet(ex.sets[ex.sets.length - 1].id)}
          >
            Satz entfernen
          </button>
        ) : null}
      </div>

      {/* Fürs nächste Mal merken: Pfeil + Notiz */}
      <div className="mt-3 border-t border-line pt-3">
        <p className="label mb-2">Fürs nächste Mal</p>
        <div className="flex gap-2">
          {PROGRESSIONS.map((p) => {
            const active = ex.progression === p.key
            return (
              <button
                key={p.key}
                className={
                  'flex flex-1 flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ' +
                  (active
                    ? 'border-current ' + p.color + ' bg-white/5'
                    : 'border-line text-muted active:bg-white/10')
                }
                onClick={() => onProgression(p.key)}
                aria-pressed={active}
              >
                <p.Icon className="h-5 w-5" />
                {p.label}
              </button>
            )
          })}
        </div>
        <input
          className="input mt-2 py-2 text-sm"
          placeholder="Notiz fürs nächste Mal (optional)"
          value={ex.nextNote ?? ''}
          onChange={(e) => onNextNote(e.target.value)}
        />
      </div>

      <button
        className="btn-ghost btn-sm mt-3 w-full text-muted"
        onClick={() => setConfirmDel(true)}
      >
        <TrashIcon className="h-4 w-4" /> Übung entfernen
      </button>
        </div>
      ) : null}

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
