import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, saveSettings } from '../db'
import { downloadBackup, importBackup, type ImportResult } from '../lib/backup'
import { TopBar, Sheet } from '../components/ui'
import { PlusIcon, TrashIcon } from '../components/icons'

export default function SettingsPage() {
  const settings = useLiveQuery(() => getSettings(), [])
  const counts = useLiveQuery(async () => ({
    plans: await db.plans.count(),
    sessions: await db.sessions.count(),
    exercises: await db.exercises.count(),
  }), [])

  const fileRef = useRef<HTMLInputElement>(null)
  const [importInfo, setImportInfo] = useState<ImportResult | null>(null)
  const [importErr, setImportErr] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<string | null>(null)
  const [addKind, setAddKind] = useState<'location' | 'manufacturer' | null>(null)
  const [addVal, setAddVal] = useState('')

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
    } else {
      if (!settings.manufacturers.includes(v)) {
        await saveSettings({ manufacturers: [...settings.manufacturers, v] })
      }
    }
    setAddVal('')
    setAddKind(null)
  }

  async function removeLocation(l: string) {
    if (!settings) return
    await saveSettings({ locations: settings.locations.filter((x) => x !== l) })
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

        {/* Backup */}
        <section className="card">
          <h2 className="mb-3 font-bold">Sicherung</h2>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-primary" onClick={() => downloadBackup()}>
              Exportieren
            </button>
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              Importieren
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
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
              {settings.locations.map((l) => (
                <li key={l} className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2">
                  <span className="flex-1 truncate text-sm">{l}</span>
                  <button
                    className="p-1 text-neutral-500 active:text-red-400"
                    onClick={() => removeLocation(l)}
                    aria-label="Entfernen"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">
              Noch keine Orte – werden beim Training automatisch gemerkt.
            </p>
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

      {/* Wert hinzufuegen */}
      <Sheet
        open={!!addKind}
        onClose={() => setAddKind(null)}
        title={addKind === 'location' ? 'Ort hinzufügen' : 'Hersteller hinzufügen'}
      >
        <input
          className="input"
          autoFocus
          value={addVal}
          placeholder={addKind === 'location' ? 'z. B. Gold’s Gym' : 'z. B. Cybex'}
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
