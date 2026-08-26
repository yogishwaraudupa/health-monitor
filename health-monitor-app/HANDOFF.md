# 📦 Project Handoff — Health Monitor

> **Status:** Stable / production-ready · All tests passing · Last updated: 2026-08-26
> **Audience:** Developer or team taking over maintenance of this project.

---

## 1. What is this?

**Health Monitor** is an **offline-first, single-page personal vitals dashboard** built with vanilla JavaScript — no frameworks, no build step, no backend. Users track heart rate, blood pressure, weight, sleep, hydration, steps, mood and stress daily. All data is stored **only in the user's browser** (`localStorage`) and never transmitted anywhere.

- **Repo:** https://github.com/yogishwaraudupa/health-monitor-app
- **Hosting:** Vercel
  - Org/team ID: `team_k4tEfkiZCzLbQdSj1lvRnKBt`
  - Project ID: `prj_umcUdA7yhLt31HdESjhv3MOBGkZ1`
  - Linked locally via `.vercel/project.json`
- **License:** MIT (`LICENSE`)

## 2. Tech stack

| Layer     | Choice                                             |
|-----------|----------------------------------------------------|
| Frontend  | Vanilla JS (ES2020+), single page, no build step   |
| Charts    | Chart.js — vendored at `vendor/chart.umd.min.js`   |
| Styling   | Modern CSS (custom properties, `color-mix`, grid), light + dark themes |
| Storage   | Browser `localStorage` (no server)                 |
| Tests     | Plain Node script with browser-DOM stubs           |
| Deploy    | Vercel static site                                 |

## 3. How to run

```bash
# Option A: just open index.html in a browser (it's a static site)
# Option B: serve it
npx serve .
python -m http.server 8000
```

No `npm install` required — there are zero runtime dependencies.

## 4. How to test

```bash
node test/csv-import.test.mjs
```

The test loads `js/app.js` with minimal browser stubs (`document`, `window`, `localStorage`) via an indirect eval, then verifies:

- CSV import pipeline (`parseCSV` → `csvToEntries`): numeric coercion, quoted fields, malformed-row skipping, out-of-range value rejection
- Export/import round-trip (column order matches `exportCSV`)
- Wellbeing brain (quote-of-the-day stability, welcome tip on empty state)
- Offline condition-summary engine

**Known-good state as of handoff: `ALL TESTS PASSED ✅`.**

## 5. Deployment

```bash
npm i -g vercel
vercel deploy --prod      # from within health-monitor-app/
```

Or use the one-click deploy button in `README.md`.

`vercel.json` configures:
- `cleanUrls: true`
- Security headers on all routes: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`


## 6. Code map (`js/app.js`, ~1230 lines)

The app lives almost entirely in one file, organized by banner-comment sections:

| Section | Responsibility |
|---|---|
| Constants | localStorage keys, goals, metric definitions, quotes, stress labels, AI system prompt |
| State | In-memory state object + active chart reference |
| Tiny DOM helpers / Utils | `$`, `$$`, date formatting, etc. |
| Storage | `loadEntries()` / `persist()` against `hm.entries.v1` |
| Derived data | Sorting, streaks, averages, deltas |
| Mutations | Add/edit/delete entries |
| Rendering: dashboard / trends / history | Stat cards, Chart.js line charts (7/14/30/90-day ranges), searchable table |
| Toasts / Theme / Tabs | UI chrome; theme + tab persisted |
| Sample data | One-click 30-day demo dataset |
| Entry dialog | Add/edit `<dialog>` form with validation |
| History row actions | Inline edit/delete |
| Export / Import | JSON backup + CSV (with UTF-8 BOM for Excel) |
| CSV import | `parseCSV`, `csvToEntries` |
| Feature: BMI | Height setting + category badge + healthy weight range |
| Feature: daily log reminder | Notification API, ~8 PM local, once/day |
| Rendering: daily wellbeing | Rotating quotes + rule-based offline tips |
| Condition summary | Offline narrative engine; optional AI mode |
| Render all / Event wiring / Init | Bootstrap |

`index.html` is the full app shell; `css/styles.css` holds the design system.

## 7. Data model & storage keys

Entry shape (one per day):

```json
{
  "date": "YYYY-MM-DD",
  "heartRate": 72, "systolic": 120, "diastolic": 80,
  "weight": 70.5, "sleepHours": 7.5, "waterGlasses": 8,
  "steps": 10000,
  "mood": "great|good|ok|low|bad",
  "stress": 1,
  "notes": "free text (max 280)"
}
```

All numeric fields are optional/null-safe. localStorage keys:

| Key | Purpose |
|---|---|
| `hm.entries.v1` | All entries (JSON array) |
| `hm.theme` | `light` \| `dark` |
| `hm.tab` | Last active tab |
| `hm.heightCm` | Height for BMI |
| `hm.reminder.v1` | Reminder enabled flag + `lastNotified` |
| `hm.ai.v1` | Optional user-supplied AI config (`provider`, `key`, `model`, `baseUrl`) |
| `hm.passage.v1` | Last generated condition summary |

⚠️ If you change the entry schema, bump the `STORAGE_KEY` version suffix and write a migration.

## 8. AI integration (optional feature)

By default the condition summary is generated **fully offline** by a rule-based engine. Optionally the user can paste their own Groq/OpenAI-compatible API key (stored in `hm.ai.v1`). When enabled:

- Only **anonymous numeric summaries** are sent — never raw notes.
- The system prompt (`AI_SYSTEM_PROMPT`) constrains output to one short paragraph, no diagnosis, no markdown.

There is **no server-side secret** — nothing to rotate on handoff.

## 9. Privacy & security posture

- No backend, no analytics, no cookies, no telemetry.
- The only network call ever made is the *user-initiated, user-keyed* AI request.
- Vercel security headers configured in `vercel.json`.
- Keep it this way unless there's an explicit product decision otherwise.

## 10. Known limitations / suggested next steps

- **Data siloed per browser** — clearing browser data deletes everything; export/import exists but is manual.
- **No service worker/PWA** — "offline-first" means no backend dependency, not installable offline caching. A service worker would be a natural enhancement.
- **Single test file** — coverage focuses on CSV import, wellbeing and summary engines; rendering/charts are untested (would need a DOM harness).
- **No CI** — consider wiring `node test/csv-import.test.mjs` into GitHub Actions.
- **Chart.js is vendored** — update `vendor/chart.umd.min.js` manually when upgrading.

## 11. Handoff checklist for the new owner

- [ ] Get access: GitHub repo (`yogishwaraudupa/health-monitor-app`) + Vercel team `team_k4tEfkiZ…`
- [ ] Run `node test/csv-import.test.mjs` → expect `ALL TESTS PASSED ✅`
- [ ] Run locally and smoke-test: add entry → dashboard/trends/history, export/import CSV+JSON, theme toggle, BMI, reminder toggle, sample data
- [ ] Verify production deploy works (`vercel deploy --prod`)
- [ ] Read `README.md` for the user-facing feature list

