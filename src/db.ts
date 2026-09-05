import Dexie, { type Table } from 'dexie'
import type {
  Activity,
  AppSettings,
  Exercise,
  Plan,
  PlanExercise,
  PrefillTier,
  SessionExercise,
  SetLog,
  WorkoutSession,
} from './types'
import {
  DEFAULT_BODY_WEIGHT_KG,
  DEFAULT_MET,
  calcCalories,
} from './lib/calories'

// Alles rein lokal in IndexedDB. Keine Netzwerkuebertragung.
export class GymDB extends Dexie {
  exercises!: Table<Exercise, string>
  plans!: Table<Plan, string>
  sessions!: Table<WorkoutSession, string>
  settings!: Table<AppSettings, string>
  activities!: Table<Activity, string>

  constructor() {
    super('gym-tracker')
    this.version(1).stores({
      exercises: 'id, name',
      plans: 'id, createdAt',
      // finished + date fuer schnelle Verlaufs-/Aktiv-Abfragen
      sessions: 'id, date, finished',
      settings: 'key',
    })
    // v2 fuegt nur eine Tabelle hinzu; die bestehenden erbt Dexie unveraendert,
    // vorhandene Daten werden nicht angefasst.
    this.version(2).stores({
      activities: 'id, date, type',
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

export const DEFAULT_REST_SECONDS = 60
export const DEFAULT_ACTIVITY_TYPES = ['Personal-Training', 'Lauf-Training']
// Saetze fuer eine Uebung, zu der es noch keinerlei Historie gibt.
export const DEFAULT_SET_COUNT = 3

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
    locationManufacturers: {},
    restSeconds: DEFAULT_REST_SECONDS,
    bodyWeightKg: DEFAULT_BODY_WEIGHT_KG,
    metValue: DEFAULT_MET,
    activityTypes: [...DEFAULT_ACTIVITY_TYPES],
  }
}

// ---- Nicht getrackte Einheiten (Personal-Training, Lauf …) ----

export function dayStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export async function toggleActivity(ts: number, type: string): Promise<void> {
  const start = dayStart(ts)
  const id = `${dayKey(start)}|${type}`
  const existing = await db.activities.get(id)
  if (existing) await db.activities.delete(id)
  else await db.activities.put({ id, date: start, type })
}

export function locationKey(location: string): string {
  return location.trim().toLowerCase()
}

// Der Hersteller haengt am Ort und wird nur einmalig beim Anlegen gesetzt.
export function manufacturerForLocation(
  settings: AppSettings,
  location: string,
): string {
  return settings.locationManufacturers?.[locationKey(location)] ?? ''
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
  // Ort -> Hersteller nur beim ERSTEN Mal festschreiben. Spaetere Aenderungen
  // laufen ausschliesslich ueber setLocationManufacturer (Einstellungen).
  const map = { ...(s.locationManufacturers ?? {}) }
  const key = locationKey(location)
  if (key && manufacturer && !map[key]) map[key] = manufacturer

  await saveSettings({
    locations,
    manufacturers,
    locationManufacturers: map,
    lastLocation: location || s.lastLocation,
    lastManufacturer: manufacturer || s.lastManufacturer,
  })
}

export async function setLocationManufacturer(
  location: string,
  manufacturer: string,
): Promise<void> {
  const s = await getSettings()
  const key = locationKey(location)
  if (!key) return
  const manufacturers = manufacturer && !s.manufacturers.includes(manufacturer)
    ? [...s.manufacturers, manufacturer]
    : s.manufacturers
  await saveSettings({
    manufacturers,
    locationManufacturers: {
      ...(s.locationManufacturers ?? {}),
      [key]: manufacturer,
    },
  })
}

// Einmalige Datenmigration auf v2. Laeuft beim App-Start und nach jedem Import.
// Bewusst ausserhalb von useLiveQuery aufrufen - Schreibzugriffe im
// liveQuery-Kontext werfen in Dexie einen ReadOnlyError.
export async function runMigrations(force = false): Promise<void> {
  const s = await getSettings()
  // force: nach einem Import koennen wieder unmigrierte Alt-Daten drinstehen,
  // selbst wenn das Flag aus den aktuellen Einstellungen erhalten geblieben ist.
  if (s.migratedV2At && !force) return

  const sessions = await db.sessions.toArray()
  const finishedDesc = sessions
    .filter((x) => x.finished)
    .sort((a, b) => b.date - a.date)

  // 1) Hersteller je Ort aus dem Verlauf ableiten (juengste Session gewinnt).
  const map = { ...(s.locationManufacturers ?? {}) }
  for (const sess of finishedDesc) {
    const key = locationKey(sess.location)
    if (key && sess.equipmentManufacturer && !map[key]) {
      map[key] = sess.equipmentManufacturer
    }
  }

  const bodyWeightKg = s.bodyWeightKg ?? DEFAULT_BODY_WEIGHT_KG
  const metValue = s.metValue ?? DEFAULT_MET

  // 2) Kalorien fuer Alt-Sessions einmalig nachrechnen und einfrieren.
  const patched = finishedDesc
    .filter((x) => x.calories == null)
    .map((x) => ({
      ...x,
      calories: calcCalories(metValue, bodyWeightKg, x.durationSeconds),
      calcBodyWeightKg: bodyWeightKg,
      calcMet: metValue,
    }))
  if (patched.length) await db.sessions.bulkPut(patched)

  await saveSettings({
    locationManufacturers: map,
    restSeconds: s.restSeconds ?? DEFAULT_REST_SECONDS,
    bodyWeightKg,
    metValue,
    migratedV2At: Date.now(),
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
export function exKey(name: string, exerciseId?: string): string {
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

interface PrefillHit {
  ex: SessionExercise
  tier: PrefillTier
  manufacturer: string
}

// WASSERFALL: waehlt die Quelle fuer die Vorbelegung nach Prioritaet.
// Prio 1 exakter Match  -> letztes Training am selben Ort
// Prio 2 Hersteller     -> letztes Training mit gleichem Hersteller (ortsunabhaengig)
// Prio 3 anderer Hersteller -> letztes Training ueberhaupt, nur als Richtwert
// (die UI markiert Prio 3 als "neu kalibrieren").
function pickPrefillSource(
  finishedDesc: WorkoutSession[],
  key: string,
  location: string,
  manufacturer: string,
): PrefillHit | undefined {
  const hit = (s: WorkoutSession, tier: PrefillTier): PrefillHit => ({
    ex: findEx(s, key)!,
    tier,
    manufacturer: s.equipmentManufacturer,
  })

  const loc = locationKey(location)
  if (loc) {
    const bySameLocation = finishedDesc.find(
      (s) => locationKey(s.location) === loc && findEx(s, key),
    )
    if (bySameLocation) return hit(bySameLocation, 'location')
  }
  if (manufacturer.trim()) {
    const bySameManufacturer = finishedDesc.find(
      (s) => s.equipmentManufacturer === manufacturer && findEx(s, key),
    )
    if (bySameManufacturer) return hit(bySameManufacturer, 'manufacturer')
  }
  const anyLast = finishedDesc.find((s) => findEx(s, key))
  return anyLast ? hit(anyLast, 'other') : undefined
}

// Baut eine Session-Uebung samt Wasserfall-Vorbelegung.
// `targets` kommt aus dem Plan; ohne Plan bestimmt die Wasserfall-Quelle die
// Satzanzahl (Antwort auf "Set-Template ohne Plan: aus letzter Session ableiten").
function buildExercise(opts: {
  name: string
  exerciseId?: string
  note?: string
  planExerciseId?: string
  targets?: { reps: number | null; weight?: number }[]
  finishedDesc: WorkoutSession[]
  location: string
  manufacturer: string
}): SessionExercise {
  const key = exKey(opts.name, opts.exerciseId)
  const source = pickPrefillSource(
    opts.finishedDesc,
    key,
    opts.location,
    opts.manufacturer,
  )

  const targets: { reps: number | null; weight?: number }[] =
    opts.targets ??
    Array.from(
      { length: source?.ex.sets.length || DEFAULT_SET_COUNT },
      (_, i) => ({ reps: source?.ex.sets[i]?.reps ?? null }),
    )

  const sets: SetLog[] = targets.map((t, i) => {
    const prev = source?.ex.sets[i]
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
    exerciseId: opts.exerciseId,
    name: opts.name,
    note: opts.note,
    planExerciseId: opts.planExerciseId,
    sets,
    // Der Hinweis folgt derselben Wasserfall-Quelle wie die Werte.
    hintProgression: source?.ex.progression ?? null,
    hintNote: source?.ex.nextNote,
    prefillTier: source?.tier,
    prefillManufacturer: source?.manufacturer,
  }
}

function buildSessionExercise(
  pe: PlanExercise,
  finishedDesc: WorkoutSession[],
  location: string,
  manufacturer: string,
): SessionExercise {
  return buildExercise({
    name: pe.name,
    exerciseId: pe.exerciseId,
    note: pe.note,
    planExerciseId: pe.id,
    targets: targetsFor(pe),
    finishedDesc,
    location,
    manufacturer,
  })
}

// Uebung ohne Plan-Eintrag (freies Training, "Uebung ergaenzen").
export async function buildAdHocExercise(
  name: string,
  exerciseId: string | undefined,
  location: string,
  manufacturer: string,
): Promise<SessionExercise> {
  const finishedDesc = await finishedSessionsDesc()
  return buildExercise({
    name,
    exerciseId,
    finishedDesc,
    location,
    manufacturer,
  })
}

async function finishedSessionsDesc(): Promise<WorkoutSession[]> {
  const all = await db.sessions.filter((s) => s.finished).toArray()
  return all.sort((a, b) => b.date - a.date)
}

export async function startSession(opts: {
  plan?: Plan | null
  planDayId?: string | null
  location: string
  manufacturer: string
  // Freies Training: vorab ausgewaehlte Uebungen ohne Plan-Bezug.
  adHocExercises?: { name: string; exerciseId?: string }[]
}): Promise<WorkoutSession> {
  const now = Date.now()
  let exercises: SessionExercise[] = []
  let planName: string | undefined
  let dayName: string | undefined

  // Verlauf einmal laden (fuer Vorbelegung + Gedaechtnis-Hinweise).
  const finishedDesc = await finishedSessionsDesc()

  if (opts.plan && opts.planDayId) {
    const day = opts.plan.days.find((d) => d.id === opts.planDayId)
    planName = opts.plan.name
    dayName = day?.name
    // Uebungen aus dem Plan KOPIEREN (keine Referenz -> freie Abweichung),
    // Gewichte aus dem passenden letzten Training vorbelegen.
    exercises = (day?.exercises ?? []).map((pe) =>
      buildSessionExercise(pe, finishedDesc, opts.location, opts.manufacturer),
    )
  } else if (opts.adHocExercises?.length) {
    exercises = opts.adHocExercises.map((e) =>
      buildExercise({
        name: e.name,
        exerciseId: e.exerciseId,
        finishedDesc,
        location: opts.location,
        manufacturer: opts.manufacturer,
      }),
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

// ---- Satz-Templates (Regel A/B) ----

async function updatePlanExercise(
  planId: string | null,
  planDayId: string | null,
  planExerciseId: string,
  fn: (pe: PlanExercise) => PlanExercise,
): Promise<void> {
  if (!planId || !planDayId) return
  const plan = await db.plans.get(planId)
  if (!plan) return
  await db.plans.put({
    ...plan,
    days: plan.days.map((d) =>
      d.id !== planDayId
        ? d
        : {
            ...d,
            exercises: d.exercises.map((pe) =>
              pe.id === planExerciseId ? fn(pe) : pe,
            ),
          },
    ),
  })
}

function withSetCount(pe: PlanExercise, count: number): PlanExercise {
  const n = Math.max(1, count)
  if (!pe.customSets?.length) return { ...pe, targetSets: n }
  const last = pe.customSets[pe.customSets.length - 1]
  const customSets = Array.from(
    { length: n },
    (_, i) => pe.customSets![i] ?? { ...last },
  )
  return { ...pe, targetSets: n, customSets }
}

// Regel B "Dauerhaft": Ziel-Volumen nach unten korrigieren.
export async function shrinkSetTemplate(
  session: WorkoutSession,
  planExerciseId: string,
  newCount: number,
): Promise<void> {
  await updatePlanExercise(
    session.planId,
    session.planDayId,
    planExerciseId,
    (pe) => (newCount < pe.targetSets ? withSetCount(pe, newCount) : pe),
  )
}

// Regel A: ein zusaetzlich ABGEHAKTER Satz wird zum neuen Ziel-Volumen.
async function growSetTemplates(s: WorkoutSession): Promise<void> {
  for (const ex of s.exercises) {
    if (!ex.planExerciseId) continue
    const done = ex.sets.filter((x) => x.done).length
    await updatePlanExercise(s.planId, s.planDayId, ex.planExerciseId, (pe) =>
      done > pe.targetSets ? withSetCount(pe, done) : pe,
    )
  }
}

export async function finishSession(id: string): Promise<void> {
  const s = await db.sessions.get(id)
  if (!s) return
  const end = Date.now()
  const settings = await getSettings()
  const bodyWeightKg = settings.bodyWeightKg ?? DEFAULT_BODY_WEIGHT_KG
  const metValue = settings.metValue ?? DEFAULT_MET
  // Dauer aus Zeitstempeln -> Backgrounding verfaelscht nicht.
  const durationSeconds = Math.max(0, Math.round((end - s.startTime) / 1000))

  const finished: WorkoutSession = {
    ...s,
    finished: true,
    endTime: end,
    durationSeconds,
    // Eingefroren: spaetere Aenderungen an Gewicht/MET wirken nicht rueckwirkend.
    calories: calcCalories(metValue, bodyWeightKg, durationSeconds),
    calcBodyWeightKg: bodyWeightKg,
    calcMet: metValue,
  }
  await db.sessions.put(finished)
  await growSetTemplates(finished)
}

export async function discardSession(id: string): Promise<void> {
  await db.sessions.delete(id)
}
