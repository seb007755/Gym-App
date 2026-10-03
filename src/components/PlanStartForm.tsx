import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, manufacturerForLocation, startSession } from '../db'
import type { Plan } from '../types'
import { EmptyState } from './ui'
import { PlayIcon, DumbbellIcon } from './icons'

// Plan-basiertes "Training starten"-Formular (Plan + Trainingstag + Ort +
// Hersteller), aus StartPage.tsx extrahiert. Eigenstaendig: startet die
// Session selbst und navigiert selbst zu /workout. `onStarted` ist nur ein
// optionaler Zusatz-Hook fuer Aufrufer, die sich selbst ausblenden muessen,
// bevor navigiert wird (z.B. SplashScreen) - StartPage braucht ihn nicht.
export function PlanStartForm({ onStarted }: { onStarted?: () => void }) {
  const navigate = useNavigate()
  const plans = useLiveQuery(() => db.plans.orderBy('createdAt').toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])

  const [planId, setPlanId] = useState('')
  const [dayId, setDayId] = useState('')
  const [location, setLocation] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [addingLocation, setAddingLocation] = useState(false)

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

  async function start() {
    if (!selectedPlan || !dayId) return
    await startSession({
      plan: selectedPlan,
      planDayId: dayId,
      location,
      manufacturer: effectiveManufacturer,
    })
    onStarted?.()
    navigate('/workout')
  }

  const canStart = !!selectedPlan && !!dayId && effectiveManufacturer.trim() !== ''

  if (!plans || plans.length === 0) {
    return (
      <EmptyState
        icon={<DumbbellIcon className="h-12 w-12" />}
        title="Noch kein Plan"
        hint="Lege zuerst einen Trainingsplan an."
        action={
          <button
            className="btn-primary"
            onClick={() => {
              onStarted?.()
              navigate('/')
            }}
          >
            Plan erstellen
          </button>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <label className="label">Plan</label>
        <select className="input mb-3" value={planId} onChange={(e) => setPlanId(e.target.value)}>
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
                {d.name} <span className="ml-1 text-xs opacity-70">{d.exercises.length}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Dieser Plan hat noch keine Trainingstage.</p>
        )}
      </section>

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
              An bekannten Orten werden die Gewichte vom letzten Mal vorbelegt.
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
          <span className="ml-1 font-normal text-neutral-600">(pro Ort)</span>
        </label>
        {locationIsKnown ? (
          <>
            <p className="rounded-lg bg-surface2 px-3 py-2.5 font-semibold">{boundManufacturer}</p>
            <p className="mt-1.5 text-xs text-muted">
              Für diesen Ort festgelegt. Änderung nur unter Einstellungen → Orte.
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
              Wird einmalig für diesen Ort gespeichert – danach nur noch in den
              Einstellungen änderbar.
            </p>
          </>
        )}
      </section>

      <button className="btn-primary w-full py-4 text-lg" onClick={start} disabled={!canStart}>
        <PlayIcon className="h-5 w-5" /> Training starten
      </button>
      {!effectiveManufacturer.trim() ? (
        <p className="text-center text-xs text-neutral-500">Bitte einen Hersteller wählen.</p>
      ) : null}
    </div>
  )
}
