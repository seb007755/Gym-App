// Kern-Datenmodell. Klare Trennung von Vorlage (Plan) und Instanz (Session).

export interface Exercise {
  id: string
  name: string
  muscleGroup?: string
  // Ortsunabhaengig identisch belastbar (z.B. Kurzhantel-Curls) -> die
  // Gewichts-Referenz-Faltung poolt alle Vorkommen global statt nach
  // Ort/Hersteller zu trennen. Eigenschaft der Uebung, nicht der Session.
  isFreeWeight?: boolean
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
  // Tatsaechlich vorbefuellter Wert bei Session-Start (Snapshot, vor Nutzer-
  // Bearbeitung). Dient 1) als Gate fuer die Wdh.-Anhebung (ein Satz zaehlt nur,
  // wenn das geloggte Gewicht >= diesem Wert war) und 2) als Vergleichsbasis fuer
  // die "Referenz"-Anzeige, wenn sie von prevWeight abweicht (ignorierter Einbruch).
  prefillWeight?: number | null
  // Datum der Session, aus der prefillWeight stammt (Referenz-Faltung) - nur
  // gesetzt, wenn sie sich von der zuletzt geloggten Session unterscheidet.
  referenceDate?: number | null
}

// Welche Stufe der Wasserfall-Logik die Vorbelegung geliefert hat.
// 'freeweight': als Exercise.isFreeWeight markierte Uebung - Ort/Hersteller
// werden ignoriert, alle Vorkommen bilden einen gemeinsamen Pool.
export type PrefillTier = 'location' | 'manufacturer' | 'other' | 'freeweight'

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
  // Home-Gym-Vorschlag (Punkt 2): Faktor fuer "Uebernehmen", nur gesetzt wenn
  // die Quelle veraltet ist und eine Home-Gym-Rate vorliegt. Multipliziert je
  // Satz einzeln (individuelle Saetze koennen unterschiedliche Gewichte haben).
  suggestedFactor?: number
  staleDays?: number
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
  // Pro Einheit-Typ: soll eine Trainingstag-Zuordnung angeboten werden?
  // Fehlt ein Key, gilt isDayAssignable()'s Default (siehe db.ts).
  activityDayAssignable?: Record<string, boolean>
  // Frei formulierte Fragen fuer den KI-Export (lib/aiExport.ts), ueberleben
  // zwischen Besuchen.
  aiQuestions?: string[]
  // Home-Gym fuer die Steigerungsrate bei veralteten Orts-Treffern (Punkt 2).
  // Leer oder zeigt auf einen geloeschten Ort -> automatische Ermittlung
  // (siehe getHomeLocation in db.ts).
  homeLocation?: string
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
