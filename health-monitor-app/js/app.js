'use strict';

/* ============================================================
   Health Monitor — offline-first personal vitals dashboard.
   All data stays in your browser (localStorage).
   ============================================================ */

/* ---------------- Constants ---------------- */
const STORAGE_KEY = 'hm.entries.v1';
const THEME_KEY = 'hm.theme';
const TAB_KEY = 'hm.tab';
const AI_CFG_KEY = 'hm.ai.v1';       // optional user-provided AI credentials
const PASSAGE_KEY = 'hm.passage.v1'; // last generated condition summary

// Sent along with anonymous numeric stats when the user opts into AI summaries
const AI_SYSTEM_PROMPT =
  'You are a kind, encouraging health companion inside a private vitals tracker. ' +
  'Using ONLY the JSON statistics provided, write ONE short paragraph (max 110 words) ' +
  'describing how the person has been doing recently, include one gentle suggestion, ' +
  'and end with a fitting emoji. Plain language. Never diagnose. No markdown.';

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

// Self-reported stress level (1–5), shown as an emoji throughout the app
const STRESS_LEVELS = { 1: '😌 Calm', 2: '🙂 Relaxed', 3: '😐 Okay', 4: '😣 Stressed', 5: '😫 Very stressed' };

// Rotating daily quotes for the wellbeing card (offline — nothing is fetched)
const QUOTES = [
  { text: "Take care of your body. It's the only place you have to live.", author: 'Jim Rohn' },
  { text: 'Almost everything will work again if you unplug it for a few minutes — including you.', author: 'Anne Lamott' },
  { text: 'Breathe. You are exactly where you need to be.', author: 'Ian Morgan Cron' },
  { text: 'Self-care is how you take your power back.', author: 'Lalah Delia' },
  { text: 'Rest is not idleness.', author: 'John Lubbock' },
  { text: 'You, yourself, as much as anybody in the entire universe, deserve your love and affection.', author: 'Sharon Salzberg' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { text: 'Small deeds done are better than great deeds planned.', author: 'Peter Marshall' },
  { text: 'The greatest wealth is health.', author: 'Virgil' },
  { text: 'Happiness depends upon ourselves.', author: 'Aristotle' },
  { text: 'A calm mind brings inner strength and self-confidence.', author: 'Dalai Lama' },
  { text: 'Every day may not be good, but there is something good in every day.', author: 'Alice Morse Earle' },
];

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
    // Blood pressure summary would otherwise ignore diastolic entirely
    if (state.metric === 'bloodPressure') {
      const dVals = scoped.map((e) => e.diastolic).filter((v) => v != null && !Number.isNaN(Number(v)));
      if (dVals.length) {
        const dAvg = dVals.reduce((a, b) => a + Number(b), 0) / dVals.length;
        cells.splice(3, 0, ['Diastolic avg', fmtNum(dAvg, 0)]);
      }
    }
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
      <td class="td-date">${fmtDate(e.date)}${e.notes ? `<span class="note-ind" title="${escapeHtml(e.notes)}">📝</span>` : ''}</td>
      <td>${fmtNum(e.heartRate)}</td>
      <td>${e.systolic != null || e.diastolic != null ? `${e.systolic ?? '—'}/${e.diastolic ?? '—'}` : '—'}</td>
      <td>${fmtNum(e.weight, 1)}</td>
      <td>${fmtNum(e.sleepHours, 1)}</td>
      <td>${fmtNum(e.waterGlasses)}</td>
      <td>${fmtNum(e.steps)}</td>
      <td>${e.mood ? (MOODS[e.mood] || '') : '—'}${e.stress ? ` <span class="note-ind" title="${STRESS_LEVELS[e.stress] || 'Stress ' + e.stress + '/5'}">${STRESS_LEVELS[e.stress] ? STRESS_LEVELS[e.stress].split(' ')[0] : ''}</span>` : ''}</td>
      <td class="td-actions">
        <button class="row-btn" data-action="edit" data-id="${e.id}" aria-label="Edit entry">✏️</button>
        <button class="row-btn danger" data-action="delete" data-id="${e.id}" aria-label="Delete entry">🗑️</button>
      </td>
    </tr>`).join('') ||
    '<tr><td colspan="9" class="center muted">No matches for your search.</td></tr>';
}
/* ---------------- Toasts ---------------- */
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2600);
}

/* ---------------- Theme ---------------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, state.theme);
  applyTheme(state.theme);
}

/* ---------------- Tabs ---------------- */
let trendsDirty = true;

function setTab(tab) {
  state.tab = tab;
  localStorage.setItem(TAB_KEY, tab); // restore where the user left off
  $$('.tab-btn').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${tab}`; });
  if (tab === 'trends' && trendsDirty) {
    renderTrends();
    trendsDirty = false;
  }
}

/* ---------------- Sample data ---------------- */
function generateSampleData() {
  if (
    state.entries.length &&
    !confirm('This adds 30 days of realistic demo entries alongside your data. Continue?')
  ) return;

  const today = new Date();
  let added = 0;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = isoOf(d);
    if (getEntryForDate(date)) continue;

    const drift = (base, spread) => Math.round(base + (Math.random() - 0.5) * spread * 2);
    state.entries.push({
      id: uid(),
      date,
      heartRate: drift(68, 8),
      systolic: drift(118, 10),
      diastolic: drift(76, 6),
      weight: +(70 + (29 - i) * 0.03 + (Math.random() - 0.5) * 0.8).toFixed(1),
      sleepHours: +(6.5 + Math.random() * 2.4).toFixed(2),
      waterGlasses: Math.max(0, drift(7, 4)),
      steps: Math.max(1500, drift(8500, 5500)),
      mood: ['great', 'good', 'ok', 'good', 'low'][Math.floor(Math.random() * 5)],
      stress: 1 + Math.floor(Math.random() * 3),
      notes: '',
      createdAt: new Date(`${date}T09:00:00`).toISOString(),
    });
    added++;
  }
  persist();
  trendsDirty = true;
  renderAll();
  toast(`Loaded ${added} days of sample data 🎲`);
}
/* ---------------- Entry dialog ---------------- */
const dialogEl = $('#entry-dialog');

function openDialog(entry = null) {
  state.editingId = entry ? entry.id : null;
  $('#dialog-title').textContent = entry ? 'Edit entry' : 'Add entry';
  $('#save-btn').textContent = entry ? 'Save changes' : 'Save entry';

  const e = entry || {};
  $('#f-date').value = entry ? e.date : todayISO();
  $('#f-date').max = todayISO(); // no future-dated entries
  const set = (id, v) => { $(id).value = v == null ? '' : String(v); };
  set('#f-heartRate', e.heartRate);
  set('#f-weight', e.weight);
  set('#f-systolic', e.systolic);
  set('#f-diastolic', e.diastolic);
  set('#f-sleepHours', e.sleepHours);
  set('#f-waterGlasses', e.waterGlasses);
  set('#f-steps', e.steps);
  $('#f-mood').value = e.mood || '';
  $('#f-stress').value = e.stress || '';
  $('#f-notes').value = e.notes || '';

  $('#form-error').hidden = true;
  dialogEl.showModal();
  if (!entry) $('#f-heartRate').focus();
}

function readForm() {
  const num = (id) => {
    const raw = $(id).value.trim();
    return raw === '' ? null : Number(raw);
  };
  const data = {
    date: $('#f-date').value,
    heartRate: num('#f-heartRate'),
    weight: num('#f-weight'),
    systolic: num('#f-systolic'),
    diastolic: num('#f-diastolic'),
    sleepHours: num('#f-sleepHours'),
    waterGlasses: num('#f-waterGlasses'),
    steps: num('#f-steps'),
    mood: $('#f-mood').value || null,
    stress: $('#f-stress').value ? Number($('#f-stress').value) : null,
    notes: $('#f-notes').value.trim(),
  };

  if (!data.date) return { error: 'Please pick a date.' };
  if (data.date > todayISO()) return { error: "Date can't be in the future." };
  const measured = [data.heartRate, data.weight, data.systolic, data.diastolic,
    data.sleepHours, data.waterGlasses, data.steps];
  if (measured.every((v) => v === null)) return { error: 'Enter at least one measurement.' };
  if ((data.systolic == null) !== (data.diastolic == null)) {
    return { error: 'Blood pressure needs both systolic and diastolic values.' };
  }
  const bounds = [
    ['Heart rate', data.heartRate, 30, 220],
    ['Weight', data.weight, 20, 400],
    ['Systolic', data.systolic, 70, 260],
    ['Diastolic', data.diastolic, 40, 160],
    ['Sleep', data.sleepHours, 0, 24],
    ['Water', data.waterGlasses, 0, 30],
    ['Steps', data.steps, 0, 100000],
  ];
  for (const [label, v, min, max] of bounds) {
    if (v != null && (v < min || v > max)) return { error: `${label} must be between ${min} and ${max}.` };
  }
  return { data };
}

function onSubmit(ev) {
  ev.preventDefault();
  const { data, error } = readForm();
  if (error) {
    const fe = $('#form-error');
    fe.textContent = error;
    fe.hidden = false;
    return;
  }
  upsertEntry(data);
  const wasEditing = Boolean(state.editingId);
  state.editingId = null;
  dialogEl.close();
  trendsDirty = true;
  renderAll();
  toast(wasEditing ? 'Entry updated ✅' : 'Entry saved ✅');
}

/* ---------------- History row actions ---------------- */
function onHistoryClick(ev) {
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const entry = state.entries.find((e) => e.id === btn.dataset.id);
  if (!entry) return;

  if (btn.dataset.action === 'edit') {
    openDialog(entry);
  } else if (btn.dataset.action === 'delete') {
    if (!confirm(`Delete the entry for ${fmtDate(entry.date)}?`)) return;
    deleteEntry(entry.id);
    trendsDirty = true;
    renderAll();
    toast('Entry deleted 🗑️');
  }
}
/* ---------------- Export / Import ---------------- */
const EXPORT_COLS = ['date', 'heartRate', 'systolic', 'diastolic', 'weight',
  'sleepHours', 'waterGlasses', 'steps', 'mood', 'stress', 'notes'];

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON() {
  if (!state.entries.length) return toast('Nothing to export yet.', 'error');
  const payload = {
    app: 'health-monitor',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: [...state.entries].sort((a, b) => a.date.localeCompare(b.date)),
  };
  download(`health-monitor-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('JSON backup downloaded ✅');
}

function exportCSV() {
  if (!state.entries.length) return toast('Nothing to export yet.', 'error');
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = sortedNewestFirst().map((e) => EXPORT_COLS.map((c) => esc(e[c])).join(','));
  // Leading BOM so Excel opens UTF-8 notes/moods correctly
  download(`health-monitor-${todayISO()}.csv`, '\uFEFF' + [EXPORT_COLS.join(','), ...rows].join('\r\n'), 'text/csv');
  toast('CSV exported ✅');
}

function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = Array.isArray(parsed) ? parsed : parsed && parsed.entries;
      if (!Array.isArray(incoming)) throw new Error('bad shape');

      const valid = incoming.filter(
        (e) => e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
      );
      if (!valid.length) throw new Error('no valid entries');
      mergeImported(valid);
    } catch {
      toast('Import failed — not a valid backup file.', 'error');
    }
  };
  reader.readAsText(file);
}

/* Shared merge used by both JSON and CSV imports (one entry per date) */
function mergeImported(rawList) {
  let merged = 0;
  let addedN = 0;
  const byDate = new Map(state.entries.map((e) => [e.date, e]));
  for (const raw of rawList) {
    const clean = {
      id: typeof raw.id === 'string' ? raw.id : uid(),
      date: raw.date,
      heartRate: raw.heartRate ?? null,
      weight: raw.weight ?? null,
      systolic: raw.systolic ?? null,
      diastolic: raw.diastolic ?? null,
      sleepHours: raw.sleepHours ?? null,
      waterGlasses: raw.waterGlasses ?? null,
      steps: raw.steps ?? null,
      mood: MOODS[raw.mood] ? raw.mood : null,
      stress: stressOrNull(raw.stress),
      notes: typeof raw.notes === 'string' ? raw.notes : '',
    };
    const existing = byDate.get(clean.date);
    if (existing) {
      Object.assign(existing, clean, { id: existing.id });
      merged++;
    } else {
      clean.createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : undefined;
      byDate.set(clean.date, clean);
      state.entries.push(clean);
      addedN++;
    }
  }
  persist();
  trendsDirty = true;
  renderAll();
  toast(`Import complete — ${addedN} added, ${merged} merged ✅`);
}

/* --- CSV import --- */
const numOrNull = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  return Number.isNaN(n) ? null : n;
};

const stressOrNull = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Math.round(Number(String(v).trim()));
  return Number.isNaN(n) || n < 1 || n > 5 ? null : n;
};

// Quote-aware RFC-4180-ish parser (handles "quoted, commas" and "" escapes)
function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

function csvToEntries(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('no data rows');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const obj = {};
    header.forEach((h, i) => { obj[h] = rows[r][i]; });
    const date = String(obj.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue; // skip malformed rows
    const mood = String(obj.mood || '').trim();
    out.push({
      date,
      heartRate: numOrNull(obj.heartrate),
      weight: numOrNull(obj.weight),
      systolic: numOrNull(obj.systolic),
      diastolic: numOrNull(obj.diastolic),
      sleepHours: numOrNull(obj.sleephours),
      waterGlasses: numOrNull(obj.waterglasses),
      steps: numOrNull(obj.steps),
      mood: MOODS[mood] ? mood : null,
      stress: stressOrNull(obj.stress),
      notes: typeof obj.notes === 'string' ? obj.notes : '',
    });
  }
  return out;
}

function importCSV(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const entries = csvToEntries(reader.result);
      if (!entries.length) throw new Error('no valid entries');
      mergeImported(entries);
    } catch {
      toast('Import failed — could not read that CSV.', 'error');
    }
  };
  reader.readAsText(file);
}
/* ---------------- Feature: BMI ---------------- */
const HEIGHT_KEY = 'hm.heightCm';

function bmiCategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', cls: 'watch' };
  if (bmi < 25) return { label: 'Healthy range', cls: 'good' };
  if (bmi < 30) return { label: 'Overweight', cls: 'warn' };
  return { label: 'Obese', cls: 'watch' };
}

function latestWeightEntry() {
  return sortedNewestFirst().find((e) => e.weight != null) || null;
}

function renderBMI() {
  const height = Number(localStorage.getItem(HEIGHT_KEY));
  const entry = latestWeightEntry();
  $('#height-input').value = height ? String(height) : '';
  const body = $('#bmi-body');

  if (!entry) {
    body.innerHTML = '<p class="muted">Log your weight to see your BMI here.</p>';
    return;
  }
  if (!height) {
    body.innerHTML = '<p class="muted">Enter your height above to unlock BMI & healthy-weight guidance.</p>';
    return;
  }

  const m = height / 100;
  const bmi = entry.weight / (m * m);
  const cat = bmiCategory(bmi);
  const lo = fmtNum(18.5 * m * m, 1);
  const hi = fmtNum(24.9 * m * m, 1);

  body.innerHTML = `
    <div class="bmi-main">
      <span class="stat-value">${bmi.toFixed(1)}</span>
      <span class="delta ${cat.cls}">${cat.label}</span>
    </div>
    <p class="goal-pct">Based on ${fmtNum(entry.weight, 1)} kg on ${fmtDate(entry.date)} · healthy weight for your height: ${lo}–${hi} kg</p>`;
}

function onHeightChange() {
  const raw = $('#height-input').value.trim();
  const h = Number(raw);
  if (raw === '' || Number.isNaN(h) || h < 50 || h > 280) {
    localStorage.removeItem(HEIGHT_KEY);
    toast('Height cleared.', 'info');
  } else {
    localStorage.setItem(HEIGHT_KEY, String(h));
  }
  renderBMI();
}

/* ---------------- Feature: daily log reminder ---------------- */
const REMINDER_KEY = 'hm.reminder.v1';
const REMINDER_HOUR = 20; // 8 PM

function getReminder() {
  try {
    const r = JSON.parse(localStorage.getItem(REMINDER_KEY));
    if (r && typeof r.enabled === 'boolean') {
      return { enabled: r.enabled, lastNotified: r.lastNotified || null };
    }
  } catch { /* fall through */ }
  return { enabled: false, lastNotified: null };
}

function updateReminderBtn() {
  const r = getReminder();
  const btn = $('#reminder-toggle');
  btn.textContent = r.enabled ? '🔔' : '🔕';
  btn.classList.toggle('on', r.enabled);
  btn.classList.toggle('off', !r.enabled);
  btn.setAttribute('aria-pressed', String(r.enabled));
  btn.title = r.enabled
    ? `Daily reminder ON (around ${REMINDER_HOUR}:00 when today isn't logged)`
    : 'Turn on a daily logging reminder';
}

async function toggleReminder() {
  const r = getReminder();
  if (!r.enabled) {
    if (!('Notification' in window)) {
      toast('Notifications are not supported in this browser.', 'error');
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      toast('Notification permission denied — reminder stays off.', 'error');
      return;
    }
    r.enabled = true;
    toast('Daily reminder ON 🔔');
    maybeNotify(); // remind right away if it's already late and today is missing
  } else {
    r.enabled = false;
    toast('Daily reminder off.');
  }
  localStorage.setItem(REMINDER_KEY, JSON.stringify(r));
  updateReminderBtn();
}

function maybeNotify() {
  const r = getReminder();
  if (!r.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (getEntryForDate(todayISO())) return; // already logged today
  if (new Date().getHours() < REMINDER_HOUR) return;
  if (r.lastNotified === todayISO()) return; // only once per day

  r.lastNotified = todayISO();
  localStorage.setItem(REMINDER_KEY, JSON.stringify(r));
  try {
    new Notification('Health Monitor 🩺', {
      body: "Don't forget to log today's vitals!",
      tag: 'hm-daily-reminder',
    });
  } catch { /* some browsers require SW-based notifications */ }
}
/* ---------------- Rendering: daily wellbeing ---------------- */
// Deterministic per-day quote rotation — no network, no randomness across reloads
function quoteOfTheDay() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

// Rule-based "wellbeing brain": turns the user's own logged data into one
// friendly, actionable suggestion. Fully local — same privacy model as the rest of the app.
function wellbeingTip() {
  const today = getEntryForDate(todayISO());
  if (!today) {
    const [latest] = getLatestTwo();
    return latest
      ? { icon: '🖊️', text: `Nothing logged today yet — take one minute to note how you're feeling. Your last entry was ${fmtDate(latest.date)}.` }
      : { icon: '👋', text: 'Welcome! Log your first entry and personalized wellbeing tips will appear here.' };
  }

  const last3 = sortedNewestFirst().slice(0, 3);
  const sleepEntries = last3.filter((e) => e.sleepHours != null);
  const avgSleep = sleepEntries.length
    ? sleepEntries.reduce((a, e) => a + Number(e.sleepHours), 0) / sleepEntries.length
    : null;
  const heavyDays = last3.filter((e) => e.mood === 'low' || e.mood === 'bad').length;

  // Highest-priority signal wins
  if ((today.stress ?? 0) >= 4) {
    return { icon: '🧘', text: 'You rated today as stressful. Try 4-7-8 breathing: inhale 4s, hold 7s, exhale 8s — repeat four rounds.' };
  }
  if (heavyDays >= 2) {
    return { icon: '💚', text: 'The last few days sound heavy. Be gentle with yourself — a short walk, a call with a friend, or journaling one line can help lighten the load.' };
  }
  if (avgSleep != null && avgSleep < GOALS.sleepHours - 1.5) {
    return { icon: '😴', text: `You've averaged ${fmtNum(avgSleep, 1)}h of sleep over your last entries. A calmer, earlier wind-down tonight could make a real difference.` };
  }
  if (today.waterGlasses != null && today.waterGlasses < GOALS.waterGlasses) {
    const left = GOALS.waterGlasses - today.waterGlasses;
    return { icon: '💧', text: `${left} more glass${left === 1 ? '' : 'es'} and you'll hit today's hydration goal. Keep a bottle within reach!` };
  }
  if (today.steps != null && today.steps < GOALS.steps * 0.4) {
    return { icon: '🚶', text: `${fmtNum(today.steps)} steps so far today — even a 10-minute stroll can boost your mood and circulation.` };
  }
  return { icon: '🌟', text: "You're doing great — keep showing up for yourself, one day at a time." };
}

function renderWellbeing() {
  const q = quoteOfTheDay();
  $('#wb-quote-text').textContent = `“${q.text}”`;
  $('#wb-quote-author').textContent = `— ${q.author}`;
  const tip = wellbeingTip();
  $('#wb-tip-icon').textContent = tip.icon;
  $('#wb-tip-text').textContent = tip.text;
}

/* ---------------- Condition summary (offline engine + optional AI) ---------------- */
// Aggregates the last `days` days into anonymous numeric stats. Raw notes are
// intentionally excluded so they are never sent to any AI provider.
function collectStats(days = 14) {
  const since = isoDaysAgo(days - 1);
  const scoped = sortedNewestFirst().filter((e) => e.date >= since); // newest first
  const vals = (k) => scoped.map((e) => e[k]).filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
  const avgOf = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null);

  const hr = vals('heartRate');
  const weight = vals('weight'); // [newest … oldest]
  const moodTally = {};
  scoped.forEach((e) => { if (e.mood) moodTally[e.mood] = (moodTally[e.mood] || 0) + 1; });
  const moodTop = Object.keys(moodTally).sort((a, b) => moodTally[b] - moodTally[a])[0] || null;

  return {
    periodDays: days,
    entryCount: scoped.length,
    todayLogged: Boolean(getEntryForDate(todayISO())),
    streak: computeStreak(),
    heartRate: { avg: avgOf(hr), min: hr.length ? Math.min(...hr) : null, max: hr.length ? Math.max(...hr) : null },
    bloodPressure: { sysAvg: avgOf(vals('systolic')), diaAvg: avgOf(vals('diastolic')) },
    weight: { latest: weight[0] ?? null, earliest: weight[weight.length - 1] ?? null },
    sleepAvg: avgOf(vals('sleepHours')),
    waterAvg: avgOf(vals('waterGlasses')),
    stepsAvg: avgOf(vals('steps')),
    stressAvg: avgOf(vals('stress')),
    moodTally,
    moodTop,
    goals: GOALS,
  };
}

// Template-based narrative — always available, zero network, zero cost.
function localPassage(s) {
  if (!s.entryCount) {
    return 'Log a few days of vitals and a warm summary of your condition will appear here — written entirely on your device, no internet required.';
  }
  const p = [];
  p.push(`Over the last ${s.periodDays} days you logged ${s.entryCount} ${s.entryCount === 1 ? 'entry' : 'entries'}${s.streak ? `, keeping a 🔥 ${s.streak}-day streak going` : ''}.`);

  if (s.heartRate.avg != null) {
    const inRange = s.heartRate.avg >= 60 && s.heartRate.avg <= 100;
    p.push(`Your average heart rate was ${fmtNum(s.heartRate.avg)} bpm (${inRange ? 'comfortably within the typical resting range' : 'a little outside the usual 60–100 resting range'})${s.heartRate.min != null ? `, ranging from ${fmtNum(s.heartRate.min)} to ${fmtNum(s.heartRate.max)}` : ''}.`);
  }
  if (s.bloodPressure.sysAvg != null) {
    const sy = s.bloodPressure.sysAvg;
    const di = s.bloodPressure.diaAvg;
    const word = (sy < 120 && di < 80) ? 'which looks excellent'
      : sy < 130 ? 'which looks good'
      : (sy < 140 || di < 90) ? 'which trends slightly elevated'
      : 'which trends high';
    p.push(`Blood pressure averaged ${fmtNum(sy)}/${fmtNum(di)} mmHg, ${word}.`);
  }
  if (s.weight.latest != null && s.weight.earliest != null) {
    const d = +(s.weight.latest - s.weight.earliest).toFixed(1);
    p.push(d === 0 ? 'Your weight held steady.' : `Your weight drifted ${fmtNum(Math.abs(d), 1)} kg ${d < 0 ? 'down' : 'up'}, currently ${fmtNum(s.weight.latest, 1)} kg.`);
  }
  if (s.sleepAvg != null) p.push(`Sleep averaged ${fmtNum(s.sleepAvg, 1)} hours ${s.sleepAvg >= s.goals.sleepHours ? '— hitting your rest goal 💤' : '— a bit more shut-eye would help 😴'}.`);
  if (s.waterAvg != null) p.push(`Hydration averaged ${fmtNum(s.waterAvg)} glasses a day ${s.waterAvg >= s.goals.waterGlasses ? '— nicely done 💧' : '— keeping a bottle within reach makes it easier 💧'}.`);
  if (s.stepsAvg != null) p.push(`Steps averaged ${fmtNum(s.stepsAvg)} per day ${s.stepsAvg >= s.goals.steps ? '— a genuinely active routine 🏃' : '— every extra stroll adds up 🚶'}.`);
  if (s.moodTop) {
    p.push(`Your most common mood was ${MOODS[s.moodTop] || ''} "${s.moodTop}"${s.stressAvg != null ? `, with stress averaging ${fmtNum(s.stressAvg, 1)} out of 5` : ''}.`);
  }
  p.push('Remember: this is a friendly overview, not medical advice — and simply showing up to track daily is already a win! 🌟');
  return p.join(' ');
}

/* --- Optional AI mode: OpenAI-compatible chat completions (Groq/OpenAI/custom) --- */
const AI_ENDPOINTS = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
};
const AI_DEFAULT_MODELS = { groq: 'llama-3.3-70b-versatile', openai: 'gpt-4o-mini', custom: '' };

function getAICfg() {
  const base = { provider: 'groq', key: '', model: '', baseUrl: '' };
  try { return { ...base, ...(JSON.parse(localStorage.getItem(AI_CFG_KEY)) || {}) }; }
  catch { return base; }
}

async function requestAIPassage(stats) {
  const cfg = getAICfg();
  const url = cfg.provider === 'custom'
    ? (cfg.baseUrl || '').replace(/\/+$/, '') + '/chat/completions'
    : AI_ENDPOINTS[cfg.provider];
  const model = cfg.model || AI_DEFAULT_MODELS[cfg.provider];
  if (!url || !model || !cfg.key) throw new Error('ai-not-configured');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 320,
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(stats) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('empty response');
  return text.trim();
}

async function onGenerateSummary(btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Writing…';
  try {
    const stats = collectStats();
    let text = null;
    let source = '';
    const cfg = getAICfg();
    if (cfg.key) {
      try {
        text = await requestAIPassage(stats);
        source = `✨ AI · ${cfg.provider}`;
      } catch {
        toast('AI unreachable — wrote the offline summary instead.', 'info');
      }
    }
    if (!text) { text = localPassage(stats); source = '📴 offline engine'; }

    $('#ai-passage').textContent = text;
    $('#ai-source').textContent = source;
    localStorage.setItem(PASSAGE_KEY, JSON.stringify({ text, source, at: todayISO() }));
    toast('Passage ready 📝');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function restorePassage() {
  try {
    const saved = JSON.parse(localStorage.getItem(PASSAGE_KEY));
    if (saved && saved.text) {
      $('#ai-passage').textContent = saved.text;
      $('#ai-source').textContent = `${saved.source} · ${fmtDate(saved.at)}`;
    }
  } catch { /* ignore corrupt cache */ }
  const cfg = getAICfg();
  $('#ai-mode-chip').textContent = cfg.key ? `✨ AI: ${cfg.provider}` : '📴 offline mode';
}

function openAISettings() {
  const c = getAICfg();
  $('#ai-provider').value = c.provider;
  $('#ai-key').value = c.key;
  $('#ai-model').value = c.model;
  $('#ai-baseurl').value = c.baseUrl;
  $('#ai-settings').hidden = false;
}

function saveAISettings() {
  const cfg = {
    provider: $('#ai-provider').value,
    key: $('#ai-key').value.trim(),
    model: $('#ai-model').value.trim(),
    baseUrl: $('#ai-baseurl').value.trim(),
  };
  localStorage.setItem(AI_CFG_KEY, JSON.stringify(cfg));
  $('#ai-settings').hidden = true;
  $('#ai-mode-chip').textContent = cfg.key ? `✨ AI: ${cfg.provider}` : '📴 offline mode';
  toast(cfg.key ? 'AI settings saved ✅' : 'AI off — offline summaries only 📴');
}

/* ---------------- Render all ---------------- */
function renderAll() {
  renderDashboard();
  renderWellbeing();
  renderBMI();
  renderHistory();
  if (state.tab === 'trends' && trendsDirty) {
    renderTrends();
    trendsDirty = false;
  }
}

/* ---------------- Event wiring ---------------- */
function wireEvents() {
  $('#theme-toggle').addEventListener('click', toggleTheme);
  $('#reminder-toggle').addEventListener('click', toggleReminder);

  $$('.tab-btn').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  // Dialog
  $('#add-entry-btn').addEventListener('click', () => openDialog());
  $('#dash-empty-add').addEventListener('click', () => openDialog());
  $('#empty-add').addEventListener('click', () => openDialog());
  $('#cancel-btn').addEventListener('click', () => dialogEl.close());
  dialogEl.addEventListener('cancel', (ev) => { state.editingId = null; });
  $('#entry-form').addEventListener('submit', onSubmit);

  // Sample data
  $('#dash-sample').addEventListener('click', generateSampleData);

  // History: search + row actions
  $('#search-input').addEventListener('input', (ev) => {
    state.search = ev.target.value;
    renderHistory();
  });
  $('#history-body').addEventListener('click', onHistoryClick);

  // Export / Import
  $('#export-csv').addEventListener('click', exportCSV);
  $('#export-json').addEventListener('click', exportJSON);
  $('#import-file').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    if (/\.csv$/i.test(f.name) || f.type === 'text/csv') importCSV(f);
    else importJSON(f);
    ev.target.value = ''; // allow re-importing the same file
  });

  // BMI height setting
  $('#height-input').addEventListener('change', onHeightChange);

  // Condition summary (offline engine + optional AI)
  $('#ai-generate').addEventListener('click', (ev) => { void onGenerateSummary(ev.currentTarget); });
  $('#ai-settings-btn').addEventListener('click', openAISettings);
  $('#ai-cancel').addEventListener('click', () => { $('#ai-settings').hidden = true; });
  $('#ai-save').addEventListener('click', saveAISettings);

  // Stat card → jump to that metric's trend
  const openTrend = (metricId) => {
    if (!METRICS.some((m) => m.id === metricId)) return;
    state.metric = metricId;
    setTab('trends');
    renderTrends();
    trendsDirty = false;
  };
  $('#stat-grid').addEventListener('click', (ev) => {
    const card = ev.target.closest('.stat-card');
    if (card) openTrend(card.dataset.metric);
  });
  $('#stat-grid').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const card = ev.target.closest('.stat-card');
    if (card) { ev.preventDefault(); openTrend(card.dataset.metric); }
  });
}

/* ---------------- Init ---------------- */
function init() {
  loadEntries();

  const savedTheme = localStorage.getItem(THEME_KEY)
    || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  state.theme = savedTheme;
  applyTheme(savedTheme);

  updateReminderBtn();
  wireEvents();

  renderDashboard();
  renderWellbeing();
  renderBMI();
  renderHistory();
  restorePassage();

  // Restore the last active tab
  const savedTab = localStorage.getItem(TAB_KEY);
  if (savedTab && ['dashboard', 'trends', 'history'].includes(savedTab)) setTab(savedTab);

  maybeNotify();
  setInterval(maybeNotify, 60 * 1000); // check every minute while the tab is open
}

document.addEventListener('DOMContentLoaded', init);







