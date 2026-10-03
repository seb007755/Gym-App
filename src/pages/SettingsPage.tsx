import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DEFAULT_ACTIVITY_TYPES,
  DEFAULT_REST_SECONDS,
  db,
  getAutoHomeLocation,
  getSettings,
  isDayAssignable,
  locationKey,
  manufacturerForLocation,
  saveSettings,
  setLocationManufacturer,
} from '../db'
import {
  DEFAULT_BODY_WEIGHT_KG,
  DEFAULT_MET,
  MET_MAX,
  MET_MIN,
  MET_STEP,
  metLabel,
} from '../lib/calories'
import { downloadBackup, importBackup, type ImportResult } from '../lib/backup'
import { TopBar, Sheet } from '../components/ui'
import { PlusIcon, TrashIcon } from '../components/icons'

export default function SettingsPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const autoHomeLocation = useLiveQuery(() => getAutoHomeLocation(), [])
  const counts = useLiveQuery(async () => ({
    plans: await db.plans.count(),
    sessions: await db.sessions.count(),
    exercises: await db.exercises.count(),
  }), [])

  const fileRef = useRef<HTMLInputElement>(null)
  const [importInfo, setImportInfo] = useState<ImportResult | null>(null)
  const [importErr, setImportErr] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteVal, setPasteVal] = useState('')
  const [addKind, setAddKind] = useState<'location' | 'manufacturer' | 'activity' | null>(null)
  const [addVal, setAddVal] = useState('')
  // Ort, dessen Hersteller gerade geaendert wird (einziger Weg zur Aenderung).
  const [editLoc, setEditLoc] = useState<string | null>(null)
  const [editLocVal, setEditLocVal] = useState('')

  const activityTypes = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES
  const restSeconds = settings?.restSeconds ?? DEFAULT_REST_SECONDS
  const bodyWeightKg = settings?.bodyWeightKg ?? DEFAULT_BODY_WEIGHT_KG
  const metValue = settings?.metValue ?? DEFAULT_MET

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPendingFile(reader.result as string)
      setImportErr(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function usePastedText() {
    const v = pasteVal.trim()
    if (!v) return
    setPasteOpen(false)
    setPasteVal('')
    setImportErr(null)
    setPendingFile(v)
  }

  async function runImport(replace: boolean) {
    if (!pendingFile) return
    try {
      const res = await importBackup(pendingFile, replace)
      setImportInfo(res)
      setPendingFile(null)
    } catch (err) {
      setImportErr(err instanceof Error ? err.message : 'Import fehlgeschlagen.')
      setPendingFile(null)
    }
  }

  async function addValue() {
    if (!settings || !addKind) return
    const v = addVal.trim()
    if (!v) return
    if (addKind === 'location') {
      if (!settings.locations.includes(v)) {
        await saveSettings({ locations: [...settings.locations, v] })
      }
    } else if (addKind === 'activity') {
      if (!activityTypes.includes(v)) {
        await saveSettings({ activityTypes: [...activityTypes, v] })
      }
    } else {
      if (!settings.manufacturers.includes(v)) {
        await saveSettings({ manufacturers: [...settings.manufacturers, v] })
      }
    }
    setAddVal('')
    setAddKind(null)
  }

  async function removeActivityType(t: string) {
    // Bereits eingetragene Tage bleiben erhalten - nur der Typ verschwindet
    // aus der Auswahl.
    const dayAssignable = { ...(settings?.activityDayAssignable ?? {}) }
    delete dayAssignable[t]
    await saveSettings({
      activityTypes: activityTypes.filter((x) => x !== t),
      activityDayAssignable: dayAssignable,
    })
  }

  async function toggleDayAssignable(t: string) {
    if (!settings) return
    const next = !isDayAssignable(settings, t)
    await saveSettings({
      activityDayAssignable: {
        ...(settings.activityDayAssignable ?? {}),
        [t]: next,
      },
    })
  }

  async function removeLocation(l: string) {
    if (!settings) return
    const map = { ...(settings.locationManufacturers ?? {}) }
    delete map[locationKey(l)]
    await saveSettings({
      locations: settings.locations.filter((x) => x !== l),
      locationManufacturers: map,
    })
  }

  async function saveLocManufacturer() {
    if (!editLoc) return
    const v = editLocVal.trim()
    if (!v) return
    await setLocationManufacturer(editLoc, v)
    setEditLoc(null)
  }
  async function removeManufacturer(m: string) {
    if (!settings) return
    await saveSettings({ manufacturers: settings.manufacturers.filter((x) => x !== m) })
  }

  return (
    <div>
      <TopBar title="Einstellungen" />

      <div className="space-y-4 p-4">
        {/* Datenschutz-Hinweis */}
        <section className="card border-brand/40 bg-brand/5">
          <h2 className="mb-1 font-bold text-brand">Deine Daten bleiben lokal</h2>
          <p className="text-sm text-neutral-300">
            Alles wird ausschließlich in diesem Browser gespeichert (IndexedDB). Es
            gibt keinen Server, kein Konto und keine Synchronisierung. Ein{' '}
            <strong>JSON-Export ist die einzige Sicherung</strong> – exportiere
            regelmäßig, sonst gehen die Daten beim Löschen der Browserdaten oder
            Gerätewechsel verloren.
          </p>
        </section>

        {/* Training */}
        <section className="card">
          <h2 className="mb-3 font-bold">Training</h2>

          <label className="label" htmlFor="rest">
            Pausen-Timer
          </label>
          <div className="flex items-center gap-2">
            <input
              id="rest"
              className="input flex-1"
              type="number"
              inputMode="numeric"
              min={10}
              max={600}
              step={5}
              value={restSeconds}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                if (Number.isFinite(n)) void saveSettings({ restSeconds: n })
              }}
            />
            <span className="text-sm text-muted">Sekunden</span>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Läuft automatisch los, sobald du einen Satz abhakst.
          </p>

          <label className="label mt-4" htmlFor="weight">
            Körpergewicht
          </label>
          <div className="flex items-center gap-2">
            <input
              id="weight"
              className="input flex-1"
              type="number"
              inputMode="decimal"
              min={30}
              max={300}
              step={0.5}
              value={bodyWeightKg}
              onChange={(e) => {
                const n = parseFloat(e.target.value.replace(',', '.'))
                if (Number.isFinite(n)) void saveSettings({ bodyWeightKg: n })
              }}
            />
            <span className="text-sm text-muted">kg</span>
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <label className="label" htmlFor="met">
              MET-Wert
            </label>
            <span className="font-semibold tabular-nums">
              {metValue.toFixed(1)}
            </span>
          </div>
          <input
            id="met"
            className="w-full accent-brand"
            type="range"
            min={MET_MIN}
            max={MET_MAX}
            step={MET_STEP}
            value={metValue}
            onChange={(e) =>
              void saveSettings({ metValue: parseFloat(e.target.value) })
            }
          />
          <p className="mt-1 text-xs text-muted">{metLabel(metValue)}</p>
          <p className="mt-3 text-xs text-neutral-600">
            Kalorien = MET × Körpergewicht × Dauer in Stunden. Der Wert wird beim
            Beenden eines Trainings festgeschrieben – Änderungen hier gelten nur
            für zukünftige Trainings.
          </p>
        </section>

        {/* Backup */}
        <section className="card">
          <h2 className="mb-3 font-bold">Sicherung</h2>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-primary" onClick={() => downloadBackup()}>
              Exportieren
            </button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              Datei importieren
            </button>
          </div>
          <button
            className="btn-ghost mt-2 w-full"
            onClick={() => { setPasteVal(''); setImportErr(null); setPasteOpen(true) }}
          >
            Aus Text einfügen
          </button>
          <p className="mt-2 text-xs text-neutral-500">
            Cloud-Import (OneDrive, Drive …): „Datei importieren" öffnet den
            System-Dateipicker – dort oben die Quelle wechseln. Falls die Cloud
            dort nicht auftaucht, die Sicherung öffnen, den Inhalt kopieren und
            hier „Aus Text einfügen".
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="*/*"
            className="hidden"
            onChange={onPickFile}
          />
          {counts ? (
            <p className="mt-3 text-xs text-neutral-500">
              Gespeichert: {counts.plans} Pläne · {counts.sessions} Trainings ·{' '}
              {counts.exercises} Übungen
            </p>
          ) : null}
          {importErr ? (
            <p className="mt-2 text-sm text-red-400">{importErr}</p>
          ) : null}
        </section>

        {/* Orte */}
        <section className="card">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 font-bold">Orte</h2>
            <button
              className="btn-ghost btn-sm h-9 w-9 rounded-full p-0"
              onClick={() => { setAddKind('location'); setAddVal('') }}
              aria-label="Ort hinzufügen"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
          {settings && settings.locations.length > 0 ? (
            <ul className="space-y-1">
              {settings.locations.map((l) => {
                const m = manufacturerForLocation(settings, l)
                return (
                  <li key={l} className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setEditLoc(l)
                        setEditLocVal(m)
                      }}
                    >
                      <span className="block truncate text-sm">{l}</span>
                      <span
                        className={
                          'block truncate text-xs ' +
                          (m ? 'text-muted' : 'text-warn')
                        }
                      >
                        {m || 'Kein Hersteller – zum Festlegen tippen'}
                      </span>
                    </button>
                    <button
                      className="p-1 text-neutral-500 active:text-red-400"
                      onClick={() => removeLocation(l)}
                      aria-label="Entfernen"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">
              Noch keine Orte – werden beim Training automatisch gemerkt.
            </p>
          )}
          <p className="mt-2 text-xs text-neutral-600">
            Der Geräte-Hersteller wird einmalig beim Anlegen eines Ortes gesetzt.
            Hier ist der einzige Weg, ihn nachträglich zu ändern.
          </p>
        </section>

        {/* Home-Gym (Punkt 2): Steigerungsrate fuer veraltete Orts-Treffer */}
        <section className="card">
          <h2 className="mb-1 font-bold">Home-Gym</h2>
          <p className="mb-3 text-xs text-muted">
            Dient als Referenz für Gewichts-Vorschläge, wenn du ein selten besuchtes
            Studio wieder betrittst.
          </p>
          <select
            className="input"
            value={settings?.homeLocation ?? ''}
            onChange={(e) => saveSettings({ homeLocation: e.target.value || undefined })}
          >
            <option value="">
              Automatisch{autoHomeLocation ? ` (${autoHomeLocation})` : ''}
            </option>
            {(settings?.locations ?? []).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </section>

        {/* Nicht getrackte Einheiten */}
        <section className="card">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="flex-1 font-bold">Weitere Einheiten</h2>
            <button
              className="btn-ghost btn-sm h-9 w-9 rounded-full p-0"
              onClick={() => { setAddKind('activity'); setAddVal('') }}
              aria-label="Einheit hinzufügen"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-xs text-muted">
            Einheiten, die du nicht mitträgst, aber im Kalender abhaken willst.
          </p>
          {activityTypes.length > 0 ? (
            <ul className="space-y-1">
              {activityTypes.map((t) => {
                const assignable = isDayAssignable(settings, t)
                return (
                  <li key={t} className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2">
                    <span className="flex-1 truncate text-sm">{t}</span>
                    <button
                      className={
                        'rounded-md border px-2 py-1 text-xs font-medium ' +
                        (assignable
                          ? 'border-brand bg-brand/15 text-brand'
                          : 'border-line text-muted')
                      }
                      onClick={() => toggleDayAssignable(t)}
                      aria-pressed={assignable}
                    >
                      Trainingstag zuordnen
                    </button>
                    <button
                      className="p-1 text-neutral-500 active:text-red-400"
                      onClick={() => removeActivityType(t)}
                      aria-label="Entfernen"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">Keine Typen angelegt.</p>
          )}
        </section>

        {/* Hersteller */}
        <section className="card">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 font-bold">Geräte-Hersteller</h2>
            <button
              className="btn-ghost btn-sm h-9 w-9 rounded-full p-0"
              onClick={() => { setAddKind('manufacturer'); setAddVal('') }}
              aria-label="Hersteller hinzufügen"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
          {settings ? (
            <ul className="space-y-1">
              {settings.manufacturers.map((m) => (
                <li key={m} className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2">
                  <span className="flex-1 truncate text-sm">{m}</span>
                  <button
                    className="p-1 text-neutral-500 active:text-red-400"
                    onClick={() => removeManufacturer(m)}
                    aria-label="Entfernen"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <p className="pb-4 text-center text-xs text-neutral-600">
          Gym Tracker · offline & lokal · v1.0
        </p>
      </div>

      {/* Import aus Text (Cloud-Fallback) */}
      <Sheet open={pasteOpen} onClose={() => setPasteOpen(false)} title="Sicherung aus Text">
        <p className="mb-3 text-sm text-neutral-300">
          Öffne die Sicherungsdatei (z. B. in OneDrive), kopiere den kompletten
          Inhalt und füge ihn hier ein.
        </p>
        <textarea
          className="input h-40 resize-none font-mono text-xs"
          autoFocus
          value={pasteVal}
          placeholder='{"app":"gym-tracker", …}'
          onChange={(e) => setPasteVal(e.target.value)}
        />
        <button
          className="btn-primary mt-4 w-full"
          disabled={!pasteVal.trim()}
          onClick={usePastedText}
        >
          Weiter
        </button>
      </Sheet>

      {/* Import-Modus waehlen */}
      <Sheet open={!!pendingFile} onClose={() => setPendingFile(null)} title="Sicherung importieren">
        <p className="mb-4 text-sm text-neutral-300">
          Sollen die aktuellen Daten ersetzt oder mit der Sicherung zusammengeführt
          werden?
        </p>
        <div className="space-y-2">
          <button className="btn-primary w-full" onClick={() => runImport(true)}>
            Ersetzen (empfohlen bei Wiederherstellung)
          </button>
          <button className="btn-ghost w-full" onClick={() => runImport(false)}>
            Zusammenführen
          </button>
        </div>
      </Sheet>

      {/* Import-Ergebnis */}
      <Sheet open={!!importInfo} onClose={() => setImportInfo(null)} title="Import abgeschlossen">
        {importInfo ? (
          <p className="mb-4 text-neutral-300">
            {importInfo.plans} Pläne, {importInfo.sessions} Trainings und{' '}
            {importInfo.exercises} Übungen wurden eingelesen.
          </p>
        ) : null}
        <button className="btn-primary w-full" onClick={() => setImportInfo(null)}>
          OK
        </button>
      </Sheet>

      {/* Hersteller eines Ortes aendern */}
      <Sheet
        open={!!editLoc}
        onClose={() => setEditLoc(null)}
        title={editLoc ? `Hersteller für ${editLoc}` : ''}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {settings?.manufacturers.map((m) => (
            <button
              key={m}
              className={'chip ' + (m === editLocVal ? 'chip-active' : '')}
              onClick={() => setEditLocVal(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <input
          className="input"
          value={editLocVal}
          placeholder="Anderer Hersteller…"
          onChange={(e) => setEditLocVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveLocManufacturer()}
        />
        <p className="mt-2 text-xs text-neutral-600">
          Gilt für alle Geräte an diesem Ort. Bereits gespeicherte Trainings
          bleiben unverändert.
        </p>
        <button
          className="btn-primary mt-4 w-full"
          disabled={!editLocVal.trim()}
          onClick={saveLocManufacturer}
        >
          Speichern
        </button>
      </Sheet>

      {/* Wert hinzufuegen */}
      <Sheet
        open={!!addKind}
        onClose={() => setAddKind(null)}
        title={
          addKind === 'location'
            ? 'Ort hinzufügen'
            : addKind === 'activity'
              ? 'Einheit hinzufügen'
              : 'Hersteller hinzufügen'
        }
      >
        <input
          className="input"
          autoFocus
          value={addVal}
          placeholder={
            addKind === 'location'
              ? 'z. B. Gold’s Gym'
              : addKind === 'activity'
                ? 'z. B. Schwimmen'
                : 'z. B. Cybex'
          }
          onChange={(e) => setAddVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addValue()}
        />
        <button className="btn-primary mt-4 w-full" onClick={addValue}>
          Hinzufügen
        </button>
      </Sheet>
    </div>
  )
}
