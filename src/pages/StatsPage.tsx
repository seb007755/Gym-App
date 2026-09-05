import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DEFAULT_ACTIVITY_TYPES,
  db,
  dayKey,
  exKey,
  getSettings,
  toggleActivity,
} from '../db'
import type { SessionExercise, WorkoutSession } from '../types'
import { TopBar, EmptyState, Sheet } from '../components/ui'
import {
  ActivityHeatmap,
  BarList,
  Legend,
  LineChart,
  SERIES_OTHER,
  seriesColor,
  type HeatDay,
  type LineSeries,
} from '../components/charts'
import { formatDate, formatDurationLong } from '../lib/format'
import { shareNodeAsImage } from '../lib/shareImage'
import { ChartIcon, CheckIcon } from '../components/icons'

const GYM = 'Gym-Training'

// Schwerster abgehakter Satz einer Uebung - die Kennzahl fuer "wird es mehr?".
function topWeight(ex: SessionExercise): number | null {
  const w = ex.sets.filter((s) => s.done).map((s) => s.weight ?? 0)
  return w.length ? Math.max(...w) : null
}

function doneReps(ex: SessionExercise, weight: number): number | null {
  const hit = ex.sets.find((s) => s.done && (s.weight ?? 0) === weight)
  return hit?.reps ?? null
}

interface Occurrence {
  session: WorkoutSession
  ex: SessionExercise
  top: number
}

function SessionRow({ label, s }: { label: string; s: WorkoutSession }) {
  return (
    <div className="border-t border-line py-2.5 first:border-t-0">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="font-semibold">{s.location || 'Ohne Ort'}</p>
      <p className="text-sm tabular-nums text-muted">
        {formatDate(s.date)} · {formatDurationLong(s.durationSeconds)} ·{' '}
        {s.calories != null ? `${s.calories} kcal` : '—'}
      </p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export default function StatsPage() {
  const sessions = useLiveQuery(() => db.sessions.filter((s) => s.finished).toArray(), [])
  const activities = useLiveQuery(() => db.activities.toArray(), [])
  const settings = useLiveQuery(() => getSettings(), [])

  const [selected, setSelected] = useState('')
  const [showTable, setShowTable] = useState(false)
  const [dayOpen, setDayOpen] = useState<number | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  // Waehrend des Exports: Kalender skaliert statt zu scrollen, Kopfzeile sichtbar.
  const [exporting, setExporting] = useState(false)
  const [sharing, setSharing] = useState(false)

  async function shareStats() {
    const node = exportRef.current
    if (!node) return
    setSharing(true)
    setExporting(true)
    // Zwei Frames warten, damit das Layout ohne Scroll-Clipping steht.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const name = `statistik-${new Date().toISOString().slice(0, 10)}.png`
    const res = await shareNodeAsImage(node, name, 'Trainings-Statistik')
    setExporting(false)
    setSharing(false)
    if (res === 'failed') {
      alert('Bild konnte nicht erstellt werden. Nutze einfach einen Screenshot.')
    }
  }

  const activityTypes = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES
  // Feste Reihenfolge: Gym zuerst, dann die Typen wie in den Einstellungen.
  const categories = useMemo(() => [GYM, ...activityTypes], [activityTypes])
  const colorOf = (cat: string) => {
    const i = categories.indexOf(cat)
    return i < 0 ? SERIES_OTHER : seriesColor(i)
  }

  const stats = useMemo(() => {
    if (!sessions || sessions.length === 0) return null
    const desc = [...sessions].sort((a, b) => b.date - a.date)
    const longest = [...sessions].sort((a, b) => b.durationSeconds - a.durationSeconds)[0]
    return {
      last: desc[0],
      longest,
      totalSeconds: sessions.reduce((n, s) => n + s.durationSeconds, 0),
      locations: new Set(sessions.map((s) => s.location.trim()).filter(Boolean)).size,
    }
  }, [sessions])

  // Alle je absolvierten Uebungen mit ihren Vorkommen.
  const exercises = useMemo(() => {
    const map = new Map<string, { name: string; occ: Occurrence[] }>()
    for (const s of sessions ?? []) {
      for (const ex of s.exercises) {
        const top = topWeight(ex)
        if (top == null) continue
        const key = exKey(ex.name, ex.exerciseId)
        const entry = map.get(key) ?? { name: ex.name, occ: [] }
        entry.occ.push({ session: s, ex, top })
        map.set(key, entry)
      }
    }
    for (const e of map.values()) e.occ.sort((a, b) => b.session.date - a.session.date)
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'de'))
  }, [sessions])

  const chosen = exercises.find(([k]) => k === selected)?.[1]

  // Eine Linie je Hersteller: Gewichte sind zwischen Herstellern nicht vergleichbar.
  const chartSeries: LineSeries[] = useMemo(() => {
    if (!chosen) return []
    const byMan = new Map<string, Occurrence[]>()
    for (const o of chosen.occ) {
      const m = o.session.equipmentManufacturer || 'Ohne Hersteller'
      byMan.set(m, [...(byMan.get(m) ?? []), o])
    }
    const ranked = [...byMan.entries()].sort((a, b) => b[1].length - a[1].length)
    return ranked.slice(0, 5).map(([name, occ], i) => ({
      name,
      color: seriesColor(i),
      points: occ.map((o) => ({
        x: o.session.date,
        y: o.top,
        label: o.session.location || 'Ohne Ort',
      })),
    }))
  }, [chosen])

  // Stagnation: seit wie vielen Einheiten am selben Hersteller kein neues
  // Hoechstgewicht mehr? Der Hersteller-Filter verhindert Fehlalarme durch
  // Geraetewechsel.
  const stagnating = useMemo(() => {
    const out: { name: string; manufacturer: string; weight: number; streak: number; note?: string }[] = []
    for (const [, e] of exercises) {
      if (e.occ.length < 3) continue
      const man = e.occ[0].session.equipmentManufacturer
      const same = e.occ.filter((o) => o.session.equipmentManufacturer === man)
      if (same.length < 3) continue
      let streak = 1
      while (streak < same.length && same[streak].top >= same[0].top) streak++
      if (streak >= 3) {
        out.push({
          name: e.name,
          manufacturer: man || 'Ohne Hersteller',
          weight: same[0].top,
          streak,
          note: same[0].ex.nextNote,
        })
      }
    }
    return out.sort((a, b) => b.streak - a.streak)
  }, [exercises])

  const records = useMemo(
    () =>
      exercises
        .map(([, e]) => {
          const best = e.occ.reduce((a, b) => (b.top > a.top ? b : a))
          return {
            name: e.name,
            weight: best.top,
            reps: doneReps(best.ex, best.top),
            date: best.session.date,
            where: best.session.location || 'Ohne Ort',
            manufacturer: best.session.equipmentManufacturer,
          }
        })
        .sort((a, b) => b.weight - a.weight),
    [exercises],
  )

  const dayBalance = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of sessions ?? []) {
      const k = s.dayName ?? 'Freies Training'
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: seriesColor(i) }))
  }, [sessions])

  // Kalender: ein Eintrag je Tag mit allen Kategorien, die stattgefunden haben.
  const heatDays = useMemo(() => {
    const map = new Map<string, HeatDay>()
    const add = (ts: number, cat: string) => {
      const k = dayKey(ts)
      const cur = map.get(k) ?? { ts, categories: [] }
      if (!cur.categories.includes(cat)) cur.categories.push(cat)
      map.set(k, cur)
    }
    for (const s of sessions ?? []) add(s.date, GYM)
    for (const a of activities ?? []) add(a.date, a.type)
    // Kategorien in fester Reihenfolge, damit die Streifen nicht springen.
    for (const v of map.values()) {
      v.categories.sort((a, b) => categories.indexOf(a) - categories.indexOf(b))
    }
    return map
  }, [sessions, activities, categories])

  const activityCounts = useMemo(() => {
    const c = new Map<string, number>()
    for (const a of activities ?? []) c.set(a.type, (c.get(a.type) ?? 0) + 1)
    return c
  }, [activities])

  const dayActivities = useMemo(() => {
    if (dayOpen == null) return new Set<string>()
    const k = dayKey(dayOpen)
    return new Set((activities ?? []).filter((a) => dayKey(a.date) === k).map((a) => a.type))
  }, [dayOpen, activities])

  const daySessions = useMemo(() => {
    if (dayOpen == null) return []
    const k = dayKey(dayOpen)
    return (sessions ?? []).filter((s) => dayKey(s.date) === k)
  }, [dayOpen, sessions])

  if (sessions === undefined || activities === undefined) {
    return (
      <div>
        <TopBar title="Statistik" />
      </div>
    )
  }

  const nothingYet = sessions.length === 0 && activities.length === 0

  return (
    <div>
      <TopBar title="Statistik" />

      {nothingYet ? (
        <EmptyState
          icon={<ChartIcon className="h-12 w-12" />}
          title="Noch keine Auswertung"
          hint="Nach dem ersten abgeschlossenen Training erscheinen hier deine Kennzahlen."
        />
      ) : (
        <>
          <div ref={exportRef} className="space-y-4 bg-bg p-4">
          {/* Nur im Bildexport: macht das geteilte Bild selbsterklaerend */}
          {exporting ? (
            <div className="border-b border-line pb-3">
              <p className="text-lg font-bold">Trainings-Statistik</p>
              <p className="text-sm text-muted">Stand {formatDate(Date.now())}</p>
            </div>
          ) : null}

          {/* Kalender */}
          <section className="card">
            <h2 className="font-bold">Kalender</h2>
            {!exporting ? (
              <p className="mb-3 text-xs text-muted">
                Tippe einen Tag an, um Personal- oder Lauf-Training einzutragen – auch
                nachträglich.
              </p>
            ) : (
              <div className="mb-3" />
            )}
            <ActivityHeatmap
              days={heatDays}
              colorOf={colorOf}
              onSelect={setDayOpen}
              fit={exporting}
            />
            <Legend items={categories.map((c) => ({ name: c, color: colorOf(c) }))} />
          </section>

          {stats ? (
            <section className="card">
              <h2 className="mb-1 font-bold">Trainingseinheiten</h2>
              <SessionRow label="Letzte Einheit" s={stats.last} />
              <SessionRow label="Längste Einheit" s={stats.longest} />
            </section>
          ) : null}

          <section className="card">
            <h2 className="mb-1 font-bold">Gesamt</h2>
            <Metric label="Getrackte Trainingseinheiten" value={String(sessions.length)} />
            <Metric
              label="Gesamte Trainingszeit"
              value={formatDurationLong(stats?.totalSeconds ?? 0)}
            />
            <Metric label="Anzahl Orte" value={String(stats?.locations ?? 0)} />
            {activityTypes.map((t) => (
              <Metric key={t} label={t} value={`${activityCounts.get(t) ?? 0}×`} />
            ))}
            <p className="mt-2 text-xs text-neutral-600">
              Dauer und Kalorien beziehen sich nur auf getrackte Gym-Einheiten – für
              angekreuzte Tage liegen keine Zeiten vor.
            </p>
          </section>

          {/* Stagnation */}
          {stagnating.length > 0 ? (
            <section className="card">
              <h2 className="font-bold">Kein Fortschritt</h2>
              <p className="mb-3 text-xs text-muted">
                Übungen ohne neues Höchstgewicht über mehrere Einheiten am selben
                Hersteller.
              </p>
              <ul className="space-y-2">
                {stagnating.map((s) => (
                  <li key={s.name} className="rounded-lg bg-surface2 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{s.name}</span>
                      <span className="shrink-0 text-sm tabular-nums text-warn">
                        {s.streak} Einheiten
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      bei {s.weight} kg · {s.manufacturer}
                    </p>
                    {s.note ? <p className="mt-0.5 text-xs italic text-muted">„{s.note}"</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Uebung nachschlagen */}
          <section className="card">
            <h2 className="mb-3 font-bold">Übung nachschlagen</h2>
            <select
              className="input"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value)
                setShowTable(false)
              }}
            >
              <option value="">Übung wählen…</option>
              {exercises.map(([key, e]) => (
                <option key={key} value={key}>
                  {e.name}
                </option>
              ))}
            </select>

            {chosen ? (
              <>
                <p className="mt-3 text-sm text-muted">
                  <span className="font-semibold tabular-nums text-ink">
                    {chosen.occ.length}×
                  </span>{' '}
                  durchgeführt
                </p>

                <div className="mt-3">
                  <p className="label mb-1">Gewichtsverlauf</p>
                  <LineChart series={chartSeries} formatX={formatDate} unit="kg" />
                  <Legend items={chartSeries.map((s) => ({ name: s.name, color: s.color }))} />
                  <p className="mt-1.5 text-xs text-neutral-600">
                    Je Hersteller eine eigene Linie – Gewichte verschiedener Geräte sind
                    nicht direkt vergleichbar.
                  </p>
                </div>

                {!exporting ? (
                  <button
                    className="btn-ghost btn-sm mt-3 w-full"
                    onClick={() => setShowTable((v) => !v)}
                    aria-expanded={showTable}
                  >
                    {showTable ? 'Tabelle ausblenden' : 'Als Tabelle anzeigen'}
                  </button>
                ) : null}

                {showTable ? (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-muted">
                        <tr>
                          <th className="py-1 pr-2 font-medium">Datum</th>
                          <th className="py-1 pr-2 font-medium">Hersteller</th>
                          <th className="py-1 pr-2 font-medium">Ort</th>
                          <th className="py-1 text-right font-medium">Top-Satz</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chosen.occ.map((o) => (
                          <tr key={o.session.id} className="border-t border-line">
                            <td className="py-1 pr-2 tabular-nums">{formatDate(o.session.date)}</td>
                            <td className="py-1 pr-2">{o.session.equipmentManufacturer || '—'}</td>
                            <td className="py-1 pr-2">{o.session.location || '—'}</td>
                            <td className="py-1 text-right tabular-nums">
                              {o.top} kg × {doneReps(o.ex, o.top) ?? '–'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          {/* Rekorde */}
          {records.length > 0 ? (
            <section className="card">
              <h2 className="mb-3 font-bold">Persönliche Rekorde</h2>
              <ul className="space-y-1">
                {records.map((r) => (
                  <li
                    key={r.name}
                    className="flex items-baseline gap-2 rounded-lg bg-surface2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {r.weight} kg{r.reps ? ` × ${r.reps}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-neutral-600">
                Höchstes abgehaktes Gewicht je Übung.
              </p>
            </section>
          ) : null}

          {/* Trainingstag-Balance */}
          {dayBalance.length > 0 ? (
            <section className="card">
              <h2 className="mb-3 font-bold">Trainingstage</h2>
              <BarList items={dayBalance} />
            </section>
          ) : null}
          </div>

          <div className="px-4 pb-4">
            <button className="btn-ghost w-full" onClick={shareStats} disabled={sharing}>
              {sharing ? 'Erstelle…' : 'Als Bild teilen'}
            </button>
            <p className="mt-2 text-center text-xs text-neutral-600">
              Teilt alles, was gerade angezeigt wird – inklusive der ausgewählten Übung.
            </p>
          </div>
        </>
      )}

      {/* Tag eintragen */}
      <Sheet
        open={dayOpen != null}
        onClose={() => setDayOpen(null)}
        title={dayOpen != null ? formatDate(dayOpen) : ''}
      >
        {daySessions.length > 0 ? (
          <div className="mb-4 rounded-lg bg-surface2 px-3 py-2">
            {daySessions.map((s) => (
              <p key={s.id} className="text-sm">
                <span className="font-semibold">{s.dayName ?? 'Freies Training'}</span>
                <span className="text-muted">
                  {' '}
                  · {formatDurationLong(s.durationSeconds)} · {s.location || 'Ohne Ort'}
                </span>
              </p>
            ))}
            <p className="mt-1 text-xs text-neutral-600">
              Getrackte Einheit – wird hier nicht bearbeitet.
            </p>
          </div>
        ) : null}

        <p className="label mb-2">Nicht getrackte Einheiten</p>
        <div className="space-y-2">
          {activityTypes.map((t) => {
            const on = dayActivities.has(t)
            return (
              <button
                key={t}
                className={
                  'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left ' +
                  (on ? 'bg-brand/10 text-brand' : 'bg-surface2')
                }
                onClick={() => dayOpen != null && void toggleActivity(dayOpen, t)}
                aria-pressed={on}
              >
                <span
                  className={
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded border ' +
                    (on ? 'border-brand bg-brand text-white' : 'border-line')
                  }
                >
                  {on ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="flex-1 text-sm">{t}</span>
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: colorOf(t) }}
                />
              </button>
            )
          })}
        </div>
        {activityTypes.length === 0 ? (
          <p className="text-sm text-muted">
            Keine Typen angelegt – unter Einstellungen → Weitere Einheiten hinzufügen.
          </p>
        ) : null}

        <button className="btn-primary mt-4 w-full" onClick={() => setDayOpen(null)}>
          Fertig
        </button>
      </Sheet>
    </div>
  )
}
