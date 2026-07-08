import Dexie, { type Table } from 'dexie'
import type {
  AppSettings,
  Exercise,
  Plan,
  PlanExercise,
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

function defaultSettings(): AppSettings {
  return {
    key: SETTINGS_KEY,
    locations: [],
    manufacturers: [...DEFAULT_MANUFACTURERS],
    lastLocation: '',
    lastManufacturer: '',
  }
}

// NUR-LESEN: darf gefahrlos in useLiveQuery laufen. Schreibt nie in die DB
// (ein Schreibzugriff im liveQuery-Kontext wirft in Dexie ReadOnlyError).
// Fehlt der Datensatz, werden Defaults geliefert; persistiert wird erst bei
// der ersten echten Aenderung ueber saveSettings().
export async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.get(SETTINGS_KEY)
  return s ?? defaultSettings()
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

// ---- Trainings-Gedaechtnis / Gewichts-Vorbelegung ----

// Uebung uebergreifend identifizieren (bevorzugt per Stammdaten-Id, sonst Name).
function exKey(name: string, exerciseId?: string): string {
  return exerciseId ? 'id:' + exerciseId : 'name:' + name.trim().toLowerCase()
}

function findEx(s: WorkoutSession, key: string): SessionExercise | undefined {
  return s.exercises.find((e) => exKey(e.name, e.exerciseId) === key)
}

// Ziel-Saetze aus dem Plan (individuell oder einfach).
function targetsFor(pe: PlanExercise): { reps: number | null; weight?: number }[] {
  if (pe.customSets && pe.customSets.length) {
    return pe.customSets.map((c) => ({ reps: c.reps, weight: c.weight }))
  }
  const n = Math.max(1, pe.targetSets || 1)
  return Array.from({ length: n }, () => ({
    reps: pe.targetReps ?? null,
    weight: pe.targetWeight,
  }))
}

// Waehlt die Quelle fuer die Gewichts-Vorbelegung nach Prioritaet:
// 1) letztes Training am selben Ort  2) letztes mit gleichem Hersteller
// 3) letztes Training ueberhaupt — jeweils, das die Uebung enthaelt.
function pickPrefillSource(
  finishedDesc: WorkoutSession[],
  key: string,
  location: string,
  manufacturer: string,
): SessionExercise | undefined {
  const loc = location.trim().toLowerCase()
  if (loc) {
    const bySameLocation = finishedDesc.find(
      (s) => s.location.trim().toLowerCase() === loc && findEx(s, key),
    )
    if (bySameLocation) return findEx(bySameLocation, key)
  }
  if (manufacturer.trim()) {
    const bySameManufacturer = finishedDesc.find(
      (s) => s.equipmentManufacturer === manufacturer && findEx(s, key),
    )
    if (bySameManufacturer) return findEx(bySameManufacturer, key)
  }
  const anyLast = finishedDesc.find((s) => findEx(s, key))
  return anyLast ? findEx(anyLast, key) : undefined
}

function buildSessionExercise(
  pe: PlanExercise,
  finishedDesc: WorkoutSession[],
  location: string,
  manufacturer: string,
): SessionExercise {
  const key = exKey(pe.name, pe.exerciseId)
  const source = pickPrefillSource(finishedDesc, key, location, manufacturer)
  // Hinweis (Pfeil + Notiz) immer vom zuletzt absolvierten Mal dieser Uebung.
  const lastEver = finishedDesc.find((s) => findEx(s, key))
  const hintEx = lastEver ? findEx(lastEver, key) : undefined

  const sets: SetLog[] = targetsFor(pe).map((t, i) => {
    const prev = source?.sets[i]
    const prevWeight = prev?.weight ?? null
    const prevReps = prev?.reps ?? null
    // Letztes Training ueberschreibt den Plan-Standardwert beim Gewicht.
    const weight = prevWeight != null ? prevWeight : t.weight ?? null
    return {
      id: uid(),
      weight,
      reps: t.reps ?? null,
      done: false,
      prevWeight,
      prevReps,
    }
  })

  return {
    id: uid(),
    exerciseId: pe.exerciseId,
    name: pe.name,
    note: pe.note,
    sets,
    hintProgression: hintEx?.progression ?? null,
    hintNote: hintEx?.nextNote,
  }
}

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

  // Verlauf einmal laden (fuer Vorbelegung + Gedaechtnis-Hinweise).
  const finishedDesc = (await db.sessions.filter((s) => s.finished).toArray()).sort(
    (a, b) => b.date - a.date,
  )

  if (opts.plan && opts.planDayId) {
    const day = opts.plan.days.find((d) => d.id === opts.planDayId)
    planName = opts.plan.name
    dayName = day?.name
    // Uebungen aus dem Plan KOPIEREN (keine Referenz -> freie Abweichung),
    // Gewichte aus dem passenden letzten Training vorbelegen.
    exercises = (day?.exercises ?? []).map((pe) =>
      buildSessionExercise(pe, finishedDesc, opts.location, opts.manufacturer),
    )
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
