import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { TopBar, EmptyState } from '../components/ui'
import { formatDate, formatDurationLong } from '../lib/format'
import { ChevronRight, ClockIcon } from '../components/icons'

export default function HistoryPage() {
  const navigate = useNavigate()
  const sessions = useLiveQuery(
    () => db.sessions.orderBy('date').reverse().toArray(),
    [],
  )
  const finished = sessions?.filter((s) => s.finished) ?? []

  return (
    <div>
      <TopBar title="Verlauf" />
      <div className="space-y-3 p-4">
        {sessions && finished.length === 0 ? (
          <EmptyState
            icon={<ClockIcon className="h-12 w-12" />}
            title="Noch keine Trainings"
            hint="Abgeschlossene Trainings erscheinen hier."
          />
        ) : null}

        {finished.map((s) => {
          const sets = s.exercises.reduce(
            (n, e) => n + e.sets.filter((x) => x.done).length,
            0,
          )
          return (
            <button
              key={s.id}
              className="card flex w-full items-center gap-3 text-left"
              onClick={() => navigate(`/history/${s.id}`)}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {s.dayName ?? 'Freies Training'}
                </p>
                <p className="text-sm text-neutral-400">{formatDate(s.date)}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {s.location ? s.location + ' · ' : ''}
                  {s.equipmentManufacturer} · {formatDurationLong(s.durationSeconds)} ·{' '}
                  {sets} Sätze
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-neutral-600" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
