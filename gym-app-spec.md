# Gym-Tracking-App – Build-Guideline

Spezifikation für eine schlanke, statische Trainings-Tracking-Website. Diese Datei dient als verbindliche Vorgabe für die Implementierung (durch KI oder Entwickler). Punkte unter **MUSS** sind verpflichtend, **SOLL** ist gewünscht, **KANN** ist optional.

---

## 1. Zielbild & Rahmen

Eine **statische Single-Page-Web-App**, gehostet als **GitHub Pages** aus einem öffentlichen oder privaten Repository. Bewusst **keine** vollwertige App, kein Backend, kein Login.

- **MUSS** vollständig clientseitig laufen (HTML/CSS/JS, ein Build-Artefakt, das GitHub Pages ausliefern kann).
- **MUSS** auf iOS Safari nutzbar sein und sich über „Zum Home-Bildschirm" wie eine App öffnen lassen (Web-App-Manifest + passende Meta-Tags).
- **MUSS** offline lauffähig sein, sobald einmal geladen (Service Worker). Online-Verbindung ist Normalfall, darf aber nicht Voraussetzung sein.
- **MUSS** mobil-first gestaltet sein. Große Touch-Targets, gut bedienbar mit einer Hand und verschwitzten Fingern zwischen den Sätzen.

### Empfohlener Stack
- Vite + React + TypeScript, Tailwind CSS.
- `vite-plugin-pwa` für Service Worker und Manifest.
- Hosting: GitHub Pages (Build nach `dist/`, Deployment via GitHub Action oder `gh-pages`-Branch). `base`-Pfad in der Vite-Config auf den Repo-Namen setzen.
- Keine externen Laufzeit-Dienste, keine Tracker, keine Analytics, keine CDN-Abhängigkeit zur Laufzeit.

---

## 2. Datenschutz & Speicherung (kritisch)

- **MUSS** alle Daten ausschließlich **lokal im Browser** speichern. Empfehlung: **IndexedDB** (z. B. via Dexie.js), nicht `localStorage` (zu klein, kein Query).
- **MUSS** ohne jede Netzwerk-Datenübertragung der Trainingsdaten auskommen. Kein Server, keine API, kein Cloud-Sync. Daten verlassen das Gerät nur, wenn der Nutzer aktiv exportiert oder einen Screenshot teilt.
- **MUSS** ohne Cookies, ohne Third-Party-Requests und ohne Telemetrie arbeiten.
- Hinweis im Datenmodell-Design: Da rein lokal gespeichert wird, sind die Daten an Browser + Gerät gebunden. Schutz „von außen" ist damit strukturell gegeben (es existiert kein externer Endpunkt). Der einzige Verlustpfad ist lokales Löschen → deshalb der Export (Abschnitt 7).

---

## 3. Kerndaten-Modell

Klare Trennung zwischen **Vorlage** (Plan) und **Instanz** (durchgeführtes Training). Das ist die wichtigste Architekturentscheidung: Abweichungen beim Training dürfen die Vorlage nie verändern.

### 3.1 Exercise (Übungs-Stammdaten)
- `id`, `name` (z. B. „Bankdrücken"), `muscleGroup` (optional, z. B. „Brust").
- Wird von Plänen und Sessions referenziert.

### 3.2 Plan / Split (Vorlage)
- Der Nutzer hat einen **Split-Trainingsplan** mit mehreren Trainingstagen (z. B. Push / Pull / Legs).
- **MUSS**: Ein Plan besteht aus mehreren benannten **Trainingstagen** (`PlanDay`), jeder Trainingstag aus einer geordneten Liste von Übungen mit Zielvorgaben.
- Pro Übung im Plan: Ziel-Sätze, Ziel-Wiederholungen, optional Ziel-Gewicht/Hinweis.
- Vorlagen sind editierbar und wiederverwendbar.

### 3.3 WorkoutSession (durchgeführtes Training, Instanz)
- Entsteht durch Auswahl eines `PlanDay` → die Übungen werden in die Session **kopiert** (nicht referenziert), sodass freie Abweichung möglich ist.
- **MUSS** beim Training live modifizierbar sein: Übung tauschen/ergänzen/entfernen, Satz hinzufügen/löschen, Gewicht und Wiederholungen anpassen — ohne Rückwirkung auf den Plan.
- Felder auf Session-Ebene:
  - `date` (Zeitstempel)
  - **`location`** (Ort, Freitext oder Auswahl bereits genutzter Orte) — **MUSS**
  - **`equipmentManufacturer`** (Geräte-Hersteller, **pro Training** gewählt, da Gewichte je Hersteller variieren; Auswahl + Freitext, z. B. Technogym, Life Fitness, Hammer Strength, Gym80, frei) — **MUSS**
  - **`durationSeconds`** (Trainingsdauer, getrackt) — **MUSS**
  - Referenz auf den zugrunde liegenden `PlanDay` (für Kontext, optional null bei freiem Training).

### 3.4 SetLog (einzelner Satz)
- Gehört zu einer Session + Übung.
- Felder: `weight`, `reps`, `done` (Flag), Reihenfolge/Index, optional `note`.
- Basis für die Zusammenfassung und spätere Auswertung.

---

## 4. Hersteller / Ort am Gewicht

- **MUSS**: Hersteller wird **pro Training** gesetzt (ein Ort = ein Hersteller-Setting für die ganze Session). Keine Auswahl pro Übung.
- **SOLL**: Bei neuer Session werden Ort und Hersteller mit den zuletzt genutzten Werten vorbelegt, schnell änderbar.
- Begründung im Modell festhalten: Gewichte sind nicht 1:1 zwischen Herstellern vergleichbar. Der Hersteller-Tag macht spätere Vergleiche interpretierbar.

---

## 5. Trainingsdauer-Tracking

- **MUSS**: Beim Start einer Session läuft ein Timer (Startzeit festhalten). Beim Beenden wird die Gesamtdauer gespeichert.
- **SOLL**: Timer überlebt App-Wechsel / Bildschirmsperre (Dauer aus Start-/Endzeitstempel berechnen, nicht aus laufendem Intervall, damit Backgrounding nicht verfälscht).
- **KANN**: Pausieren/Fortsetzen.

---

## 6. Zusammenfassung für den Personal Trainer

- **MUSS**: Am Ende eines Trainings eine kompakte **Zusammenfassung** erzeugen, die der Nutzer als **Screenshot** abfotografieren/teilen kann.
- Inhalt (laut Festlegung: **nur Ist-Werte**, kein Soll/Ist-Vergleich):
  - Datum, Ort, Hersteller, Gesamtdauer.
  - Pro Übung: tatsächlich absolvierte Sätze mit Gewicht × Wiederholungen.
  - Optional kurzes Gesamt-Volumen pro Übung (Summe Gewicht × Reps), wenn Hersteller einheitlich.
- **MUSS**: Diese Ansicht ist als sauberer, screenshot-tauglicher Bildschirm gestaltet (klare Typo, kein abgeschnittener Inhalt, alles auf einer scrollbaren Karte, gut lesbar bei Weitergabe).
- **KANN**: Ein Button „Als Bild speichern" (z. B. via `html-to-image`/Canvas), rein lokal, ohne Upload. Screenshot bleibt der Fallback.

---

## 7. Backup / Export

- **MUSS**: **JSON-Export** der gesamten lokalen Datenbank (Pläne, Sessions, SetLogs, Übungen) als Download.
- **MUSS**: **JSON-Import**, der einen Export wieder einliest (Datenwiederherstellung nach Browser-Reset oder Gerätewechsel).
- **SOLL**: Klarer Hinweis in der UI, dass Daten lokal liegen und ein Export die einzige Sicherung ist.

---

## 8. Views / Screens

1. **Pläne / Split verwalten**
   - Trainingstage anlegen/bearbeiten/löschen, Übungen je Tag mit Zielwerten zuweisen, Reihenfolge sortierbar.
2. **Training starten / aktives Training**
   - Trainingstag wählen → Ort + Hersteller bestätigen/ändern → Session startet (Timer läuft).
   - Satz-für-Satz abhaken, Werte inline anpassen, Übung/Satz live ergänzen oder tauschen.
   - **SOLL**: optionaler Rest-Timer pro Satz.
   - „Freies Training" ohne Plan **KANN** möglich sein.
3. **Training beenden → Zusammenfassung** (Abschnitt 6).
4. **Verlauf**
   - Liste vergangener Sessions nach Datum, mit Ort/Hersteller/Dauer; Detailansicht je Session.
   - **KANN**: einfacher Verlauf pro Übung (Gewicht über Zeit). Nicht im Mindestumfang.
5. **Einstellungen**
   - Export / Import, Liste der Orte und Hersteller pflegen.

---

## 9. UX-Leitlinien

- Mobil-first, Dark Mode als Standard (Gym-Beleuchtung).
- Große Buttons, Eingabefelder mit numerischem Keypad für Gewicht/Reps.
- Minimale Klickwege im aktiven Training: der häufigste Vorgang (Satz abhaken, Wert ändern) muss mit einer Berührung erreichbar sein.
- Keine Registrierung, kein Onboarding-Zwang. App ist nach dem Öffnen sofort nutzbar.

---

## 10. Nicht-Ziele (bewusst ausgeschlossen)

- Kein Multi-Device-Sync, kein Cloud-Account.
- Kein Soll/Ist- oder Progressions-Vergleich in der Trainer-Zusammenfassung (nur Ist-Werte).
- Kein Hersteller pro Übung (nur pro Training).
- Keine Social-/Sharing-Features außer dem lokal erzeugten Screenshot/Bild.
- Keine Ernährungs-, Körpergewichts- oder Wearable-Integration (kann später nachgezogen werden, nicht jetzt).

---

## 11. Definition of Done (Mindestumfang)

Die erste lauffähige Version gilt als fertig, wenn:
1. Ein Split-Plan mit mehreren Trainingstagen angelegt und bearbeitet werden kann.
2. Ein Training aus einem Tag gestartet werden kann, mit Ort, Hersteller und laufendem Dauer-Timer.
3. Während des Trainings frei abgewichen werden kann (Sätze/Übungen/Werte), ohne den Plan zu verändern.
4. Beim Beenden eine screenshot-taugliche Ist-Wert-Zusammenfassung erscheint.
5. Alle Daten lokal in IndexedDB persistieren und als JSON exportiert/importiert werden können.
6. Die Seite als statisches Build auf GitHub Pages läuft, offline-fähig und auf iOS installierbar ist.
