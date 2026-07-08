import { db, getSettings } from '../db'
import type { BackupFile } from '../types'

const BACKUP_VERSION = 1

export async function exportBackup(): Promise<BackupFile> {
  const [exercises, plans, sessions, settings] = await Promise.all([
    db.exercises.toArray(),
    db.plans.toArray(),
    db.sessions.toArray(),
    getSettings(),
  ])
  return {
    app: 'gym-tracker',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    exercises,
    plans,
    sessions,
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
    db.exercises,
    db.plans,
    db.sessions,
    db.settings,
    async () => {
      if (replace) {
        await Promise.all([
          db.exercises.clear(),
          db.plans.clear(),
          db.sessions.clear(),
        ])
      }
      if (data.exercises?.length) await db.exercises.bulkPut(data.exercises)
      if (data.plans?.length) await db.plans.bulkPut(data.plans)
      if (data.sessions?.length) await db.sessions.bulkPut(data.sessions)
      if (data.settings) await db.settings.put(data.settings)
    },
  )

  return {
    exercises: data.exercises?.length ?? 0,
    plans: data.plans?.length ?? 0,
    sessions: data.sessions?.length ?? 0,
  }
}
