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

const DAY_MS = 24 * 60 * 60 * 1000
// Ab wann ein Orts-/Kontinuitaets-Treffer als "veraltet" gilt und ein
// Home-Gym-Vorschlag ueberhaupt in Frage kommt (Punkt 2).
export const STALE_THRESHOLD_DAYS = 90
// Mindestanzahl Datenpunkte am Home-Gym, bevor eine Steigerungsrate als
// verlaesslich gilt.
const HOME_GYM_MIN_POINTS = 3
// Sicherheitsobergrenze gegen Ausreisser bei wenigen/verrauschten Daten.
const HOME_GYM_GROWTH_CAP = 1.5

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

// Ordnet einer bereits angehakten Einheit einen Trainingstag zu (z.B. "Push"),
// damit sie in der Trainingstag-Balance mitzaehlt statt sie zu verfaelschen.
export async function setActivityDayName(
  ts: number,
  type: string,
  dayName: string | undefined,
): Promise<void> {
  const id = `${dayKey(dayStart(ts))}|${type}`
  const existing = await db.activities.get(id)
  if (!existing) return
  await db.activities.put({ ...existing, dayName })
}

// Ob fuer einen Einheit-Typ ueberhaupt eine Trainingstag-Zuordnung angeboten
// wird. Ohne gespeicherten Wert: an fuer alle Typen ausser Lauf-Training
// (sinnvoller Default, vom Nutzer so gewuenscht).
export function isDayAssignable(
  settings: AppSettings | undefined,
  type: string,
): boolean {
  const stored = settings?.activityDayAssignable?.[type]
  if (stored != null) return stored
  return type !== 'Lauf-Training'
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

// Home-Gym (Punkt 2): manuell gewaehlter Ort, sonst automatisch der Ort mit
// den meisten abgeschlossenen Sessions. Faellt auch zurueck, wenn der manuell
// gewaehlte Ort in den Einstellungen inzwischen geloescht wurde.
export function getHomeLocation(
  settings: AppSettings,
  finishedDesc: WorkoutSession[],
): string {
  const manual = settings.homeLocation?.trim()
  if (manual && settings.locations.includes(manual)) return manual

  const counts = new Map<string, { count: number; original: string }>()
  for (const s of finishedDesc) {
    const loc = s.location.trim()
    if (!loc) continue
    const key = locationKey(loc)
    const cur = counts.get(key)
    counts.set(key, { count: (cur?.count ?? 0) + 1, original: cur?.original ?? loc })
  }
  let best: { count: number; original: string } | undefined
  for (const v of counts.values()) {
    if (!best || v.count > best.count) best = v
  }
  return best?.original ?? ''
}

// Fuer die Einstellungen: zeigt den automatisch ermittelten Ort auch dann,
// wenn der Nutzer bereits manuell einen anderen gewaehlt hat.
export async function getAutoHomeLocation(): Promise<string> {
  const sessions = await db.sessions.filter((s) => s.finished).toArray()
  return getHomeLocation({ ...(await getSettings()), homeLocation: undefined }, sessions)
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

// Freihantel-Sonderfall (Punkt 4): Eigenschaft der abstrakten Uebung, nicht
// der Session/des Plan-Eintrags - gilt dadurch rueckwirkend ueberall.
export async function setExerciseFreeWeight(
  exerciseId: string,
  value: boolean,
): Promise<void> {
  const ex = await db.exercises.get(exerciseId)
  if (!ex) return
  await db.exercises.put({ ...ex, isFreeWeight: value })
}

// Aendert nur die Stammdaten-Zeile. Bewusst OHNE Rueckwirkung auf bereits
// kopierte PlanExercise.name/SessionExercise.name (Vorlage/Instanz werden
// kopiert, nicht live referenziert) - das Matching laeuft ueber exerciseId.
export async function renameExercise(
  exerciseId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const ex = await db.exercises.get(exerciseId)
  if (!ex) return
  await db.exercises.put({ ...ex, name: trimmed })
}

// Loescht nur die Stammdaten-Zeile (Autocomplete/Picker). Plaene und Sessions
// referenzieren exerciseId direkt auf sich selbst, bleiben also unveraendert
// lesbar; eine erneute Nutzung des Namens legt ueber upsertExerciseByName
// einfach wieder eine neue Zeile an.
export async function deleteExerciseRecord(exerciseId: string): Promise<void> {
  await db.exercises.delete(exerciseId)
}

async function loadFreeWeightIds(): Promise<Set<string>> {
  const all = await db.exercises.toArray()
  return new Set(all.filter((e) => e.isFreeWeight).map((e) => e.id))
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
// Freihantel-Uebungen (freeWeight=true, Exercise.isFreeWeight) ueberspringen
// Ort/Hersteller komplett: alle Vorkommen bilden einen gemeinsamen Pool.
function pickPrefillSource(
  finishedDesc: WorkoutSession[],
  key: string,
  location: string,
  manufacturer: string,
  freeWeight: boolean,
): PrefillHit | undefined {
  const hit = (s: WorkoutSession, tier: PrefillTier): PrefillHit => ({
    ex: findEx(s, key)!,
    tier,
    manufacturer: s.equipmentManufacturer,
  })

  if (freeWeight) {
    const any = finishedDesc.find((s) => findEx(s, key))
    return any ? hit(any, 'freeweight') : undefined
  }

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

// Welche Sessions zur selben Kontinuitaet wie die Wasserfall-Quelle gehoeren
// (fuer die Gewichts-Referenz-Faltung). Spiegelt exakt das Prio-1/2/freeweight-
// Matching oben; Prio 3 ("other") hat bewusst keine Kontinuitaet - dort bleibt
// das bisherige einfache Verhalten (+ "neu kalibrieren") unveraendert.
function continuitySessions(
  finishedDesc: WorkoutSession[],
  key: string,
  tier: PrefillTier,
  location: string,
  manufacturer: string,
): WorkoutSession[] {
  if (tier === 'freeweight') return finishedDesc.filter((s) => findEx(s, key))
  if (tier === 'location') {
    const loc = locationKey(location)
    return finishedDesc.filter((s) => locationKey(s.location) === loc && findEx(s, key))
  }
  if (tier === 'manufacturer') {
    return finishedDesc.filter((s) => s.equipmentManufacturer === manufacturer && findEx(s, key))
  }
  return []
}

export interface FoldedWeight {
  weight: number | null
  referenceDate: number | null
}

// Faltet die Gewichts-Referenz je Satz-Position ueber die Kontinuitaets-
// Historie (aufsteigend chronologisch): ein hoeheres geloggtes Gewicht wird
// immer uebernommen; ein niedrigeres nur mit explizitem "halten"/"senken"-
// Hinweis (SessionExercise.progression) der jeweiligen Session - sonst bleibt
// die alte, hoehere Referenz bestehen. Nur abgehakte Saetze mit geloggtem
// Gewicht zaehlen als Datenpunkt (rein vorbefuellte, nie abgehakte Werte
// wuerden die Referenz sonst verfaelschen). Reine, synchrone, testbare
// Funktion - exportiert fuers Testharness.
export function foldReferenceWeight(
  sessions: WorkoutSession[],
  key: string,
): FoldedWeight[] {
  const asc = [...sessions].sort((a, b) => a.date - b.date)
  const refs: FoldedWeight[] = []
  for (const s of asc) {
    const ex = findEx(s, key)
    if (!ex) continue
    ex.sets.forEach((set, i) => {
      if (!set.done || set.weight == null) return
      const cur = refs[i]
      if (!cur || cur.weight == null) {
        refs[i] = { weight: set.weight, referenceDate: s.date }
      } else if (set.weight > cur.weight) {
        refs[i] = { weight: set.weight, referenceDate: s.date }
      } else if (
        set.weight < cur.weight &&
        (ex.progression === 'same' || ex.progression === 'down')
      ) {
        refs[i] = { weight: set.weight, referenceDate: s.date }
      }
    })
  }
  return refs
}

// Schwerstes abgehaktes Gewicht einer Uebung in einer Session (wie
// lib/stats.ts' topWeight, aber ueber den exKey statt eine konkrete
// SessionExercise-Referenz - vermeidet einen zirkulaeren Import von lib/stats).
function topWeightForKey(s: WorkoutSession, key: string): number | null {
  const ex = findEx(s, key)
  if (!ex) return null
  const w = ex.sets.filter((x) => x.done && x.weight != null).map((x) => x.weight as number)
  return w.length ? Math.max(...w) : null
}

// Home-Gym-Steigerungsrate (Punkt 2): gemessenes Verhaeltnis aus dem
// Top-Gewicht am Home-Gym nahe "jetzt" geteilt durch das Top-Gewicht nahe dem
// Stale-Datum - keine reine Zeit-Projektion, da die sonst nach einer
// Trainingspause faelschlich mehr Gewicht vorschlagen wuerde. Erfordert
// mindestens einen Home-Gym-Datenpunkt NACH dem Stale-Datum (sonst kein Beleg
// fuer Fortschritt seither) plus insgesamt HOME_GYM_MIN_POINTS Datenpunkte.
// Ergebnis nie < 1 (keine Senkung ueber den Trend) und auf HOME_GYM_GROWTH_CAP
// begrenzt.
export function computeExerciseGrowthRate(
  homeSessions: WorkoutSession[],
  key: string,
  staleDate: number,
): number | null {
  const points = homeSessions
    .map((s) => ({ date: s.date, top: topWeightForKey(s, key) }))
    .filter((p): p is { date: number; top: number } => p.top != null)
  if (points.length < HOME_GYM_MIN_POINTS) return null

  const desc = [...points].sort((a, b) => b.date - a.date)
  const newest = desc[0]
  if (newest.date <= staleDate) return null

  const before = desc.filter((p) => p.date <= staleDate)
  const basis = before[0] ?? desc[desc.length - 1]
  if (!basis || basis.top <= 0) return null

  const ratio = newest.top / basis.top
  return Math.min(HOME_GYM_GROWTH_CAP, Math.max(1, ratio))
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
  freeWeightIds: Set<string>
  homeLocation: string
}): SessionExercise {
  const key = exKey(opts.name, opts.exerciseId)
  const isFreeWeight = !!opts.exerciseId && opts.freeWeightIds.has(opts.exerciseId)
  const source = pickPrefillSource(
    opts.finishedDesc,
    key,
    opts.location,
    opts.manufacturer,
    isFreeWeight,
  )

  const targets: { reps: number | null; weight?: number }[] =
    opts.targets ??
    Array.from(
      { length: source?.ex.sets.length || DEFAULT_SET_COUNT },
      (_, i) => ({ reps: source?.ex.sets[i]?.reps ?? null }),
    )

  // Prio 3 ("other") hat keine Kontinuitaet -> keine Faltung, einfacher
  // letzter Wert wie bisher (siehe continuitySessions).
  const continuity =
    source && source.tier !== 'other'
      ? continuitySessions(opts.finishedDesc, key, source.tier, opts.location, opts.manufacturer)
      : []
  const folded = continuity.length ? foldReferenceWeight(continuity, key) : []

  // Home-Gym-Vorschlag (Punkt 2): nur bei Prio 1/2/freeweight, nie bei Prio 3;
  // Staleness bemisst sich an der NEUESTEN Session im Kontinuitaets-Pool, nicht
  // pauschal an der Quelle. Kein Vorschlag, wenn der veraltete Ort selbst das
  // Home-Gym ist (dort gibt es keinen externen Trend, der etwas beitruege).
  let suggestedFactor: number | undefined
  let staleDays: number | undefined
  if (continuity.length && opts.homeLocation) {
    const newestDate = Math.max(...continuity.map((s) => s.date))
    const ageDays = Math.floor((Date.now() - newestDate) / DAY_MS)
    const isHomeGymItself =
      source!.tier === 'location' && locationKey(opts.location) === locationKey(opts.homeLocation)
    if (ageDays >= STALE_THRESHOLD_DAYS && !isHomeGymItself) {
      const homeSessions = opts.finishedDesc.filter(
        (s) => locationKey(s.location) === locationKey(opts.homeLocation),
      )
      const factor = computeExerciseGrowthRate(homeSessions, key, newestDate)
      if (factor != null && factor > 1) {
        suggestedFactor = factor
        staleDays = ageDays
      }
    }
  }

  const sets: SetLog[] = targets.map((t, i) => {
    const prev = source?.ex.sets[i]
    const prevWeight = prev?.weight ?? null
    const prevReps = prev?.reps ?? null
    const ref = folded[i]

    let weight: number | null
    let referenceDate: number | null = null
    if (ref && ref.weight != null) {
      weight = ref.weight
      // Nur anzeigen, wenn die Referenz vom zuletzt geloggten Wert abweicht
      // (ein Einbruch wurde ignoriert) - sonst ist "zuletzt" schon identisch.
      if (ref.weight !== prevWeight) referenceDate = ref.referenceDate
    } else {
      // Letztes Training ueberschreibt den Plan-Standardwert beim Gewicht.
      weight = prevWeight != null ? prevWeight : t.weight ?? null
    }

    return {
      id: uid(),
      weight,
      reps: t.reps ?? null,
      done: false,
      prevWeight,
      prevReps,
      prefillWeight: weight,
      referenceDate,
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
    suggestedFactor,
    staleDays,
  }
}

function buildSessionExercise(
  pe: PlanExercise,
  finishedDesc: WorkoutSession[],
  location: string,
  manufacturer: string,
  freeWeightIds: Set<string>,
  homeLocation: string,
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
    freeWeightIds,
    homeLocation,
  })
}

// Uebung ohne Plan-Eintrag (freies Training, "Uebung ergaenzen").
export async function buildAdHocExercise(
  name: string,
  exerciseId: string | undefined,
  location: string,
  manufacturer: string,
): Promise<SessionExercise> {
  const [finishedDesc, freeWeightIds, settings] = await Promise.all([
    finishedSessionsDesc(),
    loadFreeWeightIds(),
    getSettings(),
  ])
  const homeLocation = getHomeLocation(settings, finishedDesc)
  return buildExercise({
    name,
    exerciseId,
    finishedDesc,
    location,
    manufacturer,
    freeWeightIds,
    homeLocation,
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

  // Verlauf + Freihantel-Flags + Settings einmal laden (fuer Vorbelegung +
  // Gedaechtnis-Hinweise). Beide Zweige (Plan wie Freies Training) brauchen
  // dieselben Daten - einmalig hier laden statt in buildExercise/
  // buildSessionExercise (die bleiben dadurch rein synchron und testbar).
  const [finishedDesc, freeWeightIds, settings] = await Promise.all([
    finishedSessionsDesc(),
    loadFreeWeightIds(),
    getSettings(),
  ])
  const homeLocation = getHomeLocation(settings, finishedDesc)

  if (opts.plan && opts.planDayId) {
    const day = opts.plan.days.find((d) => d.id === opts.planDayId)
    planName = opts.plan.name
    dayName = day?.name
    // Uebungen aus dem Plan KOPIEREN (keine Referenz -> freie Abweichung),
    // Gewichte aus dem passenden letzten Training vorbelegen.
    exercises = (day?.exercises ?? []).map((pe) =>
      buildSessionExercise(
        pe,
        finishedDesc,
        opts.location,
        opts.manufacturer,
        freeWeightIds,
        homeLocation,
      ),
    )
  } else if (opts.adHocExercises?.length) {
    exercises = opts.adHocExercises.map((e) =>
      buildExercise({
        name: e.name,
        exerciseId: e.exerciseId,
        finishedDesc,
        location: opts.location,
        manufacturer: opts.manufacturer,
        freeWeightIds,
        homeLocation,
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

// Regel A (Wdh.): ein Satz zaehlt nur, wenn sein geloggtes Gewicht mindestens
// dem fuer ihn vorbefuellten Gewicht entsprach - sonst wuerde ein leichter
// "Ausdauer-Tag" mit mehr Wdh. bei reduziertem Gewicht faelschlich das Ziel
// anheben. Senkung bleibt wie immer nie automatisch; Wdh.-Ziele werden daher
// auch nach einer Gewichtssteigerung nicht von selbst wieder gesenkt.
function qualifiesForRepsGrowth(set: SetLog): boolean {
  if (!set.done || set.reps == null) return false
  // Koerpergewicht/keine Gewichtsangabe: das Gate greift nicht, da es keinen
  // "leichteren Tag" ueber das Gewicht geben kann.
  if (set.weight == null) return true
  // Keine Baseline bekannt (z.B. allererste Session ueberhaupt): nicht
  // blockieren, es gibt noch keinen Hinweis auf einen "leichteren Tag".
  if (set.prefillWeight == null) return true
  return set.weight >= set.prefillWeight
}

function growRepsTarget(pe: PlanExercise, ex: SessionExercise): PlanExercise {
  if (pe.customSets?.length) {
    let changed = false
    const customSets = pe.customSets.map((c, i) => {
      const set = ex.sets[i]
      if (!set || !qualifiesForRepsGrowth(set) || set.reps! <= c.reps) return c
      changed = true
      return { ...c, reps: set.reps! }
    })
    if (!changed) return pe
    return { ...pe, customSets, targetReps: customSets[0]?.reps ?? pe.targetReps }
  }

  // Einfacher Modus: nur anheben, wenn ALLE abgehakten Saetze innerhalb von
  // targetSets den aktuellen Zielwert uebertreffen - ein einzelner Ausreisser
  // reicht nicht fuer eine zuverlaessige neue Vorgabe. Schaltet die Uebung
  // nicht automatisch in den individuellen Modus um.
  const relevant = ex.sets.slice(0, pe.targetSets).filter((s) => s.done)
  if (relevant.length === 0) return pe
  const qualifies = relevant.every(
    (s) => qualifiesForRepsGrowth(s) && s.reps! > pe.targetReps,
  )
  if (!qualifies) return pe
  const minReps = Math.min(...relevant.map((s) => s.reps!))
  return { ...pe, targetReps: minReps }
}

// Regel A (Saetze): ein zusaetzlich ABGEHAKTER Satz wird zum neuen Ziel-
// Volumen. Reihenfolge wichtig: erst Satz-Anzahl, danach Wdh. (operiert auf
// dem ggf. schon gewachsenen Template).
async function growSetTemplates(s: WorkoutSession): Promise<void> {
  for (const ex of s.exercises) {
    if (!ex.planExerciseId) continue
    const done = ex.sets.filter((x) => x.done).length
    await updatePlanExercise(s.planId, s.planDayId, ex.planExerciseId, (pe) => {
      const grown = done > pe.targetSets ? withSetCount(pe, done) : pe
      return growRepsTarget(grown, ex)
    })
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
