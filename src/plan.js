// Which categories get questions this run, and how many per level.
import { CFG, LEVELS } from './config.js';

export const counts = c => LEVELS.map(p => (c.counts || {})[p] || 0);
const ms = t => t?.toMillis?.() ?? (typeof t === 'number' ? t : 0);

// Categories with an empty level first, then the fewest questions, then the longest since the last run. Ones that keep failing go last.
export function queue(all, only = []) {
  if (only.length) return all.filter(c => only.includes(c.id) || only.includes(c.name) || only.includes(String(c.order)));
  const key = c => [(c.aiFails || 0) >= 3 ? 1 : 0, Math.min(...counts(c)) > 0 ? 1 : 0, counts(c).reduce((a, b) => a + b, 0), ms(c.aiAt), c.order ?? 9999];
  const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  return all.filter(c => c.active !== false && !c.gen && !c.aiSkip).sort(cmp);
}

// Splits `want` questions over the levels, the emptiest level first, at most perLevel each.
export function split(want, cat, perLevel = CFG.perLevel) {
  const need = { 200: 0, 400: 0, 600: 0 };
  const order = LEVELS.map((p, i) => [p, counts(cat)[i]]).sort((a, b) => a[1] - b[1]).map(([p]) => p);
  for (let r = 0; want > 0 && r < perLevel; r++) for (const p of order) if (want > 0) { need[p]++; want--; }
  return need;
}

/** The categories for one run with their need per level, adding up to perRun. */
export function plan(all, { perRun = CFG.perRun, perLevel = CFG.perLevel, only = [] } = {}) {
  const out = [];
  let left = perRun;
  for (const c of queue(all, only)) {
    if (left <= 0) break;
    const want = Math.min(left, perLevel * LEVELS.length);
    out.push({ cat: c, need: split(want, c, perLevel) });
    left -= want;
  }
  return out;
}
