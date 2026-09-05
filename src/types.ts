// Kern-Datenmodell. Klare Trennung von Vorlage (Plan) und Instanz (Session).

export interface Exercise {
  id: string
  name: string
  muscleGroup?: string
}

// ---- Vorlage / Plan ----

// Empfehlung fuers naechste Mal (Gedaechtnis).
export type Progression = 'up' | 'same' | 'down'

// Ein individuell im Plan hinterlegter Satz (z.B. Aufwaerm-/schwerer Satz).
export interface PlanSetTarget {
  reps: number
  weight?: number
}

export interface PlanExercise {
  id: string
  exerciseId?: string // Referenz auf Exercise-Stammdaten (optional)
  name: string // denormalisiert fuer schnelle Anzeige
  targetSets: number
  targetReps: number
  targetWeight?: number
  note?: string
  // Wenn gesetzt: individuelle Saetze statt targetSets × targetReps.
  customSets?: PlanSetTarget[]
}

export interface PlanDay {
  id: string
  name: string // z.B. "Push", "Pull", "Legs"
  exercises: PlanExercise[]
}

export interface Plan {
  id: string
  name: string
  days: PlanDay[]
  createdAt: number
}

// ---- Instanz / durchgefuehrtes Training ----

export interface SetLog {
  id: string
  weight: number | null
  reps: number | null
  done: boolean
  note?: string // optionaler Kommentar pro Satz (Merker fuers naechste Mal)
  // Referenz vom letzten Mal (zur Anzeige "zuletzt: X kg × Y"), beim Start gesetzt.
  prevWeight?: number | null
  prevReps?: number | null
}

// Welche Stufe der Wasserfall-Logik die Vorbelegung geliefert hat.
export type PrefillTier = 'location' | 'manufacturer' | 'other'

export interface SessionExercise {
  id: string
  exerciseId?: string
  name: string
  sets: SetLog[]
  note?: string
  // Rueckverweis auf den Plan-Eintrag -> noetig fuers Satz-Template (Regel A/B).
  planExerciseId?: string
  // Gedaechtnis: diese Entscheidung gilt fuers NAECHSTE Mal.
  progression?: Progression | null
  nextNote?: string
  // Hinweis vom letzten Mal (zur Anzeige), beim Start uebernommen.
  hintProgression?: Progression | null
  hintNote?: string
  // Herkunft der Vorbelegung (Wasserfall) fuer die UI-Markierung.
  prefillTier?: PrefillTier
  prefillManufacturer?: string
}

export interface WorkoutSession {
  id: string
  date: number // Zeitstempel (Startdatum)
  startTime: number
  endTime: number | null
  durationSeconds: number
  location: string
  equipmentManufacturer: string
  planId: string | null
  planDayId: string | null
  planName?: string
  dayName?: string
  exercises: SessionExercise[]
  finished: boolean
  // Beim Beenden eingefroren: spaetere Aenderungen an Gewicht/MET wirken nicht
  // rueckwirkend.
  calories?: number
  calcBodyWeightKg?: number
  calcMet?: number
}

// Nicht getrackte Einheit (Personal-Training, Lauf …): nur Datum + Typ.
// Bewusst ohne Dauer/kcal - dafuer gibt es keine verlaesslichen Werte.
export interface Activity {
  id: string // `${YYYY-MM-DD}|${type}` -> Abhaken ist idempotent
  date: number // lokale Mitternacht
  type: string
  note?: string
  // Welchem Trainingstag (z.B. "Push") diese Einheit entsprach - optional,
  // aus den Namen vorhandener Plan-Tage gewaehlt. Ohne das wuerde z.B. ein
  // Personal-Training als Push-Tag in der Trainingstag-Balance fehlen.
  dayName?: string
}

export interface AppSettings {
  key: string // immer "app"
  locations: string[]
  manufacturers: string[]
  lastLocation: string
  lastManufacturer: string
  // Ort -> Hersteller. Key ist der getrimmte Ortsname in Kleinschreibung.
  // Bewusst als eigene Map statt als Umbau von `locations` -> Backups bleiben lesbar.
  locationManufacturers?: Record<string, string>
  restSeconds?: number
  bodyWeightKg?: number
  metValue?: number
  migratedV2At?: number
  // Frei erweiterbare Typen fuer nicht getrackte Einheiten.
  activityTypes?: string[]
}

export interface BackupFile {
  app: 'gym-tracker'
  version: number
  exportedAt: number
  exercises: Exercise[]
  plans: Plan[]
  sessions: WorkoutSession[]
  settings: AppSettings | null
  // Erst ab Backup-Version 3 vorhanden - beim Import optional behandeln.
  activities?: Activity[]
}
