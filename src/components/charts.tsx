import { useEffect, useMemo, useRef, useState } from 'react'

// Kategoriale Palette, gegen die Kartenflaeche #161B22 validiert
// (Helligkeitsband, Chroma, CVD-Abstand, Normalsicht, Kontrast >= 3:1).
// Reihenfolge ist fest - Serien werden nie zyklisch neu eingefaerbt.
export const SERIES_COLORS = [
  '#3987e5', // blau
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // gelb
  '#d55181', // magenta
]
export const SERIES_OTHER = '#8B949E'

export function seriesColor(index: number): string {
  return index < SERIES_COLORS.length ? SERIES_COLORS[index] : SERIES_OTHER
}

export interface LinePoint {
  x: number // Zeitstempel
  y: number
  label?: string // Zusatzzeile im Tooltip
}

export interface LineSeries {
  name: string
  color: string
  points: LinePoint[]
}

const VB_W = 340
const PAD = { top: 12, right: 10, bottom: 24, left: 36 }

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) return [min]
  const raw = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const start = Math.ceil(min / step) * step
  const out: number[] = []
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100)
  return out
}

/**
 * Mehrserien-Liniendiagramm. Eine Serie je Hersteller: Gewichte sind zwischen
 * Herstellern nicht vergleichbar, deshalb bewusst getrennte Linien statt einer
 * durchgehenden Kurve, die einen Geraetewechsel als Fortschritt lesen wuerde.
 */
export function LineChart({
  series,
  height = 190,
  unit = 'kg',
  formatX,
}: {
  series: LineSeries[]
  height?: number
  unit?: string
  formatX: (ts: number) => string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [active, setActive] = useState<number | null>(null)

  const all = series.flatMap((s) => s.points)
  const bounds = useMemo(() => {
    const xs = all.map((p) => p.x)
    const ys = all.map((p) => p.y)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    let yMin = Math.min(...ys)
    let yMax = Math.max(...ys)
    if (yMin === yMax) {
      yMin = yMin - 1
      yMax = yMax + 1
    } else {
      const pad = (yMax - yMin) * 0.15
      yMin -= pad
      yMax += pad
    }
    return { xMin, xMax, yMin, yMax }
  }, [all])

  if (all.length === 0) return null

  const plotW = VB_W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const sx = (x: number) =>
    bounds.xMax === bounds.xMin
      ? PAD.left + plotW / 2
      : PAD.left + ((x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * plotW
  const sy = (y: number) =>
    PAD.top + plotH - ((y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * plotH

  // Alle Punkte chronologisch - fuer Crosshair und Tooltip.
  const flat = series
    .flatMap((s, si) => s.points.map((p) => ({ ...p, si, name: s.name, color: s.color })))
    .sort((a, b) => a.x - b.x)

  function pick(clientX: number) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const vx = ((clientX - rect.left) / rect.width) * VB_W
    let best = 0
    let bestD = Infinity
    flat.forEach((p, i) => {
      const d = Math.abs(sx(p.x) - vx)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setActive(best)
  }

  const hot = active != null ? flat[active] : null
  const ticks = niceTicks(bounds.yMin, bounds.yMax)

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${height}`}
        className="w-full touch-manipulation"
        role="img"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => e.buttons > 0 && pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        {/* Zurueckhaltendes Raster */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={VB_W - PAD.right}
              y1={sy(t)}
              y2={sy(t)}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text x={PAD.left - 6} y={sy(t) + 3} textAnchor="end" fontSize="9" fill="#8B949E">
              {t}
            </text>
          </g>
        ))}

        {/* Zeitachse: nur erster und letzter Wert, sonst kollidiert es */}
        <text x={PAD.left} y={height - 8} fontSize="9" fill="#8B949E">
          {formatX(bounds.xMin)}
        </text>
        {bounds.xMax !== bounds.xMin ? (
          <text x={VB_W - PAD.right} y={height - 8} fontSize="9" fill="#8B949E" textAnchor="end">
            {formatX(bounds.xMax)}
          </text>
        ) : null}

        {hot ? (
          <line
            x1={sx(hot.x)}
            x2={sx(hot.x)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {series.map((s) => {
          const pts = [...s.points].sort((a, b) => a.x - b.x)
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join(' ')
          return (
            <g key={s.name}>
              {pts.length > 1 ? (
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {pts.map((p) => (
                <circle
                  key={p.x}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={4}
                  fill={s.color}
                  // 2px Ring in Flaechenfarbe: trennt ueberlappende Marken
                  stroke="#161B22"
                  strokeWidth="2"
                />
              ))}
            </g>
          )
        })}
      </svg>

      {hot ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-bg/95 px-2 py-1 text-[11px] shadow-lg"
          style={{ left: `${(sx(hot.x) / VB_W) * 100}%` }}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: hot.color }}
            />
            {hot.y} {unit}
          </div>
          <div className="whitespace-nowrap text-muted">{formatX(hot.x)}</div>
          {hot.label ? <div className="whitespace-nowrap text-muted">{hot.label}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

// Legende: bei >= 2 Serien Pflicht, damit Identitaet nie nur ueber Farbe laeuft.
export function Legend({ items }: { items: { name: string; color: string }[] }) {
  if (items.length < 2) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-1.5 text-xs text-muted">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: i.color }}
          />
          {i.name}
        </li>
      ))}
    </ul>
  )
}

export interface HeatDay {
  ts: number
  categories: string[] // Namen der an diesem Tag stattgefundenen Kategorien
}

const CELL = 11
const GAP = 2
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

/**
 * Jahreskalender. Bewusst rein kategorial (welche Einheiten fanden statt) statt
 * zusaetzlich intensitaetscodiert - in einer 11px-Zelle waeren zwei Encodings
 * nicht mehr unterscheidbar.
 */
export function ActivityHeatmap({
  days,
  colorOf,
  onSelect,
  weeks = 53,
  fit = false,
}: {
  days: Map<string, HeatDay>
  colorOf: (category: string) => string
  onSelect: (ts: number) => void
  weeks?: number
  // fit: statt seitlich zu scrollen das Jahr per viewBox auf die Kartenbreite
  // herunterskalieren - noetig fuer den Bildexport, der nur Sichtbares erfasst.
  fit?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Aktuellste Woche zuerst zeigen.
    const el = scrollRef.current
    if (el && !fit) el.scrollLeft = el.scrollWidth
  }, [weeks, fit])

  const { columns, monthMarks } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Auf Sonntag der laufenden Woche enden (Mo..So Raster).
    const end = new Date(today)
    const shiftToSunday = (7 - ((end.getDay() + 6) % 7) - 1)
    end.setDate(end.getDate() + shiftToSunday)

    const cols: Date[][] = []
    const marks: { col: number; label: string }[] = []
    const start = new Date(end)
    start.setDate(start.getDate() - (weeks * 7 - 1))

    let cursor = new Date(start)
    let lastMonth = -1
    for (let w = 0; w < weeks; w++) {
      const col: Date[] = []
      for (let d = 0; d < 7; d++) {
        col.push(new Date(cursor))
        cursor.setDate(cursor.getDate() + 1)
      }
      if (col[0].getMonth() !== lastMonth) {
        lastMonth = col[0].getMonth()
        marks.push({ col: w, label: MONTHS[lastMonth] })
      }
      cols.push(col)
    }
    return { columns: cols, monthMarks: marks }
  }, [weeks])

  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayKey = key(new Date())
  const width = columns.length * (CELL + GAP)
  const height = 7 * (CELL + GAP)

  return (
    <div
      ref={scrollRef}
      className={'-mx-1 px-1 ' + (fit ? 'overflow-visible' : 'overflow-x-auto')}
    >
      <div style={{ width: fit ? '100%' : width + 22 }}>
        <svg
          viewBox={`0 0 ${width + 22} ${height + 14}`}
          style={{ width: fit ? '100%' : width + 22 }}
        >
          {/* Wochentage links (nur Mo/Mi/Fr, sonst zu eng) */}
          {[
            [0, 'Mo'],
            [2, 'Mi'],
            [4, 'Fr'],
          ].map(([row, label]) => (
            <text
              key={label as string}
              x={0}
              y={14 + (row as number) * (CELL + GAP) + CELL - 2}
              fontSize="8"
              fill="#8B949E"
            >
              {label}
            </text>
          ))}

          {monthMarks.map((m) => (
            <text key={m.col} x={22 + m.col * (CELL + GAP)} y={8} fontSize="8" fill="#8B949E">
              {m.label}
            </text>
          ))}

          {columns.map((col, ci) =>
            col.map((d, ri) => {
              const k = key(d)
              const entry = days.get(k)
              const cats = entry?.categories ?? []
              const x = 22 + ci * (CELL + GAP)
              const y = 14 + ri * (CELL + GAP)
              const future = d.getTime() > Date.now()
              return (
                <g
                  key={k}
                  onClick={() => !future && onSelect(d.getTime())}
                  style={{ cursor: future ? 'default' : 'pointer' }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    rx={2}
                    fill={future ? 'transparent' : '#191D23'}
                  />
                  {/* Mehrere Kategorien an einem Tag: senkrechte Streifen */}
                  {cats.map((c, i) => (
                    <rect
                      key={c}
                      x={x + (i * CELL) / cats.length}
                      y={y}
                      width={CELL / cats.length}
                      height={CELL}
                      rx={cats.length === 1 ? 2 : 0}
                      fill={colorOf(c)}
                    />
                  ))}
                  {k === todayKey ? (
                    <rect
                      x={x - 0.5}
                      y={y - 0.5}
                      width={CELL + 1}
                      height={CELL + 1}
                      rx={2.5}
                      fill="none"
                      stroke="#E6EDF3"
                      strokeWidth="1"
                    />
                  ) : null}
                  <title>{k}</title>
                </g>
              )
            }),
          )}
        </svg>
      </div>
    </div>
  )
}

// Waagerechte Balken fuer Zaehlungen (Trainingstag-Balance).
export function BarList({
  items,
}: {
  items: { label: string; value: number; color?: string }[]
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-sm">{i.label}</span>
          <div className="h-4 flex-1">
            <div
              className="h-4 rounded-r"
              style={{
                width: `${Math.max(2, (i.value / max) * 100)}%`,
                background: i.color ?? SERIES_COLORS[0],
              }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted">
            {i.value}
          </span>
        </li>
      ))}
    </ul>
  )
}
