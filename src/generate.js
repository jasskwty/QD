// Hourly run: pick the categories that need questions most, produce verified questions, write them, republish the catalog.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CFG, LEVELS } from './config.js';
import { ask, spend, BudgetError } from './claude.js';
import { findMedia, isPlayable } from './media.js';
import { produceCategory } from './pipeline.js';
import { STAGES } from './stages.js';
import * as store from './store.js';

const t0 = Date.now();
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`[${((Date.now() - t0) / 60000).toFixed(1)}m $${spend.usd.toFixed(2)}] ${m}`);
const counts = c => LEVELS.map(p => (c.counts || {})[p] || 0);

if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
const hasDb = !!process.env.FIREBASE_SERVICE_ACCOUNT;
if (!hasDb && !(CFG.dryRun && CFG.only.length)) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set (a dry run can do without it when QGEN_CATEGORIES names the categories)');
const db = hasDb ? store.init() : null;
const write = db && !CFG.dryRun;

// Categories with an empty level first, then the fewest questions, then the longest since the last run. Ones that keep failing go last.
function queue(all) {
  if (CFG.only.length) {
    if (!db) return CFG.only.map((name, i) => ({ id: `try${i}`, name, sector: 0, counts: {} }));
    return all.filter(c => CFG.only.includes(c.id) || CFG.only.includes(c.name) || CFG.only.includes(String(c.order)));
  }
  const ms = t => t?.toMillis?.() ?? 0;
  const key = c => [(c.aiFails || 0) >= 3 ? 1 : 0, Math.min(...counts(c)) > 0 ? 1 : 0, counts(c).reduce((a, b) => a + b, 0), ms(c.aiAt), c.order ?? 9999];
  const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  return all.filter(c => c.active !== false && !c.gen && !c.aiSkip).sort(cmp);
}

// Splits `want` questions over the levels, the emptiest level first, at most perLevel each.
function split(want, cat) {
  const need = { 200: 0, 400: 0, 600: 0 };
  const order = LEVELS.map((p, i) => [p, counts(cat)[i]]).sort((a, b) => a[1] - b[1]).map(([p]) => p);
  for (let round = 0; want > 0 && round < CFG.perLevel; round++) for (const p of order) if (want > 0) { need[p]++; want--; }
  return need;
}

const all = db ? await store.loadCategories(db) : [];
const todo = queue(all).slice(0, CFG.maxCategories);
log(`${CFG.dryRun ? 'DRY RUN · ' : ''}model ${CFG.model} · target ${CFG.perRun} · ${todo.length} categories queued`);

let reserved = 0, added = 0, inflight = 0, stop = '';
const results = [], accepted = [], rejected = [];
const deps = { ask, findMedia, playable: isPlayable, log };

async function work(cat, want) {
  const need = split(want, cat);
  const r = { id: cat.id, name: cat.name, need, accepted: 0, rejected: 0, skipped: null, error: null };
  results.push(r);
  try {
    const existing = db ? await store.existingQuestions(db, cat.id) : [];
    const out = await produceCategory(cat, need, existing, deps);
    r.accepted = out.accepted.length; r.rejected = out.rejected.length; r.skipped = out.skipped;
    out.accepted.forEach(x => accepted.push({ cat, x }));
    out.rejected.forEach(x => rejected.push({ cat, x }));
    if (write && out.accepted.length) await store.writeQuestions(db, cat, out.accepted, runId);
    if (write && out.skipped) await store.markSkipped(db, cat.id, out.skipped);
    if (write && !out.accepted.length && !out.skipped) await store.markFailed(db, cat.id);
    added += out.accepted.length;
    log(`${cat.name}: +${out.accepted.length}${out.skipped ? ` (skipped: ${out.skipped})` : ''}`);
  } catch (e) {
    r.error = e.message;
    if (e instanceof BudgetError) stop = 'budget'; else log(`${cat.name}: error ${e.message}`);
  } finally {
    reserved -= want - r.accepted;
  }
}

async function worker() {
  while (todo.length && !stop) {
    if (spend.usd >= CFG.maxUsd) { stop = 'budget'; break; }
    if (Date.now() - t0 > CFG.deadlineMin * 60000) { stop = 'deadline'; break; }
    const room = CFG.perRun - reserved;
    if (room <= 0) { if (!inflight) break; await sleep(5000); continue; }
    const want = Math.min(room, CFG.perLevel * LEVELS.length);
    reserved += want; inflight++;
    try { await work(todo.shift(), want); } finally { inflight--; }
  }
}
await Promise.all(Array.from({ length: CFG.concurrency }, worker));

if (write && added) log(`catalog republished: ${await store.publishCatalog(db)} categories`);

/* ---------- report ---------- */
const byStage = {};
for (const { x } of rejected) { const k = `${x.failed.n}. ${x.failed.title}`; byStage[k] = (byStage[k] || 0) + 1; }
const summary = {
  run: runId, dryRun: CFG.dryRun, model: CFG.model, minutes: +((Date.now() - t0) / 60000).toFixed(1),
  added, target: CFG.perRun, stopped: stop || null, usd: +spend.usd.toFixed(2), calls: spend.calls, searches: spend.searches,
  candidates: accepted.length + rejected.length, rejectedByStage: byStage,
  categories: results.map(r => ({ id: r.id, name: r.name, added: r.accepted, rejected: r.rejected, skipped: r.skipped, error: r.error }))
};
if (write) await store.saveRunSummary(db, summary);

await fs.mkdir(CFG.outDir, { recursive: true });
const media = c => ({ url: c.url, title: c.title, page: c.page, license: c.license, artist: c.artist });
await fs.writeFile(path.join(CFG.outDir, 'report.json'), JSON.stringify({
  ...summary,
  accepted: accepted.map(({ cat, x }) => ({ category: cat.name, points: x.pts, question: x.q, answer: x.a, alts: x.alts,
    confidence: x.conf, sources: (x.sources || []).map(s => s.url), question_media: media(x.mq), answer_media: media(x.ma) })),
  rejected: rejected.map(({ cat, x }) => ({ category: cat.name, points: x.pts, question: x.q, answer: x.a, stage: x.failed.n, why: x.failed.reason }))
}, null, 1));
// Same format as the admin page's bulk import (استيراد جماعي), so a dry run's output can be reviewed and imported by hand.
await fs.writeFile(path.join(CFG.outDir, 'questions-import.json'), JSON.stringify(accepted.map(({ cat, x }) => ({
  category: cat.name, points: x.pts, question: x.q, answer: x.a, media_url: x.mq.url, answer_media_url: x.ma.url
})), null, 1));

const md = [
  `## ${CFG.dryRun ? 'تجربة (ما انكتب شي في الموقع)' : 'تشغيل'}: ${added} سؤال من ${CFG.perRun}`,
  `- المدة: ${summary.minutes} دقيقة · التكلفة التقريبية: $${summary.usd} · ${spend.calls} طلب للنموذج · ${spend.searches} بحث`,
  `- المرشحين: ${summary.candidates} · نجح كل المراحل الـ ${STAGES.length}: ${accepted.length}` + (stop ? ` · وقف بسبب: ${stop === 'budget' ? 'حد التكلفة' : 'الوقت'}` : ''),
  '', '| الفئة | انضاف | انرفض | ملاحظة |', '|---|---|---|---|',
  ...results.map(r => `| ${r.name} | ${r.accepted} | ${r.rejected} | ${r.skipped ? 'ما تنفع: ' + r.skipped : r.error || ''} |`),
  '', '### وين انرفضت الأسئلة', '| المرحلة | عدد |', '|---|---|',
  ...Object.entries(byStage).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([k, n]) => `| ${k} | ${n} |`)
].join('\n');
await fs.writeFile(path.join(CFG.outDir, 'summary.md'), md);
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md + '\n');
log(`done: ${added}/${CFG.perRun} added`);
