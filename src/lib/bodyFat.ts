// Koerperfett-Schaetzung per Caliper (Hautfaltenmessung), Jackson & Pollock
// (1985) - die verbreitetste Standard-Referenz dafuer - plus Siri-Gleichung
// zur Umrechnung von Koerperdichte in Koerperfett-%. Reine Funktionen, kein
// DB-/UI-Bezug (analog lib/calories.ts).
import type { CaliperMethod } from '../types'

export type Sex = 'male' | 'female'

// 3-Punkt-Messstellen unterscheiden sich nach Geschlecht (andere Hebel-/
// Fettverteilung); 7-Punkt nutzt bei beiden dieselben Stellen, nur die
// Formel-Koeffizienten unterscheiden sich.
export const CALIPER_SITES: Record<CaliperMethod, Record<Sex, string[]>> = {
  '3-punkt': {
    male: ['chest', 'abdomen', 'thigh'],
    female: ['triceps', 'suprailiac', 'thigh'],
  },
  '7-punkt': {
    male: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdomen', 'suprailiac', 'thigh'],
    female: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdomen', 'suprailiac', 'thigh'],
  },
}

export function bodyDensityJP3(sumMm: number, age: number, sex: Sex): number {
  return sex === 'male'
    ? 1.10938 - 0.0008267 * sumMm + 0.0000016 * sumMm ** 2 - 0.0002574 * age
    : 1.0994921 - 0.0009929 * sumMm + 0.0000023 * sumMm ** 2 - 0.0001392 * age
}

export function bodyDensityJP7(sumMm: number, age: number, sex: Sex): number {
  return sex === 'male'
    ? 1.112 - 0.00043499 * sumMm + 0.00000055 * sumMm ** 2 - 0.00028826 * age
    : 1.097 - 0.00046971 * sumMm + 0.00000056 * sumMm ** 2 - 0.00012828 * age
}

export function siriBodyFatPercent(density: number): number {
  return 495 / density - 450
}

// Rundet auf eine Nachkommastelle - mehr Praezision gaukelt eine Genauigkeit
// vor, die eine Haushalts-Caliperzange nicht hat.
export function computeBodyFatPercent(
  method: CaliperMethod,
  sites: Partial<Record<string, number>>,
  age: number,
  sex: Sex,
): number {
  const keys = CALIPER_SITES[method][sex]
  const sum = keys.reduce((n, k) => n + (sites[k] ?? 0), 0)
  const density =
    method === '3-punkt' ? bodyDensityJP3(sum, age, sex) : bodyDensityJP7(sum, age, sex)
  return Math.round(siriBodyFatPercent(density) * 10) / 10
}

export function ageInYears(birthDate: number, atDate: number): number {
  const birth = new Date(birthDate)
  const at = new Date(atDate)
  let age = at.getFullYear() - birth.getFullYear()
  const beforeBirthdayThisYear =
    at.getMonth() < birth.getMonth() ||
    (at.getMonth() === birth.getMonth() && at.getDate() < birth.getDate())
  if (beforeBirthdayThisYear) age--
  return age
}
