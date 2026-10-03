import { useMemo } from 'react'
import type { Exercise } from '../types'

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
        <div className="mt-2 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
          {suggestions.map((ex) => {
            const active = ex.id === selectedId || ex.name === value.trim()
            const inUse = excluded.has(ex.id)
            return (
              <button
                key={ex.id}
                type="button"
                className={
                  'chip' +
                  (active ? ' chip-active' : '') +
                  (inUse && !active ? ' opacity-60' : '')
                }
                onClick={() => {
                  onChange(ex.name)
                  onPick({ id: ex.id, name: ex.name })
                }}
              >
                {ex.name}
                {inUse ? <span className="ml-1 text-xs text-muted">· im Training</span> : null}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Keine Übungen gefunden – als neue anlegen.</p>
      )}
    </div>
  )
}
