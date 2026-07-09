export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function formatDurationLong(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const timeFmt = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(ts: number): string {
  return dateFmt.format(new Date(ts))
}

export function formatDateTime(ts: number): string {
  return `${dateFmt.format(new Date(ts))} · ${timeFmt.format(new Date(ts))}`
}

export function formatTime(ts: number): string {
  return timeFmt.format(new Date(ts))
}

// Voller Wochentag + Monat, nur fuer die Verlaufs-Suche (z.B. "Mittwoch Juli").
const searchDateFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  month: 'long',
})

export function formatDateSearch(ts: number): string {
  return searchDateFmt.format(new Date(ts))
}
