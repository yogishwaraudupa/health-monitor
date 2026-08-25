'use strict';

/* ============================================================
   Health Monitor — offline-first personal vitals dashboard.
   All data stays in your browser (localStorage).
   ============================================================ */

/* ---------------- Constants ---------------- */
const STORAGE_KEY = 'hm.entries.v1';
const THEME_KEY = 'hm.theme';

const GOALS = { waterGlasses: 8, steps: 10000, sleepHours: 8 };

const METRICS = [
  { id: 'heartRate', label: 'Heart Rate', unit: 'bpm', color: '#f43f5e', icon: '❤️', decimals: 0, beginAtZero: false },
  { id: 'bloodPressure', label: 'Blood Pressure', unit: 'mmHg', color: '#fb923c', icon: '🩸', decimals: 0, beginAtZero: false },
  { id: 'weight', label: 'Weight', unit: 'kg', color: '#8b5cf6', icon: '⚖️', decimals: 1, beginAtZero: false },
  { id: 'sleepHours', label: 'Sleep', unit: 'hrs', color: '#6366f1', icon: '😴', decimals: 1, beginAtZero: true, higherIsBetter: true },
  { id: 'waterGlasses', label: 'Water', unit: 'gl', color: '#0ea5e9', icon: '💧', decimals: 0, beginAtZero: true, higherIsBetter: true },
  { id: 'steps', label: 'Steps', unit: '', color: '#f59e0b', icon: '🏃', decimals: 0, beginAtZero: true, higherIsBetter: true },
];

const MOODS = { great: '🤩', good: '🙂', ok: '😐', low: '😕', bad: '😞' };
const RANGES = [7, 14, 30, 90];

/* ---------------- State ---------------- */
let state = {
  entries: [],        // newest first after sorting helpers
  theme: 'light',
  tab: 'dashboard',
  metric: 'heartRate',
  rangeDays: 14,
  editingId: null,
  search: '',
};
let trendChart = null;

/* ---------------- Tiny DOM helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- Utils ---------------- */
const uid = () =>
  (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const todayISO = () => isoOf(new Date());

const isoDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoOf(d);
};

function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

function fmtNum(v, dec = 0) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: dec });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/* ---------------- Storage ---------------- */
function loadEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    state.entries = Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.date === 'string') : [];
  } catch {
    state.entries = [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

/* ---------------- Derived data ---------------- */
function sortedNewestFirst() {
  return [...state.entries].sort((a, b) => (
    a.date === b.date
      ? String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      : b.date.localeCompare(a.date)
  ));
}

function getLatestTwo() {
  const s = sortedNewestFirst();
  return [s[0] || null, s[1] || null];
}

const getEntryForDate = (iso) => state.entries.find((e) => e.date === iso) || null;

function computeStreak() {
  let cursor = todayISO();
  if (!getEntryForDate(cursor)) {
    cursor = isoDaysAgo(1);              // today not logged yet — grace period
    if (!getEntryForDate(cursor)) return 0;
  }
  let streak = 0;
  while (getEntryForDate(cursor)) {
    streak += 1;
    const d = new Date(`${cursor}T00:00:00`);
    d.setDate(d.getDate() - 1);
    cursor = isoOf(d);
  }
  return streak;
}

/* ---------------- Mutations ---------------- */
function upsertEntry(data) {
  const existing =
    state.entries.find((e) => e.id === state.editingId) ||
    state.entries.find((e) => e.date === data.date);

  if (existing) {
    Object.assign(existing, data, { id: existing.id, updatedAt: new Date().toISOString() });
  } else {
    state.entries.push({ ...data, id: uid(), createdAt: new Date().toISOString() });
  }
  persist();
}

function deleteEntry(id) {
  state.entries = state.entries.filter((e) => e.id !== id);
  persist();
}

/* ---------------- Rendering: dashboard ---------------- */
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil 🌙';
  if (h < 12) return 'Good morning ☀️';
  if (h < 17) return 'Good afternoon 🌤️';
  return 'Good evening 🌆';
}

function deltaChip(metricId, latest, prev) {
  const m = METRICS.find((x) => x.id === metricId);
  const key = metricId === 'bloodPressure' ? 'systolic' : metricId;
  const val = latest ? latest[key] : null;
  const pVal = prev ? prev[key] : null;

  if (val == null || pVal == null) return '';
  const diff = Number(val) - Number(pVal);
  if (diff === 0) return '<span class="delta flat">– no change</span>';

  const up = diff > 0;
  const good = m.higherIsBetter ? up : !up; // color is informational, not a judgement
  const arrow = up ? '▲' : '▼';
  const abs = fmtNum(Math.abs(diff), m.decimals);
  const unitTxt = m.unit ? ` ${m.unit}` : '';
  return `<span class="delta ${good ? 'good' : 'watch'}">${arrow} ${abs}${unitTxt}</span>`;
}

function statCards() {
  const [latest, prev] = getLatestTwo();
  return METRICS.map((m) => {
    let value = '—';
    if (latest) {
      if (m.id === 'bloodPressure') {
        const s = latest.systolic;
        const d = latest.diastolic;
        value = s == null && d == null ? '—' : `${s ?? '—'}/${d ?? '—'}`;
      } else {
        value = fmtNum(latest[m.id], m.decimals);
      }
    }
    return `
      <article class="stat-card card" data-metric="${m.id}" title="View ${m.label} trend" tabindex="0">
        <div class="stat-top">
          <span class="stat-icon" style="--accent:${m.color}" aria-hidden="true">${m.icon}</span>
          <span class="stat-label">${m.label}</span>
        </div>
        <p class="stat-value">${value}<span class="stat-unit">${m.unit ? ' ' + m.unit : ''}</span></p>
        <div class="stat-bottom">
          <span class="stat-date">${latest ? fmtDate(latest.date) : 'no data yet'}</span>
          ${deltaChip(m.id, latest, prev)}
        </div>
      </article>`;
  }).join('');
}

function goalsRows(todayEntry) {
  const defs = [
    { label: '💧 Hydration', goal: GOALS.waterGlasses, dec: 0, value: todayEntry?.waterGlasses },
    { label: '😴 Sleep', goal: GOALS.sleepHours, dec: 1, value: todayEntry?.sleepHours },
    { label: '🏃 Steps', goal: GOALS.steps, dec: 0, value: todayEntry?.steps },
  ];
  return defs.map((d) => {
    const v = d.value ?? 0;
    const pct = Math.max(0, Math.min(100, Math.round((v / d.goal) * 100)));
    const done = pct >= 100;
    return `
      <div class="goal-row">
        <span class="goal-label">${d.label}</span>
        <div class="goal-track"><div class="goal-fill${done ? ' done' : ''}" style="width:${pct}%"></div></div>
        <span class="goal-pct">${fmtNum(v, d.dec)}/${fmtNum(d.goal)} ${done ? '✅' : `(${pct}%)`}</span>
      </div>`;
  }).join('');
}

function renderDashboard() {
  $('#greeting').textContent = greeting();
  $('#today-date').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const streak = computeStreak();
  const streakEl = $('#streak-chip');
  streakEl.hidden = streak === 0;
  streakEl.textContent = `🔥 ${streak}-day streak`;

  const [latest] = getLatestTwo();
  $('#dash-empty').hidden = Boolean(latest);
  $('#stat-grid').innerHTML = statCards();

  const todayEntry = getEntryForDate(todayISO());
  const hintEl = $('#goals-hint');
  if (!latest) hintEl.textContent = 'Add your first entry or load sample data to see goals.';
  else if (!todayEntry) hintEl.textContent = `Nothing logged today yet (last entry ${fmtDate(latest.date)}).`;
  else hintEl.textContent = '';

  $('#goals-list').innerHTML = goalsRows(todayEntry);
}

/* ---------------- Rendering: trends ---------------- */
function metricChips() {
  $('#metric-chips').innerHTML = METRICS.map((m) => `
    <button class="chip${state.metric === m.id ? ' active' : ''}" data-metric="${m.id}"
      style="--chip:${m.color}">${m.icon} ${m.label}</button>`).join('');
  $('#range-chips').innerHTML = RANGES.map((r) => `
    <button class="chip${state.rangeDays === r ? ' active' : ''}" data-range="${r}"
      style="--chip:${'var(--grad-a)'}">${r}d</button>`).join('');
}

function buildDatasets(entriesAsc, metricId) {
  const labels = entriesAsc.map((e) => fmtDate(e.date));
  const mk = (key, color, label, dec) => ({
    label,
    data: entriesAsc.map((e) => (e[key] == null ? null : Number(e[key]))),
    borderColor: color,
    backgroundColor: (ctx) => {
      const { chart } = ctx.chart;
      const g = chart.ctx.createLinearGradient(0, 0, 0, chart.height || 320);
      g.addColorStop(0, hexToRgba(color, 0.22));
      g.addColorStop(1, hexToRgba(color, 0));
      return g;
    },
    fill: true,
    tension: 0.35,
    borderWidth: 2.5,
    pointRadius: 2.5,
    pointHoverRadius: 5,
    spanGaps: true,
  });

  if (metricId === 'bloodPressure') {
    return { labels, datasets: [mk('systolic', '#fb923c', 'Systolic'), mk('diastolic', '#38bdf8', 'Diastolic')] };
  }
  const m = METRICS.find((x) => x.id === metricId);
  return { labels, datasets: [mk(metricId, m.color, m.label)] };
}

function renderTrends() {
  metricChips();
  const m = METRICS.find((x) => x.id === state.metric);
  const cutoff = isoDaysAgo(state.rangeDays - 1);
  const scoped = sortedNewestFirst().filter((e) => e.date >= cutoff).reverse(); // ascending

  // Summary cards
  const key = state.metric === 'bloodPressure' ? 'systolic' : state.metric;
  const vals = scoped.map((e) => e[key]).filter((v) => v != null && !Number.isNaN(Number(v)));
  const summaryEl = $('#summary-cards');
  if (!vals.length) {
    summaryEl.innerHTML = '<p class="muted center">No entries in this range yet.</p>';
  } else {
    const avg = vals.reduce((a, b) => a + Number(b), 0) / vals.length;
    const cells = [
      ['Average', fmtNum(avg, m.decimals)],
      ['Minimum', fmtNum(Math.min(...vals.map(Number)), m.decimals)],
      ['Maximum', fmtNum(Math.max(...vals.map(Number)), m.decimals)],
      ['Entries', String(vals.length)],
    ];
    summaryEl.innerHTML = cells.map(([k, v]) => `
      <div class="summary-card card">
        <span>${k}</span>
        <strong>${v}<small>${m.unit ? ' ' + m.unit : ''}</small></strong>
      </div>`).join('');
  }

  // Chart
  if (!window.Chart) return; // chart lib failed to load — app still works
  const canvas = $('#trend-chart');
  if (trendChart) trendChart.destroy();
  const { labels, datasets } = buildDatasets(scoped, state.metric);

  trendChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${c.parsed.y ?? '—'} ${m.unit}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
        y: { beginAtZero: m.beginAtZero, grace: '10%' },
      },
    },
  });
}

/* ---------------- Rendering: history ---------------- */
function renderHistory() {
  const tbody = $('#history-body');
  const hasEntries = state.entries.length > 0;

  $('#history-table').hidden = !hasEntries;
  $('#empty-state').hidden = hasEntries;
  $('#history-toolbar').hidden = !hasEntries;
  if (!hasEntries) { tbody.innerHTML = ''; return; }

  const q = state.search.trim().toLowerCase();
  const rows = sortedNewestFirst().filter((e) => {
    if (!q) return true;
    return `${e.date} ${e.notes || ''} ${e.mood || ''}`.toLowerCase().includes(q);
  });

  tbody.innerHTML = rows.map((e) => `
    <tr>
      <td class="td-date">${fmtDate(e.date)}</td>
      <td>${fmtNum(e.heartRate)}</td>
      <td>${e.systolic != null || e.diastolic != null ? `${e.systolic ?? '—'}/${e.diastolic ?? '—'}` : '—'}</td>
      <td>${fmtNum(e.weight, 1)}</td>
      <td>${fmtNum(e.sleepHours, 1)}</td>
      <td>${fmtNum(e.waterGlasses)}</td>
      <td>${fmtNum(e.steps)}</td>
      <td>${e.mood ? (MOODS[e.mood] || '') : '—'}</td>
      <td class="td-actions">
        <button class="row-btn" data-action="edit" data-id="${e.id}" aria-label="Edit entry">✏️</button>
        <button class="row-btn danger" data-action="delete" data-id="${e.id}" aria-label="Delete entry">🗑️</button>
      </td>
    </tr>`).join('') ||
    '<tr><td colspan="9" class="center muted">No matches for your search.</td></tr>';
}
/*@@MORE@@*/


