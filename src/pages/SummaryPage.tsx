import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { toPng } from 'html-to-image'
import { db } from '../db'
import type { SessionExercise } from '../types'
import { TopBar, EmptyState } from '../components/ui'
import { formatDateTime, formatDurationLong } from '../lib/format'
import { DumbbellIcon, TrendDown, TrendFlat, TrendUp } from '../components/icons'

function doneSets(ex: SessionExercise) {
  return ex.sets.filter((s) => s.done && s.reps != null)
}

function volume(ex: SessionExercise): number {
  return doneSets(ex).reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0)
}

const PROG = {
  up: { label: 'steigern', Icon: TrendUp, color: 'text-success' },
  same: { label: 'halten', Icon: TrendFlat, color: 'text-neutral-400' },
  down: { label: 'reduzieren', Icon: TrendDown, color: 'text-brand' },
} as const

// "Fürs nächste Mal"-Zeile: Pfeil + Notiz.
export function NextTimeLine({ ex }: { ex: SessionExercise }) {
  if (!ex.progression && !ex.nextNote) return null
  const p = ex.progression ? PROG[ex.progression] : null
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
      <span className="text-neutral-600">Nächstes Mal:</span>
      {p ? (
        <span className={'inline-flex items-center gap-0.5 font-semibold ' + p.color}>
          <p.Icon className="h-3.5 w-3.5" /> {p.label}
        </span>
      ) : null}
      {ex.nextNote ? <span className="italic">„{ex.nextNote}"</span> : null}
    </p>
  )
}

export default function SummaryPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const session = useLiveQuery(() => db.sessions.get(sessionId!), [sessionId])
  const cardRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  if (session === undefined) return null
  if (!session) {
    return (
      <div>
        <TopBar title="Zusammenfassung" back={() => navigate('/')} />
        <EmptyState title="Training nicht gefunden" />
      </div>
    )
  }

  const exercisesWithSets = session.exercises.filter((e) => doneSets(e).length > 0)
  const totalVolume = exercisesWithSets.reduce((n, e) => n + volume(e), 0)

  async function saveImage() {
    if (!cardRef.current) return
    setSaving(true)
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#0a0a0a',
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `training-${new Date(session!.date).toISOString().slice(0, 10)}.png`
      a.click()
    } catch {
      alert('Bild konnte nicht erstellt werden. Nutze einfach einen Screenshot.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-8">
      <TopBar title="Zusammenfassung" back={() => navigate('/')} />

      <div className="p-4">
        {/* Screenshot-taugliche Karte: alles auf einer Karte, gut lesbar */}
        <div ref={cardRef} className="rounded-2xl bg-surface p-5">
          <div className="mb-4 flex items-center gap-2 border-b border-line pb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
              <DumbbellIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-bold leading-tight">
                {session.dayName ?? 'Freies Training'}
              </p>
              {session.planName ? (
                <p className="text-sm text-neutral-500">{session.planName}</p>
              ) : null}
            </div>
          </div>

          <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-neutral-500">Datum</dt>
              <dd className="font-medium">{formatDateTime(session.date)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Dauer</dt>
              <dd className="font-medium">{formatDurationLong(session.durationSeconds)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Ort</dt>
              <dd className="font-medium">{session.location || '—'}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Hersteller</dt>
              <dd className="font-medium">{session.equipmentManufacturer || '—'}</dd>
            </div>
          </dl>

          {exercisesWithSets.length === 0 ? (
            <p className="text-neutral-500">Keine abgehakten Sätze.</p>
          ) : (
            <div className="space-y-4">
              {exercisesWithSets.map((ex) => (
                <div key={ex.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <h3 className="font-bold">{ex.name}</h3>
                    <span className="text-xs text-neutral-500">
                      {Math.round(volume(ex))} kg·Wdh.
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {doneSets(ex).map((s, i) => (
                      <span
                        key={s.id}
                        className="rounded-lg bg-surface2 px-2.5 py-1 text-sm tabular-nums"
                      >
                        <span className="mr-1 text-xs text-neutral-500">{i + 1}</span>
                        {s.weight != null ? `${s.weight} kg` : '–'} × {s.reps}
                      </span>
                    ))}
                  </div>
                  {/* Satz-Kommentare */}
                  {doneSets(ex).some((s) => s.note) ? (
                    <ul className="mt-1 space-y-0.5">
                      {doneSets(ex).map((s, i) =>
                        s.note ? (
                          <li key={s.id} className="text-xs text-neutral-500">
                            <span className="text-neutral-600">Satz {i + 1}:</span> {s.note}
                          </li>
                        ) : null,
                      )}
                    </ul>
                  ) : null}
                  {/* Fürs nächste Mal */}
                  <NextTimeLine ex={ex} />
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-line pt-3 text-sm text-neutral-400">
            Gesamtvolumen ({session.equipmentManufacturer || 'gerätespez.'}):{' '}
            <span className="font-semibold text-neutral-200 tabular-nums">
              {Math.round(totalVolume).toLocaleString('de-DE')} kg·Wdh.
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="btn-ghost" onClick={saveImage} disabled={saving}>
            {saving ? 'Erstelle…' : 'Als Bild speichern'}
          </button>
          <button className="btn-primary" onClick={() => navigate('/')}>
            Fertig
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-neutral-600">
          Tipp: Screenshot machen und dem Trainer schicken.
        </p>
      </div>
    </div>
  )
}
