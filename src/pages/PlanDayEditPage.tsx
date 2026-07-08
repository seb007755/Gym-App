import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, upsertExerciseByName } from '../db'
import type { Plan, PlanExercise } from '../types'
import { TopBar, Sheet, Confirm, EmptyState } from '../components/ui'
import { PlusIcon, TrashIcon, DumbbellIcon } from '../components/icons'

export default function PlanDayEditPage() {
  const { planId, dayId } = useParams()
  const navigate = useNavigate()
  const plan = useLiveQuery(() => db.plans.get(planId!), [planId])
  const allExercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])
  const day = plan?.days.find((d) => d.id === dayId)

  const [editing, setEditing] = useState<PlanExercise | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [confirmDel, setConfirmDel] = useState<PlanExercise | null>(null)

  // Form-Felder
  const [name, setName] = useState('')
  const [sets, setSets] = useState('3')
  const [reps, setReps] = useState('10')
  const [weight, setWeight] = useState('')
  const [note, setNote] = useState('')

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase()
    if (!q) return []
    return (allExercises ?? [])
      .filter((e) => e.name.toLowerCase().includes(q) && e.name.toLowerCase() !== q)
      .slice(0, 5)
  }, [name, allExercises])

  if (!plan || !day) {
    return (
      <div>
        <TopBar title="Trainingstag" back />
        <EmptyState title="Trainingstag nicht gefunden" />
      </div>
    )
  }

  function openNew() {
    setIsNew(true)
    setEditing({ id: uid(), name: '', targetSets: 3, targetReps: 10 })
    setName('')
    setSets('3')
    setReps('10')
    setWeight('')
    setNote('')
  }

  function openEdit(ex: PlanExercise) {
    setIsNew(false)
    setEditing(ex)
    setName(ex.name)
    setSets(String(ex.targetSets))
    setReps(String(ex.targetReps))
    setWeight(ex.targetWeight != null ? String(ex.targetWeight) : '')
    setNote(ex.note ?? '')
  }

  async function save() {
    if (!editing || !plan || !day) return
    const cleanName = name.trim()
    if (!cleanName) return
    const exerciseId = await upsertExerciseByName(cleanName)
    const updated: PlanExercise = {
      id: editing.id,
      exerciseId,
      name: cleanName,
      targetSets: Math.max(1, parseInt(sets, 10) || 1),
      targetReps: Math.max(1, parseInt(reps, 10) || 1),
      targetWeight: weight.trim() ? parseFloat(weight.replace(',', '.')) : undefined,
      note: note.trim() || undefined,
    }
    const exercises = isNew
      ? [...day.exercises, updated]
      : day.exercises.map((e) => (e.id === updated.id ? updated : e))
    await persist(plan, day.id, exercises)
    setEditing(null)
  }

  async function persist(p: Plan, dId: string, exercises: PlanExercise[]) {
    await db.plans.put({
      ...p,
      days: p.days.map((d) => (d.id === dId ? { ...d, exercises } : d)),
    })
  }

  async function remove(ex: PlanExercise) {
    await persist(plan!, day!.id, day!.exercises.filter((e) => e.id !== ex.id))
    setConfirmDel(null)
  }

  async function move(index: number, dir: -1 | 1) {
    const arr = [...day!.exercises]
    const j = index + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[index], arr[j]] = [arr[j], arr[index]]
    await persist(plan!, day!.id, arr)
  }

  return (
    <div>
      <TopBar
        title={day.name}
        back
        right={
          <button
            className="btn-ghost h-10 w-10 rounded-full p-0"
            onClick={openNew}
            aria-label="Übung hinzufügen"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        }
      />

      <div className="space-y-3 p-4">
        <p className="text-sm text-neutral-500">
          Plan: <span className="text-neutral-300">{plan.name}</span>
        </p>

        {day.exercises.length === 0 ? (
          <EmptyState
            icon={<DumbbellIcon className="h-12 w-12" />}
            title="Keine Übungen"
            hint="Füge Übungen mit Ziel-Sätzen und -Wiederholungen hinzu."
            action={
              <button className="btn-primary" onClick={openNew}>
                <PlusIcon className="h-5 w-5" /> Übung hinzufügen
              </button>
            }
          />
        ) : null}

        <ul className="space-y-2">
          {day.exercises.map((ex, i) => (
            <li key={ex.id} className="card p-3">
              <div className="flex items-start gap-2">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => openEdit(ex)}
                >
                  <p className="truncate font-semibold">{ex.name}</p>
                  <p className="text-sm text-neutral-400">
                    {ex.targetSets} × {ex.targetReps}
                    {ex.targetWeight != null ? ` · ${ex.targetWeight} kg` : ''}
                  </p>
                  {ex.note ? (
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      {ex.note}
                    </p>
                  ) : null}
                </button>
                <div className="flex flex-col">
                  <button
                    className="p-1 text-neutral-500 active:text-neutral-200 disabled:opacity-25"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Nach oben"
                  >
                    ▲
                  </button>
                  <button
                    className="p-1 text-neutral-500 active:text-neutral-200 disabled:opacity-25"
                    onClick={() => move(i, 1)}
                    disabled={i === day.exercises.length - 1}
                    aria-label="Nach unten"
                  >
                    ▼
                  </button>
                </div>
                <button
                  className="p-1 text-neutral-500 active:text-red-400"
                  onClick={() => setConfirmDel(ex)}
                  aria-label="Löschen"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {day.exercises.length > 0 ? (
          <button className="btn-ghost w-full" onClick={openNew}>
            <PlusIcon className="h-5 w-5" /> Übung hinzufügen
          </button>
        ) : null}

        <button
          className="btn-primary mt-2 w-full"
          onClick={() => navigate('/start')}
        >
          Training aus diesem Tag starten
        </button>
      </div>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? 'Übung hinzufügen' : 'Übung bearbeiten'}
      >
        <label className="label">Übung</label>
        <input
          className="input"
          autoFocus
          placeholder="z. B. Bankdrücken"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {suggestions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                className="chip"
                onClick={() => setName(s.name)}
              >
                {s.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <label className="label">Sätze</label>
            <input
              className="input text-center"
              type="number"
              inputMode="numeric"
              value={sets}
              onChange={(e) => setSets(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Wdh.</label>
            <input
              className="input text-center"
              type="number"
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
          </div>
          <div>
            <label className="label">kg (opt.)</label>
            <input
              className="input text-center"
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
        </div>

        <label className="label mt-4">Hinweis (optional)</label>
        <input
          className="input"
          placeholder="z. B. langsam ablassen"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <button className="btn-primary mt-5 w-full" onClick={save}>
          Speichern
        </button>
      </Sheet>

      <Confirm
        open={!!confirmDel}
        title="Übung entfernen?"
        message={confirmDel ? `"${confirmDel.name}" aus dem Trainingstag entfernen.` : undefined}
        confirmLabel="Entfernen"
        onConfirm={() => confirmDel && remove(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
