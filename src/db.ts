import Dexie, { type Table } from 'dexie'
import type {
  AppSettings,
  Exercise,
  Plan,
  SessionExercise,
  SetLog,
  WorkoutSession,
} from './types'

// Alles rein lokal in IndexedDB. Keine Netzwerkuebertragung.
export class GymDB extends Dexie {
  exercises!: Table<Exercise, string>
  plans!: Table<Plan, string>
  sessions!: Table<WorkoutSession, string>
  settings!: Table<AppSettings, string>

  constructor() {
    super('gym-tracker')
    this.version(1).stores({
      exercises: 'id, name',
      plans: 'id, createdAt',
      // finished + date fuer schnelle Verlaufs-/Aktiv-Abfragen
      sessions: 'id, date, finished',
      settings: 'key',
    })
  }
}

export const db = new GymDB()

export const DEFAULT_MANUFACTURERS = [
  'Technogym',
  'Life Fitness',
  'Hammer Strength',
  'Gym80',
  'Freihantel',
]

const SETTINGS_KEY = 'app'

export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
  )
}

export async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.get(SETTINGS_KEY)
  if (s) return s
  const fresh: AppSettings = {
    key: SETTINGS_KEY,
    locations: [],
    manufacturers: [...DEFAULT_MANUFACTURERS],
    lastLocation: '',
    lastManufacturer: '',
  }
  await db.settings.put(fresh)
  return fresh
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const cur = await getSettings()
  await db.settings.put({ ...cur, ...patch, key: SETTINGS_KEY })
}

export async function rememberLocationManufacturer(
  location: string,
  manufacturer: string,
): Promise<void> {
  const s = await getSettings()
  const locations = location && !s.locations.includes(location)
    ? [...s.locations, location]
    : s.locations
  const manufacturers = manufacturer && !s.manufacturers.includes(manufacturer)
    ? [...s.manufacturers, manufacturer]
    : s.manufacturers
  await saveSettings({
    locations,
    manufacturers,
    lastLocation: location || s.lastLocation,
    lastManufacturer: manufacturer || s.lastManufacturer,
  })
}

// ---- Exercises: als Autocomplete-Stamm pflegen ----
export async function upsertExerciseByName(name: string): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) return uid()
  const existing = await db.exercises
    .filter((e) => e.name.toLowerCase() === trimmed.toLowerCase())
    .first()
  if (existing) return existing.id
  const id = uid()
  await db.exercises.put({ id, name: trimmed })
  return id
}

// ---- Aktive Session ----
export async function getActiveSession(): Promise<WorkoutSession | undefined> {
  // Dexie speichert Boolean nicht indexierbar zuverlaessig -> filtern.
  return db.sessions.filter((s) => s.finished === false).last()
}

function newSet(): SetLog {
  return { id: uid(), weight: null, reps: null, done: false }
}

export function makeSetsFromTarget(count: number, weight?: number): SetLog[] {
  const n = Math.max(1, count || 1)
  return Array.from({ length: n }, () => ({
    ...newSet(),
    weight: weight ?? null,
  }))
}

export { newSet }

export async function startSession(opts: {
  plan?: Plan | null
  planDayId?: string | null
  location: string
  manufacturer: string
}): Promise<WorkoutSession> {
  const now = Date.now()
  let exercises: SessionExercise[] = []
  let planName: string | undefined
  let dayName: string | undefined

  if (opts.plan && opts.planDayId) {
    const day = opts.plan.days.find((d) => d.id === opts.planDayId)
    planName = opts.plan.name
    dayName = day?.name
    // Uebungen aus dem Plan KOPIEREN (keine Referenz -> freie Abweichung)
    exercises = (day?.exercises ?? []).map((pe) => ({
      id: uid(),
      exerciseId: pe.exerciseId,
      name: pe.name,
      note: pe.note,
      sets: makeSetsFromTarget(pe.targetSets, pe.targetWeight),
    }))
  }

  const session: WorkoutSession = {
    id: uid(),
    date: now,
    startTime: now,
    endTime: null,
    durationSeconds: 0,
    location: opts.location,
    equipmentManufacturer: opts.manufacturer,
    planId: opts.plan?.id ?? null,
    planDayId: opts.planDayId ?? null,
    planName,
    dayName,
    exercises,
    finished: false,
  }
  await db.sessions.put(session)
  await rememberLocationManufacturer(opts.location, opts.manufacturer)
  return session
}

export async function updateSession(
  id: string,
  updater: (s: WorkoutSession) => WorkoutSession,
): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id)
    if (!s) return
    await db.sessions.put(updater(s))
  })
}

export async function finishSession(id: string): Promise<void> {
  const s = await db.sessions.get(id)
  if (!s) return
  const end = Date.now()
  await db.sessions.put({
    ...s,
    finished: true,
    endTime: end,
    // Dauer aus Zeitstempeln -> Backgrounding verfaelscht nicht.
    durationSeconds: Math.max(0, Math.round((end - s.startTime) / 1000)),
  })
}

export async function discardSession(id: string): Promise<void> {
  await db.sessions.delete(id)
}
