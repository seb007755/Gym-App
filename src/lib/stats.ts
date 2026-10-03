// Reine Berechnungs-Funktionen aus StatsPage extrahiert, damit sowohl die
// Statistik-Seite als auch der KI-Export (lib/aiExport.ts) dieselbe Logik
// nutzen koennen, ohne sie zu duplizieren. Reines Refactoring - Verhalten
// bleibt identisch zur bisherigen StatsPage-internen Berechnung.
import { exKey } from '../db'
import type { Activity, SessionExercise, WorkoutSession } from '../types'

export interface Occurrence {
  session: WorkoutSession
  ex: SessionExercise
  top: number
}

export type ExerciseEntry = [string, { name: string; occ: Occurrence[] }]

// Schwerster abgehakter Satz einer Uebung - die Kennzahl fuer "wird es mehr?".
export function topWeight(ex: SessionExercise): number | null {
  const w = ex.sets.filter((s) => s.done).map((s) => s.weight ?? 0)
  return w.length ? Math.max(...w) : null
}

export function doneReps(ex: SessionExercise, weight: number): number | null {
  const hit = ex.sets.find((s) => s.done && (s.weight ?? 0) === weight)
  return hit?.reps ?? null
}

export function computeOverallStats(sessions: WorkoutSession[]): {
  last: WorkoutSession
  longest: WorkoutSession
  totalSeconds: number
  locations: number
} | null {
  if (sessions.length === 0) return null
  const desc = [...sessions].sort((a, b) => b.date - a.date)
  const longest = [...sessions].sort((a, b) => b.durationSeconds - a.durationSeconds)[0]
  return {
    last: desc[0],
    longest,
    totalSeconds: sessions.reduce((n, s) => n + s.durationSeconds, 0),
    locations: new Set(sessions.map((s) => s.location.trim()).filter(Boolean)).size,
  }
}

// Alle je absolvierten Uebungen mit ihren Vorkommen, neuestes zuerst.
export function computeExerciseHistory(sessions: WorkoutSession[]): ExerciseEntry[] {
  const map = new Map<string, { name: string; occ: Occurrence[] }>()
  for (const s of sessions) {
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
}

// Stagnation: seit wie vielen Einheiten am selben Hersteller kein neues
// Hoechstgewicht mehr? Der Hersteller-Filter verhindert Fehlalarme durch
// Geraetewechsel.
export function computeStagnating(exercises: ExerciseEntry[]): {
  name: string
  manufacturer: string
  weight: number
  streak: number
  note?: string
}[] {
  const out: ReturnType<typeof computeStagnating> = []
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
}

// Hoechstes abgehaktes Gewicht je Uebung.
export function computeRecords(exercises: ExerciseEntry[]): {
  name: string
  weight: number
  reps: number | null
  date: number
  where: string
  manufacturer: string
}[] {
  return exercises
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
    .sort((a, b) => b.weight - a.weight)
}

// Trainingstag-Balance: getrackte Sessions + nicht getrackte Einheiten mit
// zugeordnetem Trainingstag zaehlen gemeinsam, sonst wuerde die Balance durch
// fehlende Personal-/Lauf-Trainings verfaelscht.
export function computeDayBalance(
  sessions: WorkoutSession[],
  activities: Activity[],
): { label: string; value: number }[] {
  const counts = new Map<string, number>()
  for (const s of sessions) {
    const k = s.dayName ?? 'Freies Training'
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  for (const a of activities) {
    if (a.dayName) counts.set(a.dayName, (counts.get(a.dayName) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))
}

export function computeActivityCounts(activities: Activity[]): Map<string, number> {
  const c = new Map<string, number>()
  for (const a of activities) c.set(a.type, (c.get(a.type) ?? 0) + 1)
  return c
}
