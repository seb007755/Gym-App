import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { TopBar, EmptyState } from '../components/ui'
import { formatDate, formatDateSearch, formatDurationLong } from '../lib/format'
import { ChevronRight, ClockIcon, SearchIcon, XIcon } from '../components/icons'
import type { WorkoutSession } from '../types'

// Durchsuchbarer Text pro Training: Tagesname, Plan, Ort, Hersteller,
// Datum (kurz + voller Wochentag/Monat) und alle Uebungsnamen.
function searchText(s: WorkoutSession): string {
  const parts = [
    s.dayName ?? '',
    s.planName ?? '',
    s.location,
    s.equipmentManufacturer,
    formatDate(s.date),
    formatDateSearch(s.date),
    ...s.exercises.map((e) => e.name),
  ]
  return parts.join(' ').toLowerCase()
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const sessions = useLiveQuery(
    () => db.sessions.orderBy('date').reverse().toArray(),
    [],
  )
  const finished = useMemo(
    () => sessions?.filter((s) => s.finished) ?? [],
    [sessions],
  )

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return finished
    return finished.filter((s) => {
      const text = searchText(s)
      return terms.every((t) => text.includes(t))
    })
  }, [finished, query])

  return (
    <div>
      <TopBar title="Verlauf" />
      <div className="space-y-3 p-4">
        {finished.length > 0 ? (
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
            <input
              className="input pl-10 pr-10"
              type="search"
              inputMode="search"
              placeholder="Übung, Ort, Tag …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-500 active:text-neutral-300"
                onClick={() => setQuery('')}
                aria-label="Suche löschen"
              >
                <XIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        {sessions && finished.length === 0 ? (
          <EmptyState
            icon={<ClockIcon className="h-12 w-12" />}
            title="Noch keine Trainings"
            hint="Abgeschlossene Trainings erscheinen hier."
          />
        ) : null}

        {finished.length > 0 && results.length === 0 ? (
          <EmptyState
            icon={<SearchIcon className="h-12 w-12" />}
            title="Keine Treffer"
            hint={`Nichts gefunden für „${query.trim()}“.`}
          />
        ) : null}

        {results.map((s) => {
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
