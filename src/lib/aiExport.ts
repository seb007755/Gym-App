// Reiner Markdown-Export fuer eine externe KI (ChatGPT/Claude/Gemini u.ae.).
// Keine KI-Anbindung in der App - die Datei wird manuell in einen Chat
// eingefuegt. Nutzt dieselben Berechnungen wie StatsPage (lib/stats.ts).
import { db } from '../db'
import { formatDate, formatDurationLong } from './format'
import {
  computeDayBalance,
  computeExerciseHistory,
  computeOverallStats,
  computeRecords,
  computeStagnating,
  doneReps,
  type ExerciseEntry,
} from './stats'

export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'failed'

// Pro Uebung nur die juengsten Eintraege - sonst wird die Datei bei langer
// Historie unhandlich gross.
const MAX_HISTORY_PER_EXERCISE = 20

function historyTable(exercises: ExerciseEntry[], freeWeightNames: Set<string>): string {
  const lines: string[] = []
  for (const [, e] of exercises) {
    const freeWeight = freeWeightNames.has(e.name.toLowerCase())
    lines.push(`### ${e.name}${freeWeight ? ' (Freihantel, ortsunabhängig vergleichbar)' : ''}`)
    lines.push('| Datum | Ort | Hersteller | Gewicht × Wdh. | Notiz |')
    lines.push('|---|---|---|---|---|')
    for (const o of e.occ.slice(0, MAX_HISTORY_PER_EXERCISE)) {
      const reps = doneReps(o.ex, o.top)
      lines.push(
        `| ${formatDate(o.session.date)} | ${o.session.location || '—'} | ` +
          `${o.session.equipmentManufacturer || '—'} | ${o.top} kg${reps != null ? ` × ${reps}` : ''} | ` +
          `${o.ex.note ?? ''} |`,
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}

export async function buildAiExportMarkdown(customQuestions: string[]): Promise<string> {
  const [sessions, activities, plans, allExercises] = await Promise.all([
    db.sessions.filter((s) => s.finished).toArray(),
    db.activities.toArray(),
    db.plans.toArray(),
    db.exercises.toArray(),
  ])
  const freeWeightNames = new Set(
    allExercises.filter((e) => e.isFreeWeight).map((e) => e.name.toLowerCase()),
  )

  const stats = computeOverallStats(sessions)
  const exercises = computeExerciseHistory(sessions)
  const stagnating = computeStagnating(exercises)
  const records = computeRecords(exercises)
  const dayBalance = computeDayBalance(sessions, activities)
  const questions = customQuestions.map((q) => q.trim()).filter(Boolean)

  const lines: string[] = []
  lines.push('# Trainings-Auswertung – Anfrage an eine KI')
  lines.push('')
  lines.push(
    'Du bist ein erfahrener Fitness-Coach. Analysiere die folgenden, aus einer ' +
      'Trainings-App exportierten Daten und gib:',
  )
  lines.push('')
  lines.push('1. Eine Auswertung zum bisherigen Training')
  lines.push('2. Anmerkungen zum Verlauf (Entwicklung über die Zeit)')
  lines.push('3. Hinweise zu Stärken und Schwächen')
  lines.push(
    '4. Konkrete Vorschläge für Übungs-Variationen (z. B. „du machst Übung X schon ' +
      'sehr lange, probier doch mal Übung Z aus, um die Schultern zu trainieren")',
  )
  lines.push('')
  lines.push(
    '**Hinweis zu den Zahlen:** Gewichte sind zwischen unterschiedlichen Herstellern ' +
      'und Studios nicht direkt vergleichbar (unterschiedliche Hebelverhältnisse) – ' +
      'das ist in der Historie unten jeweils angegeben.',
  )

  if (questions.length) {
    lines.push('')
    lines.push('## Zusätzliche Fragen')
    for (const q of questions) lines.push(`- ${q}`)
  }

  lines.push('')
  lines.push('## Kennzahlen')
  if (stats) {
    lines.push(`- Getrackte Trainingseinheiten: ${sessions.length}`)
    lines.push(`- Gesamte Trainingszeit: ${formatDurationLong(stats.totalSeconds)}`)
    lines.push(`- Anzahl Orte: ${stats.locations}`)
    lines.push(
      `- Letzte Einheit: ${formatDate(stats.last.date)} · ${stats.last.location || '—'}`,
    )
    lines.push(
      `- Längste Einheit: ${formatDate(stats.longest.date)} · ` +
        `${formatDurationLong(stats.longest.durationSeconds)}`,
    )
  } else {
    lines.push('- Noch keine abgeschlossenen Trainings vorhanden.')
  }

  if (dayBalance.length) {
    lines.push('')
    lines.push('## Trainingstag-Balance')
    for (const d of dayBalance) lines.push(`- ${d.label}: ${d.value}×`)
  }

  if (stagnating.length) {
    lines.push('')
    lines.push('## Kein Fortschritt (Stagnation)')
    for (const s of stagnating) {
      lines.push(
        `- ${s.name}: seit ${s.streak} Einheiten bei ${s.weight} kg (${s.manufacturer})` +
          (s.note ? ` – Notiz: „${s.note}"` : ''),
      )
    }
  }

  if (records.length) {
    lines.push('')
    lines.push('## Persönliche Rekorde')
    for (const r of records) {
      lines.push(
        `- ${r.name}: ${r.weight} kg${r.reps ? ` × ${r.reps}` : ''} ` +
          `(${formatDate(r.date)}, ${r.where})`,
      )
    }
  }

  if (exercises.length) {
    lines.push('')
    lines.push(`## Übungs-Historie (je Übung max. ${MAX_HISTORY_PER_EXERCISE} jüngste Einträge)`)
    lines.push('')
    lines.push(historyTable(exercises, freeWeightNames))
  }

  if (plans.length) {
    lines.push('## Trainingsplan (Struktur)')
    for (const p of plans) {
      lines.push(`### ${p.name}`)
      for (const d of p.days) {
        lines.push(`#### ${d.name}`)
        for (const pe of d.exercises) {
          if (pe.customSets?.length) {
            const desc = pe.customSets
              .map((c) => `${c.reps}${c.weight != null ? `×${c.weight}kg` : ''}`)
              .join(' / ')
            lines.push(`- ${pe.name}: ${desc}`)
          } else {
            lines.push(
              `- ${pe.name}: ${pe.targetSets} × ${pe.targetReps}` +
                (pe.targetWeight != null ? ` · ${pe.targetWeight} kg` : ''),
            )
          }
        }
      }
    }
  }

  lines.push('')
  lines.push(`_Exportiert am ${formatDate(Date.now())} aus der Gym-Tracker-App._`)

  return lines.join('\n')
}

// Teilen als .txt/text/plain statt .md/text/markdown: Chromes Web-Share-
// Datei-Allowlist auf Android laesst Markdown nicht zu, canShare() wuerde
// sonst immer false liefern und auf den unzuverlaessigen a.download-Pfad
// zurueckfallen (schlaegt in der installierten PWA still fehl).
export async function shareAiExport(markdown: string): Promise<ShareResult> {
  try {
    const fileName = `ki-export-${new Date().toISOString().slice(0, 10)}.txt`
    const blob = new Blob([markdown], { type: 'text/plain' })
    const file = new File([blob], fileName, { type: 'text/plain' })

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Trainings-Auswertung für KI' })
        return 'shared'
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      }
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

export async function copyAiExportToClipboard(markdown: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(markdown)
    return true
  } catch {
    return false
  }
}
