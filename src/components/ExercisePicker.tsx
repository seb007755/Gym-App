import { useMemo } from 'react'
import type { Exercise } from '../types'
import { CheckIcon } from './icons'

// Vereinheitlichter "bekannte Uebung waehlen ODER neue eintippen"-Baustein.
// Content-only: wird in einen bereits offenen Sheet eingebettet, schliesst
// nichts selbst. Bei leerem Textfeld zeigt sie trotzdem eine Liste (statt
// nichts), damit eine vergessene/geloeschte Uebung wiedergefunden werden kann.
export interface ExercisePickerProps {
  exercises: Exercise[]
  value: string
  onChange: (text: string) => void
  onPick: (exercise: { id: string; name: string }) => void
  selectedId?: string
  // Bereits im Training vorhandene Uebungen -> visuell markieren statt
  // verstecken (der Nutzer darf dieselbe Uebung bewusst doppelt waehlen).
  excludeIds?: string[]
  maxSuggestions?: number
  onEnter?: () => void
}

export function ExercisePicker({
  exercises,
  value,
  onChange,
  onPick,
  selectedId,
  excludeIds,
  maxSuggestions = 20,
  onEnter,
}: ExercisePickerProps) {
  const excluded = useMemo(() => new Set(excludeIds ?? []), [excludeIds])

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase()
    const sorted = [...exercises].sort((a, b) => a.name.localeCompare(b.name))
    const filtered = q
      ? sorted.filter((e) => e.name.toLowerCase().includes(q))
      : sorted
    return filtered.slice(0, maxSuggestions)
  }, [exercises, value, maxSuggestions])

  return (
    <div>
      <label className="label">Übung</label>
      <input
        className="input"
        autoFocus
        placeholder="z. B. Bankdrücken"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
      {suggestions.length > 0 ? (
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {suggestions.map((ex) => {
            const active = ex.id === selectedId || ex.name === value.trim()
            const inUse = excluded.has(ex.id)
            return (
              <li key={ex.id}>
                <button
                  type="button"
                  className={'chip w-full justify-start gap-3 py-2.5 ' + (active ? 'chip-active' : '')}
                  onClick={() => {
                    onChange(ex.name)
                    onPick({ id: ex.id, name: ex.name })
                  }}
                  aria-pressed={active}
                >
                  <span
                    className={
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded border ' +
                      (active ? 'border-current bg-current' : 'border-line')
                    }
                  >
                    {active ? <CheckIcon className="h-3.5 w-3.5 text-white" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{ex.name}</span>
                  {inUse ? <span className="shrink-0 text-xs text-muted">im Training</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Keine Übungen gefunden – als neue anlegen.</p>
      )}
    </div>
  )
}
