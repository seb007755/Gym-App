export const DEFAULT_BODY_WEIGHT_KG = 95
export const DEFAULT_MET = 5.0
export const MET_MIN = 3.5
export const MET_MAX = 8.0
export const MET_STEP = 0.5

// Kalorienverbrauch (kcal) = MET x Koerpergewicht (kg) x (Dauer in Minuten / 60)
export function calcCalories(
  met: number,
  bodyWeightKg: number,
  durationSeconds: number,
): number {
  const hours = Math.max(0, durationSeconds) / 3600
  return Math.round(met * bodyWeightKg * hours)
}

export function metLabel(met: number): string {
  return met <= 5.0
    ? 'Leichtes bis moderates Krafttraining'
    : 'Intensives Krafttraining'
}
