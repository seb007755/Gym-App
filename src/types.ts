// Kern-Datenmodell. Klare Trennung von Vorlage (Plan) und Instanz (Session).

export interface Exercise {
  id: string
  name: string
  muscleGroup?: string
}

// ---- Vorlage / Plan ----

export interface PlanExercise {
  id: string
  exerciseId?: string // Referenz auf Exercise-Stammdaten (optional)
  name: string // denormalisiert fuer schnelle Anzeige
  targetSets: number
  targetReps: number
  targetWeight?: number
  note?: string
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
  note?: string
}

export interface SessionExercise {
  id: string
  exerciseId?: string
  name: string
  sets: SetLog[]
  note?: string
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
}

export interface AppSettings {
  key: string // immer "app"
  locations: string[]
  manufacturers: string[]
  lastLocation: string
  lastManufacturer: string
}

export interface BackupFile {
  app: 'gym-tracker'
  version: number
  exportedAt: number
  exercises: Exercise[]
  plans: Plan[]
  sessions: WorkoutSession[]
  settings: AppSettings | null
}
