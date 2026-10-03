import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DEFAULT_ACTIVITY_TYPES,
  db,
  dayKey,
  getSettings,
  isDayAssignable,
  saveSettings,
  setActivityDayName,
  toggleActivity,
} from '../db'
import type { Activity, WorkoutSession } from '../types'
import { TopBar, EmptyState, Sheet } from '../components/ui'
import { buildAiExportMarkdown, copyAiExportToClipboard, shareAiExport } from '../lib/aiExport'
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
import {
  computeActivityCounts,
  computeDayBalance,
  computeExerciseHistory,
  computeOverallStats,
  computeRecords,
  computeStagnating,
  doneReps,
  type Occurrence,
} from '../lib/stats'
import { ChartIcon, CheckIcon, PlusIcon, TrashIcon } from '../components/icons'

const GYM = 'Gym-Training'

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
  const plans = useLiveQuery(() => db.plans.toArray(), [])

  // Bekannte Trainingstag-Namen aus den tatsaechlichen Plaenen - keine
  // hartkodierte Push/Pull/Legs-Liste, da individuell benannt werden kann.
  const planDayNames = useMemo(() => {
    const names = new Set<string>()
    for (const p of plans ?? []) for (const d of p.days) if (d.name.trim()) names.add(d.name)
    return [...names]
  }, [plans])

  const [selected, setSelected] = useState('')
  const [showTable, setShowTable] = useState(false)
  const [dayOpen, setDayOpen] = useState<number | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  // Waehrend des Exports: Kalender skaliert statt zu scrollen, Kopfzeile sichtbar.
  const [exporting, setExporting] = useState(false)
  const [sharing, setSharing] = useState(false)
  // KI-Export: frei hinzufuegbare Fragen (persistiert) + Export-Status.
  const [aiQuestionsOpen, setAiQuestionsOpen] = useState(false)
  const [newAiQuestion, setNewAiQuestion] = useState('')
  const [aiExporting, setAiExporting] = useState(false)
  const [aiCopyMsg, setAiCopyMsg] = useState<string | null>(null)

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

  const aiQuestions = settings?.aiQuestions ?? []

  async function addAiQuestion() {
    const q = newAiQuestion.trim()
    if (!q) return
    await saveSettings({ aiQuestions: [...aiQuestions, q] })
    setNewAiQuestion('')
  }

  async function removeAiQuestion(i: number) {
    await saveSettings({ aiQuestions: aiQuestions.filter((_, j) => j !== i) })
  }

  async function exportForAi() {
    setAiExporting(true)
    const markdown = await buildAiExportMarkdown(aiQuestions)
    const res = await shareAiExport(markdown)
    setAiExporting(false)
    if (res === 'failed') alert('Export konnte nicht erstellt werden.')
  }

  async function copyForAi() {
    const markdown = await buildAiExportMarkdown(aiQuestions)
    const ok = await copyAiExportToClipboard(markdown)
    setAiCopyMsg(ok ? 'In Zwischenablage kopiert.' : 'Kopieren nicht möglich.')
    setTimeout(() => setAiCopyMsg(null), 3000)
  }

  const activityTypes = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES
  // Feste Reihenfolge: Gym zuerst, dann die Typen wie in den Einstellungen.
  const categories = useMemo(() => [GYM, ...activityTypes], [activityTypes])
  const colorOf = (cat: string) => {
    const i = categories.indexOf(cat)
    return i < 0 ? SERIES_OTHER : seriesColor(i)
  }

  const stats = useMemo(() => computeOverallStats(sessions ?? []), [sessions])

  // Alle je absolvierten Uebungen mit ihren Vorkommen.
  const exercises = useMemo(() => computeExerciseHistory(sessions ?? []), [sessions])

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
  const stagnating = useMemo(() => computeStagnating(exercises), [exercises])

  const records = useMemo(() => computeRecords(exercises), [exercises])

  const dayBalance = useMemo(
    () =>
      computeDayBalance(sessions ?? [], activities ?? []).map((d, i) => ({
        ...d,
        color: seriesColor(i),
      })),
    [sessions, activities],
  )

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

  const activityCounts = useMemo(() => computeActivityCounts(activities ?? []), [activities])

  // Map statt Set, damit neben dem An/Aus-Zustand auch der zugeordnete
  // Trainingstag (dayName) verfuegbar ist.
  const dayActivities = useMemo(() => {
    const map = new Map<string, Activity>()
    if (dayOpen == null) return map
    const k = dayKey(dayOpen)
    for (const a of activities ?? []) if (dayKey(a.date) === k) map.set(a.type, a)
    return map
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
              <p className="mt-2 text-xs text-neutral-600">
                Enthält auch nicht getrackte Einheiten mit zugeordnetem
                Trainingstag (im Kalender pro Tag einstellbar).
              </p>
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

      {/* Für KI exportieren - bewusst ausserhalb von exportRef (sonst im
          Statistik-Bild enthalten) und immer sichtbar, auch bei leerer DB. */}
      <div className="px-4 pb-4">
        <section className="card">
          <h2 className="mb-1 font-bold">Für KI exportieren</h2>
          <p className="mb-3 text-xs text-muted">
            Erzeugt eine Textdatei mit Anweisungen + deinen Trainingsdaten zum
            manuellen Einfügen in ChatGPT, Claude, Gemini o. Ä. Keine
            KI-Anbindung in der App.
          </p>
          <button
            className="btn-ghost w-full"
            onClick={() => setAiQuestionsOpen(true)}
          >
            Fragen verwalten ({aiQuestions.length})
          </button>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button className="btn-ghost" onClick={copyForAi}>
              Kopieren
            </button>
            <button className="btn-primary" onClick={exportForAi} disabled={aiExporting}>
              {aiExporting ? 'Erstelle…' : 'Exportieren'}
            </button>
          </div>
          {aiCopyMsg ? <p className="mt-2 text-center text-xs text-muted">{aiCopyMsg}</p> : null}
        </section>
      </div>

      {/* KI-Export: Fragen verwalten */}
      <Sheet
        open={aiQuestionsOpen}
        onClose={() => setAiQuestionsOpen(false)}
        title="Fragen für die KI"
      >
        {aiQuestions.length > 0 ? (
          <ul className="mb-3 space-y-1">
            {aiQuestions.map((q, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2"
              >
                <span className="flex-1 text-sm">{q}</span>
                <button
                  className="p-1 text-neutral-500 active:text-red-400"
                  onClick={() => removeAiQuestion(i)}
                  aria-label="Entfernen"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-muted">
            Noch keine Fragen – werden im Export unter „Zusätzliche Fragen" an die
            KI mitgegeben.
          </p>
        )}
        <label className="label">Neue Frage</label>
        <input
          className="input"
          placeholder="z. B. Wie kann ich meine Schulterbeweglichkeit verbessern?"
          value={newAiQuestion}
          onChange={(e) => setNewAiQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addAiQuestion()}
        />
        <button className="btn-primary mt-3 w-full" onClick={addAiQuestion}>
          <PlusIcon className="h-5 w-5" /> Frage hinzufügen
        </button>
      </Sheet>

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
            const activity = dayActivities.get(t)
            const on = !!activity
            return (
              <div key={t}>
                <button
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

                {/* Trainingstag zuordnen - sonst fehlt diese Einheit in der
                    Trainingstag-Balance unten bzw. verfaelscht sie. Bereits
                    zugeordnete Einheiten bleiben auch nach Deaktivieren des
                    Typs entfernbar (nur neue Zuordnungen werden ausgeblendet). */}
                {on &&
                planDayNames.length > 0 &&
                (isDayAssignable(settings, t) || !!activity!.dayName) ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 pl-1">
                    {planDayNames.map((d) => {
                      const active = activity!.dayName === d
                      return (
                        <button
                          key={d}
                          className={
                            'rounded-md border px-2.5 py-1 text-xs font-medium ' +
                            (active
                              ? 'border-brand bg-brand/15 text-brand'
                              : 'border-line text-muted active:bg-white/10')
                          }
                          onClick={() =>
                            dayOpen != null &&
                            void setActivityDayName(dayOpen, t, active ? undefined : d)
                          }
                          aria-pressed={active}
                        >
                          {d}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        {activityTypes.some(
          (t) =>
            dayActivities.has(t) &&
            (isDayAssignable(settings, t) || !!dayActivities.get(t)?.dayName),
        ) && planDayNames.length > 0 ? (
          <p className="mt-2 text-xs text-neutral-600">
            Trainingstag zuordnen (optional), z. B. wenn ein Personal-Training
            einem Trainingstag aus deinem Plan entsprach – zählt sonst nicht in
            der Trainingstag-Balance mit.
          </p>
        ) : null}
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
