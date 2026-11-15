import { db, getSettings, runMigrations } from '../db'
import type { BackupFile } from '../types'

const BACKUP_VERSION = 4

export async function exportBackup(): Promise<BackupFile> {
  const [exercises, plans, sessions, activities, weightEntries, phaseChanges, bodyFatEntries, settings] =
    await Promise.all([
      db.exercises.toArray(),
      db.plans.toArray(),
      db.sessions.toArray(),
      db.activities.toArray(),
      db.weightEntries.toArray(),
      db.phaseChanges.toArray(),
      db.bodyFatEntries.toArray(),
      getSettings(),
    ])
  return {
    app: 'gym-tracker',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    exercises,
    plans,
    sessions,
    activities,
    weightEntries,
    phaseChanges,
    bodyFatEntries,
    settings,
  }
}

export async function downloadBackup(): Promise<void> {
  const data = await exportBackup()
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `gym-tracker-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface ImportResult {
  exercises: number
  plans: number
  sessions: number
}

// Ersetzt (replace=true) oder mergt den kompletten Datenbestand.
export async function importBackup(
  raw: string,
  replace: boolean,
): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Datei ist kein gueltiges JSON.')
  }
  const data = parsed as Partial<BackupFile>
  if (data.app !== 'gym-tracker' || !Array.isArray(data.sessions)) {
    throw new Error('Das ist keine Gym-Tracker-Sicherung.')
  }

  await db.transaction(
    'rw',
    [
      db.exercises,
      db.plans,
      db.sessions,
      db.activities,
      db.weightEntries,
      db.phaseChanges,
      db.bodyFatEntries,
      db.settings,
    ],
    async () => {
      if (replace) {
        await Promise.all([
          db.exercises.clear(),
          db.plans.clear(),
          db.sessions.clear(),
          db.activities.clear(),
          db.weightEntries.clear(),
          db.phaseChanges.clear(),
          db.bodyFatEntries.clear(),
        ])
      }
      if (data.exercises?.length) await db.exercises.bulkPut(data.exercises)
      if (data.plans?.length) await db.plans.bulkPut(data.plans)
      if (data.sessions?.length) await db.sessions.bulkPut(data.sessions)
      // Erst ab Backup v3 vorhanden - aeltere Sicherungen haben das Feld nicht.
      if (data.activities?.length) await db.activities.bulkPut(data.activities)
      // Erst ab Backup v4 vorhanden - aeltere Sicherungen haben die Felder nicht.
      if (data.weightEntries?.length) await db.weightEntries.bulkPut(data.weightEntries)
      if (data.phaseChanges?.length) await db.phaseChanges.bulkPut(data.phaseChanges)
      if (data.bodyFatEntries?.length) await db.bodyFatEntries.bulkPut(data.bodyFatEntries)
      if (data.settings) await db.settings.put(data.settings)
    },
  )

  // Aeltere Sicherungen (v1) kennen weder kcal noch Hersteller je Ort.
  await runMigrations(true)

  return {
    exercises: data.exercises?.length ?? 0,
    plans: data.plans?.length ?? 0,
    sessions: data.sessions?.length ?? 0,
  }
}
