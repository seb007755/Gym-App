import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getActiveSession, getSettings, startSession } from '../db'
import type { Plan } from '../types'
import { TopBar, EmptyState } from '../components/ui'
import { formatDate } from '../lib/format'
import { PlayIcon, DumbbellIcon } from '../components/icons'

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

  // Ort/Hersteller mit zuletzt genutzten Werten vorbelegen.
  useEffect(() => {
    if (!settings) return
    setLocation((l) => l || settings.lastLocation)
    setManufacturer((m) => m || settings.lastManufacturer)
  }, [settings])

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
    if (freeMode) {
      const s = await startSession({ location, manufacturer })
      void s
    } else {
      if (!selectedPlan || !dayId) return
      await startSession({
        plan: selectedPlan,
        planDayId: dayId,
        location,
        manufacturer,
      })
    }
    navigate('/workout')
  }

  const canStart = (freeMode || (selectedPlan && dayId)) && manufacturer.trim() !== ''

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
                  (pro Training)
                </span>
              </label>
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
                Gewichte variieren je Hersteller – der Tag macht spätere Vergleiche
                interpretierbar.
              </p>
            </section>

            <button
              className="btn-primary w-full py-4 text-lg"
              onClick={start}
              disabled={!canStart}
            >
              <PlayIcon className="h-5 w-5" /> Training starten
            </button>
            {!manufacturer.trim() ? (
              <p className="text-center text-xs text-neutral-500">
                Bitte einen Hersteller wählen.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
