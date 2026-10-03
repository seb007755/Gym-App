
---

### Technical Specification & Implementation Prompt



**Goal:** Implement a sleek, highly legible dark mode UI optimized for quick interaction during workouts, applying modern UI/UX design patterns (Option B variant) and updating the application icon.

---

### 1. Color System (Option B - Modern Athletic / Red Accent)

Implement the following design tokens / CSS variables:

```css
:root {
  /* Backgrounds */
  --bg-app: #0D1117;           /* Deep dark blue-grey canvas */
  --bg-card: #161B22;          /* Elevated surface for workout modules */
  --bg-input: #0D1117;         /* Recessed input background */
  
  /* Accents & States */
  --accent-primary: #FF3B30;   /* Active Red (Buttons, Focus States, Active Timers) */
  --accent-hover: #D73229;     /* Darker Red for hover/active states */
  --status-success: #30D158;   /* Green for completed sets */
  
  /* Borders & Dividers */
  --border-subtle: rgba(255, 255, 255, 0.08); /* Subtle card definition */
  --border-focus: #FF3B30;      /* Highlighted input border */

  /* Typography */
  --text-primary: #E6EDF3;     /* Main text & numbers (High contrast) */
  --text-secondary: #8B949E;   /* Labels, units, inactive elements */
  --text-on-accent: #FFFFFF;   /* Text on primary red buttons */
}

```

---

### 2. UI Components & Layout Guidelines

1. **Cards & Containers:**
* Background: `var(--bg-card)`
* Border: `1px solid var(--border-subtle)`
* Border Radius: `12px`
* Padding: `16px`
* Spacing: `12px` gap between list items / exercise cards.


2. **Input Fields (Weight / Reps):**
* Background: `var(--bg-input)`
* Font: Semi-bold / Bold, large font size (`18px`–`24px`) for fast readability.
* Text color: `var(--text-primary)`
* Focus state: `1.5px solid var(--border-focus)` box-shadow/border glow.
* Labels (e.g., "KG", "WDH"): Uppercase, `11px`, color `var(--text-secondary)`, `letter-spacing: 0.05em`.


3. **Buttons:**
* **Primary Action (e.g., "Satz speichern"):**
* Background: `var(--accent-primary)` (`#FF3B30`)
* Text color: `var(--text-on-accent)`
* Font weight: Bold (`600` / `700`)
* Min height: `48px` (touch-friendly)
* Border radius: `8px`


* **Stepper Buttons (`+` / `-`):**
* Dimensions: Min `44x44px` square tap target
* Background: `rgba(255, 255, 255, 0.05)`
* Text/Icon: `var(--text-primary)`





---

### 3. Application Icon Specification

Update the application icon asset according to the following specification:

* **Background:** Deep blue-grey (`#0D1117`) matching `--bg-app`.
* **Central Motif:** Dumbbell emoji (`🏋️‍♂️` or `🏋️` / stylized dumbbell graphic) centered in the frame.
* **Accent Ring / Framing:** A subtle circular or rounded-rect border in Accent Red (`#FF3B30`) surrounding the icon to integrate the app's visual identity.
* **Formats to Generate:**
* Web/PWA: `192x192.png`, `512x512.png`, `apple-touch-icon.png`
* iOS/Android app assets (if applicable).



---

### 4. Definition of Done (Refactoring Checklist)

* [x] Global background set to `#0D1117`.
* [x] Cards use `#161B22` with a `1px` border of `rgba(255, 255, 255, 0.08)`.
* [x] Primary CTAs rendered in `#FF3B30` with white text.
* [x] Input fields styled with recessed background and high-contrast numerical typography.
* [x] App icon updated with the dumbbell motif on dark background with red accent ring.

Implementiert und live. Seit v2.1 gibt es zusätzlich ein zweites, eng begrenztes
Akzent-Farbschema ("Plan-Modus", Indigo `#5E5CE6`) ausschließlich auf den beiden
Plan-Bearbeiten-Screens — siehe `gym-app-spec.md` Abschnitt 12.1. Das hier
beschriebene Rot bleibt überall sonst (inkl. Training) die einzige Akzentfarbe.
