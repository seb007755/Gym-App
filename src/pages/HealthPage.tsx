import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addBodyFatEntry,
  computePhaseBands,
  db,
  dayKey,
  getSettings,
  saveSettings,
  setCurrentPhase,
  upsertWeightEntry,
} from '../db'
import { CALIPER_SITES } from '../lib/bodyFat'
import type { BodyPhase, CaliperMethod } from '../types'
import { TopBar, Sheet } from '../components/ui'
import { LineChart, Legend, type ChartBand } from '../components/charts'
import { formatDate } from '../lib/format'
import { PlusIcon } from '../components/icons'

const PHASE_LABEL: Record<BodyPhase, string> = {
  aufbau: 'Aufbau',
  diaet: 'Diät',
  halten: 'Halten',
}
// Niedrige Opazitaet (wie vom Nutzer gewuenscht) - bereits validierte
// Palette wiederverwendet statt neue Farben zu erfinden.
const PHASE_COLOR: Record<BodyPhase, string> = {
  aufbau: '#FF9F0A', // warn
  diaet: '#3987e5', // SERIES_COLORS[0]
  halten: '#30D158', // success
}

const SITE_LABEL: Record<string, string> = {
  chest: 'Brust',
  abdomen: 'Bauch',
  thigh: 'Oberschenkel',
  triceps: 'Trizeps',
  suprailiac: 'Hüfte (suprailiacal)',
  midaxillary: 'mittlere Achsel',
  subscapular: 'Schulterblatt',
}

function toDateInputValue(ts: number): string {
  return dayKey(ts)
}
function parseDateInputValue(value: string): number {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

export default function HealthPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const weightEntries = useLiveQuery(() => db.weightEntries.toArray(), [])
  const phaseChanges = useLiveQuery(() => db.phaseChanges.toArray(), [])
  const bodyFatEntries = useLiveQuery(() => db.bodyFatEntries.toArray(), [])

  const [weightDate, setWeightDate] = useState(() => toDateInputValue(Date.now()))
  const [weightVal, setWeightVal] = useState('')

  const [bfOpen, setBfOpen] = useState(false)
  const [bfMethod, setBfMethod] = useState<CaliperMethod>('3-punkt')
  const [bfDate, setBfDate] = useState(() => toDateInputValue(Date.now()))
  const [bfSites, setBfSites] = useState<Record<string, string>>({})
  const [bfError, setBfError] = useState<string | null>(null)

  const sex = settings?.sex
  const profileComplete = !!sex && !!settings?.birthDate

  const sortedPhases = useMemo(
    () => [...(phaseChanges ?? [])].sort((a, b) => b.date - a.date),
    [phaseChanges],
  )
  const currentPhase = sortedPhases[0]?.phase

  const weightSeries = useMemo(() => {
    const pts = [...(weightEntries ?? [])]
      .sort((a, b) => a.date - b.date)
      .map((w) => ({ x: w.date, y: w.weightKg }))
    return [{ name: 'Gewicht', color: '#3987e5', points: pts }]
  }, [weightEntries])

  const bands: ChartBand[] = useMemo(() => {
    if (!phaseChanges?.length) return []
    return computePhaseBands(phaseChanges, Date.now()).map((b) => ({
      start: b.start,
      end: b.end,
      color: PHASE_COLOR[b.phase] + '1F', // ~12% Opazitaet (hex-Alpha)
    }))
  }, [phaseChanges])

  const bodyFatSeries = useMemo(() => {
    const pts = [...(bodyFatEntries ?? [])]
      .sort((a, b) => a.date - b.date)
      .map((e) => ({ x: e.date, y: e.bodyFatPercent }))
    return [{ name: 'Körperfett', color: '#d95926', points: pts }]
  }, [bodyFatEntries])

  async function submitWeight() {
    const kg = parseFloat(weightVal.replace(',', '.'))
    if (!kg || kg <= 0) return
    await upsertWeightEntry(parseDateInputValue(weightDate), kg)
    setWeightVal('')
  }

  function openBodyFat() {
    setBfDate(toDateInputValue(Date.now()))
    setBfSites({})
    setBfError(null)
    setBfOpen(true)
  }

  async function submitBodyFat() {
    if (!sex) return
    const keys = CALIPER_SITES[bfMethod][sex]
    const sites: Record<string, number> = {}
    for (const k of keys) {
      const v = parseFloat((bfSites[k] ?? '').replace(',', '.'))
      if (!v || v <= 0) {
        setBfError('Bitte alle Messstellen ausfüllen.')
        return
      }
      sites[k] = v
    }
    const entry = await addBodyFatEntry(parseDateInputValue(bfDate), bfMethod, sites)
    if (!entry) {
      setBfError('Profil (Geschlecht + Geburtsdatum) fehlt.')
      return
    }
    setBfOpen(false)
  }

  return (
    <div>
      <TopBar title="Health" />

      <div className="space-y-4 p-4">
        {/* Profil - nur fuer die Koerperfett-Berechnung noetig */}
        <section className="card">
          <h2 className="mb-1 font-bold">Profil</h2>
          <p className="mb-3 text-xs text-muted">
            Wird nur für die Körperfett-Berechnung aus den Caliper-Werten benötigt.
          </p>
          <label className="label">Geschlecht</label>
          <div className="mb-3 flex gap-2">
            <button
              className={'chip flex-1 justify-center ' + (sex === 'male' ? 'chip-active' : '')}
              onClick={() => saveSettings({ sex: 'male' })}
            >
              Männlich
            </button>
            <button
              className={'chip flex-1 justify-center ' + (sex === 'female' ? 'chip-active' : '')}
              onClick={() => saveSettings({ sex: 'female' })}
            >
              Weiblich
            </button>
          </div>
          <label className="label">Geburtsdatum</label>
          <input
            className="input"
            type="date"
            value={settings?.birthDate ? toDateInputValue(settings.birthDate) : ''}
            onChange={(e) => {
              if (!e.target.value) return
              saveSettings({ birthDate: parseDateInputValue(e.target.value) })
            }}
          />
        </section>

        {/* Phase */}
        <section className="card">
          <h2 className="mb-1 font-bold">Phase</h2>
          <p className="mb-3 text-xs text-muted">
            Aktuell: <span className="font-semibold text-ink">{currentPhase ? PHASE_LABEL[currentPhase] : 'Nicht gesetzt'}</span>
          </p>
          <div className="flex gap-2">
            {(Object.keys(PHASE_LABEL) as BodyPhase[]).map((p) => (
              <button
                key={p}
                className={'chip flex-1 justify-center ' + (currentPhase === p ? 'chip-active' : '')}
                onClick={() => setCurrentPhase(Date.now(), p)}
              >
                {PHASE_LABEL[p]}
              </button>
            ))}
          </div>
        </section>

        {/* Gewicht */}
        <section className="card">
          <h2 className="mb-3 font-bold">Gewicht</h2>
          <div className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              className="input"
              type="date"
              value={weightDate}
              onChange={(e) => setWeightDate(e.target.value)}
            />
            <input
              className="input text-center"
              type="number"
              inputMode="decimal"
              placeholder="kg"
              value={weightVal}
              onChange={(e) => setWeightVal(e.target.value)}
            />
            <button className="btn-primary" onClick={submitWeight} disabled={!weightVal.trim()}>
              OK
            </button>
          </div>
          {weightSeries[0].points.length > 0 ? (
            <>
              <LineChart series={weightSeries} formatX={formatDate} unit="kg" bands={bands} />
              {phaseChanges?.length ? (
                <Legend
                  items={(Object.keys(PHASE_LABEL) as BodyPhase[]).map((p) => ({
                    name: PHASE_LABEL[p],
                    color: PHASE_COLOR[p],
                  }))}
                />
              ) : null}
            </>
          ) : (
            <p className="text-sm text-neutral-500">Noch keine Gewichtseinträge.</p>
          )}
        </section>

        {/* Koerperfett */}
        <section className="card">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="flex-1 font-bold">Körperfett (Caliper)</h2>
            <button
              className="btn-ghost btn-sm h-9 w-9 rounded-full p-0"
              onClick={openBodyFat}
              disabled={!profileComplete}
              aria-label="Messung hinzufügen"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
          {!profileComplete ? (
            <p className="text-xs text-warn">Erst Geschlecht + Geburtsdatum im Profil eintragen.</p>
          ) : null}
          {bodyFatSeries[0].points.length > 0 ? (
            <>
              <LineChart series={bodyFatSeries} formatX={formatDate} unit="%" />
              <ul className="mt-2 space-y-1">
                {[...(bodyFatEntries ?? [])]
                  .sort((a, b) => b.date - a.date)
                  .slice(0, 5)
                  .map((e) => (
                    <li key={e.id} className="flex justify-between text-sm text-muted">
                      <span>{formatDate(e.date)}</span>
                      <span className="text-ink">
                        {e.bodyFatPercent}% ({e.method})
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-neutral-500">Noch keine Messungen.</p>
          )}
        </section>
      </div>

      <Sheet open={bfOpen} onClose={() => setBfOpen(false)} title="Körperfett-Messung">
        <div className="mb-3 flex gap-2">
          <button
            className={'chip flex-1 justify-center ' + (bfMethod === '3-punkt' ? 'chip-active' : '')}
            onClick={() => setBfMethod('3-punkt')}
          >
            3-Punkt
          </button>
          <button
            className={'chip flex-1 justify-center ' + (bfMethod === '7-punkt' ? 'chip-active' : '')}
            onClick={() => setBfMethod('7-punkt')}
          >
            7-Punkt
          </button>
        </div>
        <label className="label">Datum</label>
        <input
          className="input mb-3"
          type="date"
          value={bfDate}
          onChange={(e) => setBfDate(e.target.value)}
        />
        {sex ? (
          <div className="space-y-2">
            {CALIPER_SITES[bfMethod][sex].map((k) => (
              <div key={k}>
                <label className="label">{SITE_LABEL[k]} (mm)</label>
                <input
                  className="input text-center"
                  type="number"
                  inputMode="decimal"
                  value={bfSites[k] ?? ''}
                  onChange={(e) => setBfSites((s) => ({ ...s, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        ) : null}
        {bfError ? <p className="mt-2 text-xs text-warn">{bfError}</p> : null}
        <button className="btn-primary mt-4 w-full" onClick={submitBodyFat}>
          Berechnen &amp; speichern
        </button>
      </Sheet>
    </div>
  )
}
