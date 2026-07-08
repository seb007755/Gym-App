import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid } from '../db'
import type { Plan, PlanDay } from '../types'
import { TopBar, Sheet, Confirm, EmptyState } from '../components/ui'
import { ChevronRight, DumbbellIcon, PlusIcon, TrashIcon } from '../components/icons'

export default function PlansPage() {
  const navigate = useNavigate()
  const plans = useLiveQuery(() => db.plans.orderBy('createdAt').toArray(), [])

  const [newPlanOpen, setNewPlanOpen] = useState(false)
  const [planName, setPlanName] = useState('')
  const [addDayFor, setAddDayFor] = useState<Plan | null>(null)
  const [dayName, setDayName] = useState('')
  const [confirmDelPlan, setConfirmDelPlan] = useState<Plan | null>(null)
  const [confirmDelDay, setConfirmDelDay] = useState<{ plan: Plan; day: PlanDay } | null>(null)

  async function createPlan() {
    const name = planName.trim() || 'Mein Split'
    const plan: Plan = { id: uid(), name, days: [], createdAt: Date.now() }
    await db.plans.put(plan)
    setPlanName('')
    setNewPlanOpen(false)
  }

  async function addDay() {
    if (!addDayFor) return
    const name = dayName.trim()
    if (!name) return
    const day: PlanDay = { id: uid(), name, exercises: [] }
    await db.plans.put({ ...addDayFor, days: [...addDayFor.days, day] })
    setDayName('')
    setAddDayFor(null)
    navigate(`/plan/${addDayFor.id}/day/${day.id}`)
  }

  async function deletePlan(p: Plan) {
    await db.plans.delete(p.id)
    setConfirmDelPlan(null)
  }

  async function deleteDay(plan: Plan, day: PlanDay) {
    await db.plans.put({ ...plan, days: plan.days.filter((d) => d.id !== day.id) })
    setConfirmDelDay(null)
  }

  return (
    <div>
      <TopBar
        title="Trainingspläne"
        right={
          <button
            className="btn-ghost h-10 w-10 rounded-full p-0"
            onClick={() => setNewPlanOpen(true)}
            aria-label="Plan hinzufügen"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        }
      />

      <div className="space-y-4 p-4">
        {plans && plans.length === 0 ? (
          <EmptyState
            icon={<DumbbellIcon className="h-12 w-12" />}
            title="Noch kein Plan"
            hint="Lege einen Split mit mehreren Trainingstagen an (z. B. Push / Pull / Legs)."
            action={
              <button className="btn-primary" onClick={() => setNewPlanOpen(true)}>
                <PlusIcon className="h-5 w-5" /> Plan erstellen
              </button>
            }
          />
        ) : null}

        {plans?.map((plan) => (
          <section key={plan.id} className="card">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="flex-1 truncate text-lg font-bold">{plan.name}</h2>
              <button
                className="btn-ghost btn-sm h-9 w-9 rounded-full p-0 text-neutral-400"
                onClick={() => setConfirmDelPlan(plan)}
                aria-label="Plan löschen"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>

            <ul className="space-y-2">
              {plan.days.map((day) => (
                <li key={day.id}>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl bg-surface2 px-3 py-3 text-left active:bg-line"
                    onClick={() => navigate(`/plan/${plan.id}/day/${day.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{day.name}</p>
                      <p className="text-sm text-neutral-500">
                        {day.exercises.length}{' '}
                        {day.exercises.length === 1 ? 'Übung' : 'Übungen'}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-neutral-500" />
                  </button>
                </li>
              ))}
            </ul>

            <button
              className="btn-ghost btn-sm mt-3 w-full"
              onClick={() => {
                setAddDayFor(plan)
                setDayName('')
              }}
            >
              <PlusIcon className="h-4 w-4" /> Trainingstag
            </button>
          </section>
        ))}

        <p className="px-1 pt-2 text-center text-xs text-neutral-600">
          Alle Daten bleiben lokal auf deinem Gerät.
        </p>
      </div>

      {/* Neuer Plan */}
      <Sheet open={newPlanOpen} onClose={() => setNewPlanOpen(false)} title="Neuer Plan">
        <label className="label">Name des Splits</label>
        <input
          className="input"
          autoFocus
          placeholder="z. B. PPL, Oberkörper/Unterkörper"
          value={planName}
          onChange={(e) => setPlanName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createPlan()}
        />
        <button className="btn-primary mt-4 w-full" onClick={createPlan}>
          Erstellen
        </button>
      </Sheet>

      {/* Neuer Trainingstag */}
      <Sheet open={!!addDayFor} onClose={() => setAddDayFor(null)} title="Neuer Trainingstag">
        <label className="label">Name des Tages</label>
        <input
          className="input"
          autoFocus
          placeholder="z. B. Push, Pull, Beine"
          value={dayName}
          onChange={(e) => setDayName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addDay()}
        />
        <button className="btn-primary mt-4 w-full" onClick={addDay}>
          Anlegen & Übungen hinzufügen
        </button>
      </Sheet>

      <Confirm
        open={!!confirmDelPlan}
        title="Plan löschen?"
        message={`"${confirmDelPlan?.name}" und alle Trainingstage werden entfernt. Vergangene Trainings bleiben im Verlauf erhalten.`}
        onConfirm={() => confirmDelPlan && deletePlan(confirmDelPlan)}
        onCancel={() => setConfirmDelPlan(null)}
      />
      <Confirm
        open={!!confirmDelDay}
        title="Trainingstag löschen?"
        message={confirmDelDay ? `"${confirmDelDay.day.name}" wird entfernt.` : undefined}
        onConfirm={() => confirmDelDay && deleteDay(confirmDelDay.plan, confirmDelDay.day)}
        onCancel={() => setConfirmDelDay(null)}
      />
    </div>
  )
}
