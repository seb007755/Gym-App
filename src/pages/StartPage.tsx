import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  getActiveSession,
  getSettings,
  manufacturerForLocation,
  startSession,
  upsertExerciseByName,
} from '../db'
import type { Plan } from '../types'
import { TopBar, EmptyState, Sheet } from '../components/ui'
import { formatDate } from '../lib/format'
import { PlayIcon, DumbbellIcon, PlusIcon, CheckIcon } from '../components/icons'

export default function StartPage() {
  const navigate = useNavigate()
  const plans = useLiveQuery(() => db.plans.orderBy('createdAt').toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])
  const active = useLiveQuery(() => getActiveSession(), [])

  const [planId, setPlanId] = useState<string>('')
  const [dayId, setDayId] = useState<string>('')
  const [location, setLocation] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [freeMode, setFreeMode] = useState(false)
  const [addingLocation, setAddingLocation] = useState(false)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [addExOpen, setAddExOpen] = useState(false)
  const [newExName, setNewExName] = useState('')

  const allExercises = useLiveQuery(
    () => db.exercises.orderBy('name').toArray(),
    [],
  )

  // Ort mit dem zuletzt genutzten Wert vorbelegen.
  useEffect(() => {
    if (!settings) return
    setLocation((l) => l || settings.lastLocation)
  }, [settings])

  // Der Hersteller haengt am Ort: bei bekannten Orten fest, sonst waehlbar.
  const boundManufacturer = settings ? manufacturerForLocation(settings, location) : ''
  const locationIsKnown = !!boundManufacturer
  const effectiveManufacturer = locationIsKnown ? boundManufacturer : manufacturer

  // ersten Plan/Tag vorwaehlen
  useEffect(() => {
    if (!plans || plans.length === 0) return
    if (!planId) {
      const first = plans.find((p) => p.days.length > 0) ?? plans[0]
      setPlanId(first.id)
      setDayId(first.days[0]?.id ?? '')
    }
  }, [plans, planId])

  const selectedPlan: Plan | undefined = plans?.find((p) => p.id === planId)

  useEffect(() => {
    if (!selectedPlan) return
    if (!selectedPlan.days.some((d) => d.id === dayId)) {
      setDayId(selectedPlan.days[0]?.id ?? '')
    }
  }, [selectedPlan, dayId])

  async function addNewExercise() {
    const name = newExName.trim()
    if (!name) return
    // Landet in der Uebungs-Datenbank, aber in keinem Trainingsplan.
    const id = await upsertExerciseByName(name)
    setPicked((p) => ({ ...p, [id]: true }))
    setNewExName('')
    setAddExOpen(false)
  }

  async function start() {
    if (freeMode) {
      await startSession({
        location,
        manufacturer: effectiveManufacturer,
        adHocExercises: (allExercises ?? [])
          .filter((e) => picked[e.id])
          .map((e) => ({ name: e.name, exerciseId: e.id })),
      })
    } else {
      if (!selectedPlan || !dayId) return
      await startSession({
        plan: selectedPlan,
        planDayId: dayId,
        location,
        manufacturer: effectiveManufacturer,
      })
    }
    navigate('/workout')
  }

  const canStart =
    (freeMode || (selectedPlan && dayId)) && effectiveManufacturer.trim() !== ''

  return (
    <div>
      <TopBar title="Training starten" />

      <div className="space-y-4 p-4">
        {active ? (
          <button
            className="card flex w-full items-center gap-3 border-brand/60 bg-brand/10 text-left"
            onClick={() => navigate('/workout')}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white">
              <PlayIcon className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold text-brand">Laufendes Training fortsetzen</p>
              <p className="text-sm text-neutral-400">
                {active.dayName ?? 'Freies Training'} · seit {formatDate(active.startTime)}
              </p>
            </div>
          </button>
        ) : null}

        {(!plans || plans.length === 0) && !freeMode ? (
          <EmptyState
            icon={<DumbbellIcon className="h-12 w-12" />}
            title="Noch kein Plan"
            hint="Lege zuerst einen Trainingsplan an – oder starte ein freies Training."
            action={
              <div className="flex flex-col gap-2">
                <button className="btn-primary" onClick={() => navigate('/')}>
                  Plan erstellen
                </button>
                <button className="btn-ghost" onClick={() => setFreeMode(true)}>
                  Freies Training
                </button>
              </div>
            }
          />
        ) : (
          <>
            {/* Modus */}
            <div className="flex gap-2">
              <button
                className={'chip flex-1 justify-center py-2.5 ' + (!freeMode ? 'chip-active' : '')}
                onClick={() => setFreeMode(false)}
              >
                Nach Plan
              </button>
              <button
                className={'chip flex-1 justify-center py-2.5 ' + (freeMode ? 'chip-active' : '')}
                onClick={() => setFreeMode(true)}
              >
                Freies Training
              </button>
            </div>

            {!freeMode && plans && plans.length > 0 ? (
              <section className="card">
                <label className="label">Plan</label>
                <select
                  className="input mb-3"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <label className="label">Trainingstag</label>
                {selectedPlan && selectedPlan.days.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedPlan.days.map((d) => (
                      <button
                        key={d.id}
                        className={'chip ' + (d.id === dayId ? 'chip-active' : '')}
                        onClick={() => setDayId(d.id)}
                      >
                        {d.name}{' '}
                        <span className="ml-1 text-xs opacity-70">
                          {d.exercises.length}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">
                    Dieser Plan hat noch keine Trainingstage.
                  </p>
                )}
              </section>
            ) : null}

            {/* Ort + Hersteller */}
            <section className="card">
              <label className="label">Ort</label>
              {settings && settings.locations.length > 0 && !addingLocation ? (
                <>
                  <select
                    className="input"
                    value={settings.locations.includes(location) ? location : ''}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setAddingLocation(true)
                        setLocation('')
                      } else {
                        setLocation(e.target.value)
                      }
                    }}
                  >
                    <option value="" disabled>
                      Ort wählen…
                    </option>
                    {settings.locations.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                    <option value="__new__">＋ Neuer Ort…</option>
                  </select>
                  <p className="mt-1.5 text-xs text-muted">
                    An bekannten Orten werden die Gewichte vom letzten Mal
                    vorbelegt.
                  </p>
                </>
              ) : (
                <>
                  <input
                    className="input"
                    autoFocus={addingLocation}
                    placeholder="z. B. FitX Innenstadt"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                  {settings && settings.locations.length > 0 ? (
                    <button
                      className="mt-1.5 text-xs text-muted underline"
                      onClick={() => {
                        setAddingLocation(false)
                        setLocation(settings.lastLocation)
                      }}
                    >
                      Zurück zur Auswahl
                    </button>
                  ) : null}
                </>
              )}

              <label className="label mt-4">
                Geräte-Hersteller
                <span className="ml-1 font-normal text-neutral-600">
                  (pro Ort)
                </span>
              </label>
              {locationIsKnown ? (
                <>
                  <p className="rounded-lg bg-surface2 px-3 py-2.5 font-semibold">
                    {boundManufacturer}
                  </p>
                  <p className="mt-1.5 text-xs text-muted">
                    Für diesen Ort festgelegt. Änderung nur unter Einstellungen →
                    Orte.
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {settings?.manufacturers.map((m) => (
                      <button
                        key={m}
                        className={'chip ' + (m === manufacturer ? 'chip-active' : '')}
                        onClick={() => setManufacturer(m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <input
                    className="input"
                    placeholder="Anderer Hersteller…"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-neutral-600">
                    Wird einmalig für diesen Ort gespeichert – danach nur noch in
                    den Einstellungen änderbar.
                  </p>
                </>
              )}
            </section>

            {/* Freies Training: Uebungen auswaehlen */}
            {freeMode ? (
              <section className="card">
                <h2 className="mb-1 font-bold">Übungen</h2>
                <p className="mb-3 text-xs text-muted">
                  Wähle aus, was du heute machen willst. Weitere Übungen kannst du
                  auch während des Trainings ergänzen.
                </p>
                {allExercises && allExercises.length > 0 ? (
                  <ul className="space-y-1">
                    {allExercises.map((e) => {
                      const on = !!picked[e.id]
                      return (
                        <li key={e.id}>
                          <button
                            className={
                              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ' +
                              (on ? 'bg-brand/10 text-brand' : 'bg-surface2')
                            }
                            onClick={() =>
                              setPicked((p) => ({ ...p, [e.id]: !p[e.id] }))
                            }
                            aria-pressed={on}
                          >
                            <span
                              className={
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded border ' +
                                (on
                                  ? 'border-brand bg-brand text-white'
                                  : 'border-line')
                              }
                            >
                              {on ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {e.name}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">
                    Noch keine Übungen bekannt – ergänze deine erste.
                  </p>
                )}
                <button
                  className="btn-ghost mt-2 w-full"
                  onClick={() => {
                    setNewExName('')
                    setAddExOpen(true)
                  }}
                >
                  <PlusIcon className="h-5 w-5" /> Übung ergänzen
                </button>
              </section>
            ) : null}

            <button
              className="btn-primary w-full py-4 text-lg"
              onClick={start}
              disabled={!canStart}
            >
              <PlayIcon className="h-5 w-5" /> Training starten
            </button>
            {!effectiveManufacturer.trim() ? (
              <p className="text-center text-xs text-neutral-500">
                Bitte einen Hersteller wählen.
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* Neue Uebung anlegen (nur Stammdaten, kein Plan) */}
      <Sheet open={addExOpen} onClose={() => setAddExOpen(false)} title="Übung ergänzen">
        <input
          className="input"
          autoFocus
          placeholder="Name der Übung"
          value={newExName}
          onChange={(e) => setNewExName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNewExercise()}
        />
        <p className="mt-2 text-xs text-neutral-600">
          Wird als verfügbare Übung gespeichert, aber keinem Trainingsplan
          hinzugefügt.
        </p>
        <button
          className="btn-primary mt-4 w-full"
          disabled={!newExName.trim()}
          onClick={addNewExercise}
        >
          Hinzufügen
        </button>
      </Sheet>
    </div>
  )
}
