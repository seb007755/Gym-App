import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { TopBar, Confirm, EmptyState } from '../components/ui'
import { formatDateTime, formatDurationLong } from '../lib/format'
import { TrashIcon } from '../components/icons'

export default function HistoryDetailPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const session = useLiveQuery(() => db.sessions.get(sessionId!), [sessionId])
  const [confirmDel, setConfirmDel] = useState(false)

  if (session === undefined) return null
  if (!session) {
    return (
      <div>
        <TopBar title="Training" back />
        <EmptyState title="Training nicht gefunden" />
      </div>
    )
  }

  async function del() {
    await db.sessions.delete(session!.id)
    navigate('/history', { replace: true })
  }

  return (
    <div>
      <TopBar
        title={session.dayName ?? 'Freies Training'}
        back
        right={
          <button
            className="btn-ghost h-10 w-10 rounded-full p-0 text-neutral-400"
            onClick={() => setConfirmDel(true)}
            aria-label="Löschen"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        }
      />

      <div className="space-y-4 p-4">
        <div className="card">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
        </div>

        {session.exercises.map((ex) => {
          const done = ex.sets.filter((s) => s.done)
          return (
            <div key={ex.id} className="card">
              <h3 className="mb-2 font-bold">{ex.name}</h3>
              {done.length === 0 ? (
                <p className="text-sm text-neutral-500">Keine abgehakten Sätze.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {done.map((s, i) => (
                    <span
                      key={s.id}
                      className="rounded-lg bg-surface2 px-2.5 py-1 text-sm tabular-nums"
                    >
                      <span className="mr-1 text-xs text-neutral-500">{i + 1}</span>
                      {s.weight != null ? `${s.weight} kg` : '–'} × {s.reps ?? '–'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <button
          className="btn-ghost w-full"
          onClick={() => navigate(`/summary/${session.id}`)}
        >
          Zusammenfassung anzeigen
        </button>
      </div>

      <Confirm
        open={confirmDel}
        title="Training löschen?"
        message="Dieses Training wird dauerhaft aus dem Verlauf entfernt."
        onConfirm={del}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  )
}
