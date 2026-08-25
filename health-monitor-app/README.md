# ❤️ Health Monitor

A beautiful, **offline-first** personal health monitoring dashboard. Track your daily vitals, spot trends, hit your goals — and keep full ownership of your data (everything is stored locally in your browser).

![Tech](https://img.shields.io/badge/vanilla-JS-f7df1e) ![Chart.js](https://img.shields.io/badge/charts-Chart.js-ff6384) ![Deploy](https://img.shields.io/badge/deploy-Vercel-black)

## ✨ Features

- **📊 Dashboard** — stat cards for Heart Rate, Blood Pressure, Weight, Sleep, Water & Steps, with day-over-day deltas
- **🎯 Daily goals** — progress bars for hydration (8 glasses), sleep (8 hrs) and steps (10,000)
- **🌿 Daily Wellbeing** — rotating positive mental-health quotes plus a personalized, emoji-toned suggestion computed *offline* from your own data (stress check-ins, sleep hygiene, hydration nudges, supportive messages)
- **📝 Condition summary** — one tap writes a narrative passage about your recent condition: fully offline by default, or plug in your own Groq/OpenAI-compatible API key for AI-written versions (only anonymous numeric stats are sent — never your notes)
- **🔥 Streaks** — keeps you motivated with a daily logging streak counter
- **📈 Trends** — interactive Chart.js line charts over 7 / 14 / 30 / 90-day ranges with avg / min / max summaries
- **🕘 History** — searchable table of every entry with edit & delete
- **⚖️ BMI** — body-mass-index card with category badge (Underweight / Healthy / Overweight / Obese) and your healthy weight range for the height you set
- **🔔 Daily reminder** — optional browser notification around 8 PM when today's entry is still missing (once per day)
- **💾 Your data, your device** — persisted in `localStorage`; export/import as JSON or CSV anytime
- **🎲 Sample data** — one click generates 30 days of realistic demo data
- **🌗 Light & dark themes**, fully responsive layout

## 🧰 Tech Stack

- Vanilla JavaScript (no frameworks, no build step)
- [Chart.js](https://www.chartjs.org/) (vendored locally in `vendor/`)
- Modern CSS (custom properties, `color-mix`, grid)
- Deployed on [Vercel](https://vercel.com)

## 🚀 Run Locally

It's a static site — just open it:

```bash
# option 1: double-click index.html
# option 2: serve it
npx serve .
# or
python -m http.server 8000
```

## ☁️ Deploy to Vercel

One click:

> [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yogishwaraudupa/health-monitor-app)

Or with the CLI:

```bash
npm i -g vercel
vercel deploy --prod
```

## 📁 Project Structure

```
health-monitor-app/
├── index.html          # App shell (single page)
├── css/styles.css      # Design system + components
├── js/app.js           # State, storage, rendering, charts
├── test/csv-import.test.mjs  # Node test for the CSV import pipeline
├── vendor/chart.umd.min.js
├── vercel.json         # Security headers + clean URLs
├── LICENSE             # MIT
└── README.md
```

## 🔒 Privacy

There is **no backend, no analytics, no cookies**. Entries live in your browser's `localStorage` and are never transmitted anywhere. The optional AI passage mode is the single exception *you* control: it sends only anonymous numeric summaries (never raw notes) to the provider whose API key you supply.

## 📄 License

[MIT](./LICENSE)
