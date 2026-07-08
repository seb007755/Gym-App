# Gym Tracker

Eine schlanke, **statische** Trainings-Tracking-PWA. Läuft vollständig im Browser,
speichert alle Daten **lokal** (IndexedDB) und funktioniert **offline**. Kein Backend,
kein Login, keine Tracker. Umgesetzt nach [`gym-app-spec.md`](./gym-app-spec.md).

## Features

- **Pläne / Split** – Trainingstage (z. B. Push / Pull / Legs) mit Übungen und
  Zielwerten (Sätze × Wdh., optional Gewicht/Hinweis). Sortierbar, wiederverwendbar.
- **Aktives Training** – Trainingstag wählen, Ort + Geräte-Hersteller bestätigen,
  Timer läuft. Sätze mit einer Berührung abhaken, Werte inline anpassen, Übungen/Sätze
  live ergänzen oder tauschen – **ohne Rückwirkung auf den Plan** (Übungen werden beim
  Start kopiert, nicht referenziert). Optionaler Rest-Timer.
- **Zusammenfassung** – screenshot-taugliche Ist-Wert-Übersicht für den Personal
  Trainer (Datum, Ort, Hersteller, Dauer, Sätze mit kg × Wdh., Volumen). „Als Bild
  speichern" rein lokal.
- **Verlauf** – vergangene Trainings nach Datum mit Detailansicht.
- **Backup** – vollständiger JSON-Export/-Import der lokalen Datenbank.

## Datenschutz

Alle Trainingsdaten bleiben ausschließlich in **diesem Browser** (IndexedDB). Es gibt
keinen Server und keine Synchronisierung – die Daten verlassen das Gerät nur, wenn du
aktiv exportierst oder einen Screenshot teilst. **Der JSON-Export ist die einzige
Sicherung.**

## Entwicklung

```bash
npm install
npm run dev       # Dev-Server
npm run build     # Produktions-Build nach dist/
npm run preview   # Build lokal ansehen
```

Stack: Vite · React · TypeScript · Tailwind CSS · Dexie (IndexedDB) · vite-plugin-pwa.

## Auf iOS installieren

Seite in Safari öffnen → Teilen → **„Zum Home-Bildschirm"**. Danach startet sie im
Vollbild wie eine App und läuft offline.

## Deployment (GitHub Pages)

Konfiguriert für das Repository **`Gym-App`** → URL
`https://<user>.github.io/Gym-App/`. Genutzt werden `BrowserRouter` und
`base: '/Gym-App/'` (saubere URLs ohne `#`); `public/404.html` + ein Restore-Snippet
in `index.html` sorgen dafür, dass Deep-Links und Reloads auf GitHub Pages nicht ins
Leere laufen.

1. Repository nach GitHub pushen (Name: `Gym-App`).
2. **Settings → Pages → Source: GitHub Actions**.
3. Push auf `main` – der Workflow [`deploy.yml`](.github/workflows/deploy.yml) baut und
   veröffentlicht automatisch.

Alternativ manuell: `npm run build` und den Inhalt von `dist/` bereitstellen.

**Anderer Repo-Name?** Nur `base` in `vite.config.ts` (und `start_url`/`scope` im
`manifest`) anpassen – `basename` leitet sich automatisch aus `base` ab.
