// Test harness: loads js/app.js with minimal browser stubs and exercises
// the new CSV import pipeline (parseCSV -> csvToEntries).
'use strict';
import { readFileSync } from 'node:fs';

const el = () => ({
  addEventListener() {}, classList: { toggle() {}, add() {}, remove() {} },
  setAttribute() {}, appendChild() {}, closest: () => null,
});
globalThis.document = {
  querySelector: () => el(),
  querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => el(),
  documentElement: { dataset: {} },
};
globalThis.window = {};
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
// Strip 'use strict' and run as an indirect-eval *script* so its top-level
// function declarations become globals visible to this module.
// (new Function(...) wouldn't work: its declarations stay function-local.)
(0, eval)(src.replace(/^['"]use strict['"];?/, ''));

// -- Tests --
const csv = [
  'date,heartRate,systolic,diastolic,weight,sleepHours,waterGlasses,steps,mood,stress,notes',
  '2026-08-20,72,120,80,70.5,7.5,8,10000,good,4,"Felt great, went for a ""run"""',
  '2026-08-21,,,,,,,3000,,9,', // out-of-range stress must be dropped
  'not-a-date,xx,,,,,,,,,',
  ',,,,,,,,,,',
].join('\r\n');

const entries = csvToEntries('\uFEFF' + csv);
console.log('parsed rows:', entries.length); // expect 2
console.log(JSON.stringify(entries[0], null, 2));

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } };
assert(entries.length === 2, 'valid rows imported, malformed rows skipped');
assert(entries[0].heartRate === 72 && entries[0].weight === 70.5, 'numeric coercion');
assert(entries[0].mood === 'good', 'mood passthrough');
assert(entries[0].stress === 4, 'stress passthrough');
assert(entries[1].steps === 3000 && entries[1].stress === null, 'out-of-range stress becomes null');
assert(entries[0].notes === 'Felt great, went for a "run"', 'quoted notes w/ comma + escaped quotes');

// Round-trip check against exportCSV column order (header + data row)
const EXPORT_COLS = ['date','heartRate','systolic','diastolic','weight','sleepHours','waterGlasses','steps','mood','stress','notes'];
const esc = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const line = [EXPORT_COLS.join(','), EXPORT_COLS.map((c) => esc(entries[0][c])).join(',')].join('\r\n');
const re = csvToEntries(line);
assert(re.length === 1 && re[0].notes === entries[0].notes && re[0].diastolic === 80, 'export/import round-trip');
assert(re[0].stress === 4, 'stress survives export/import round-trip');

// -- Wellbeing brain (rule-based, fully offline) --
const q = quoteOfTheDay();
assert(q && typeof q.text === 'string' && typeof q.author === 'string', 'quote of the day shape');
assert(quoteOfTheDay().text === q.text, 'quote is stable within the same day');
const tip = wellbeingTip(); // empty store -> welcome tip
assert(tip && typeof tip.text === 'string' && tip.icon === '👋', 'welcome tip on empty state');

// -- Condition summary passages --
const sampleStats = {
  periodDays: 14, entryCount: 10, todayLogged: true, streak: 4,
  heartRate: { avg: 72.3, min: 64, max: 85 },
  bloodPressure: { sysAvg: 124.5, diaAvg: 79 },
  weight: { latest: 70.2, earliest: 71.0 },
  sleepAvg: 7.2, waterAvg: 6.4, stepsAvg: 8200, stressAvg: 2.5,
  moodTally: { good: 5, ok: 3, low: 2 }, moodTop: 'good',
  // GOALS is a const inside app.js (not visible to this module), so inline it
  goals: { waterGlasses: 8, steps: 10000, sleepHours: 8 },
};
const passage = localPassage(sampleStats);
console.log('sample passage:', passage);
assert(typeof passage === 'string' && passage.length > 200, 'offline passage is substantial');
assert(passage.includes('bpm') && passage.includes('mmHg'), 'passage includes real numbers');
assert(passage.includes('not medical advice'), 'non-diagnostic disclaimer present');
const emptyPassage = localPassage({ ...sampleStats, entryCount: 0 });
assert(emptyPassage.includes('Log a few days'), 'friendly prompt when no data');

console.log('ALL TESTS PASSED ✅');
