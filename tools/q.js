#!/usr/bin/env node
// Helper commands for a question-generation run. The playbook (ROUTINE.md) says when to use each one.
//
//   node tools/q.js next [--per-run 12] [--categories "name or id,..."]   plan a run → work/run.json
//   node tools/q.js add <file.json | JSON>                                add candidate questions (stages 1-3 run here)
//   node tools/q.js media <id> <q|a> <image|audio|video> "query" ["query" ...]   search Wikimedia Commons, save previews
//   node tools/q.js verdict <stage> <file.json | JSON>                    record verdicts {"<id>": ...} for one stage
//   node tools/q.js skip <category id> "reason"                           category can't be done with real free media
//   node tools/q.js sheet blind14 | blind17 | judge                       writes work/<sheet>.md for a helper agent
//   node tools/q.js status                                                what is ready and what waits for which stage
//   node tools/q.js write [--dry]                                         final checks, then write to the site
import fs from 'node:fs/promises';
import path from 'node:path';
import { CFG, LEVELS } from '../src/config.js';
import { plan } from '../src/plan.js';
import { findMedia, describe, isFreeLicense, isPlayable } from '../src/media.js';
import { isDuplicate, leaksAnswer } from '../src/text.js';
import * as R from '../src/run.js';
import * as store from '../src/store.js';

const [cmd, ...args] = process.argv.slice(2);
const flag = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const has = name => args.includes(`--${name}`);
async function readJson(arg) {
  if (!arg) throw new Error('missing JSON (a file path or inline JSON)');
  return JSON.parse(/^\s*[[{]/.test(arg) ? arg : await fs.readFile(arg, 'utf8'));
}
let db;
const getDb = () => (db ??= store.init());

const commands = {
  async next() {
    const only = (flag('categories', '') || '').split(',').map(s => s.trim()).filter(Boolean);
    const perRun = Number(flag('per-run', CFG.perRun));
    let all;
    if (store.hasDb()) all = await store.loadCategories(getDb());
    else if (only.length) { all = only.map((name, i) => ({ id: `try${i + 1}`, name, sector: 0 })); console.log('No database key: offline plan (write will only work with --dry).'); }
    else throw new Error('FIREBASE_SERVICE_ACCOUNT is not set. Stop: the owner has to add it to the environment.');
    const planned = plan(all, { perRun, only });
    if (!planned.length) throw new Error('no category needs questions (or none matched --categories)');
    const existing = {};
    if (store.hasDb()) for (const { cat } of planned) existing[cat.id] = await store.existingQuestions(getDb(), cat.id);
    const run = R.newRun(planned, existing);
    await R.save(run);
    console.log(`planned ${planned.reduce((s, p) => s + LEVELS.reduce((a, l) => a + p.need[l], 0), 0)} questions → ${R.runFile()}`);
    for (const c of run.categories) {
      console.log(`\n${c.id} ${c.name} [${c.sector}${c.media ? ', picture/sound category' : ''}] now ${c.counts.join('/')} · need ${LEVELS.map(p => `${p}×${c.need[p]}`).join(' ')}`);
      if (c.existing.length) console.log(`  existing questions (don't repeat): ${c.existing.length}, e.g.\n` + c.existing.slice(0, 60).map(x => `   - ${x.q}`).join('\n'));
    }
  },

  async add() {
    const run = await R.load();
    const { added, errors } = R.addQuestions(run, await readJson(args[0]));
    await R.save(run);
    errors.forEach(e => console.log('error', e));
    for (const q of added) console.log(`${q.id} ${q.pts} ${R.alive(q) ? 'ok, next stage 4' : Object.values(q.stages).at(-1)} · ${q.q}`);
  },

  async media() {
    const [id, role, type, ...queries] = args;
    if (!['q', 'a'].includes(role) || !['image', 'audio', 'video'].includes(type) || !queries.length) throw new Error('usage: media <id> <q|a> <image|audio|video> "query" ["query" ...]');
    const run = await R.load(), q = run.questions.find(x => x.id === id);
    if (!q) throw new Error(`no question ${id}`);
    if (R.nextStage(q) !== 10) throw new Error(`${id} is not at stage 10 (it is at ${R.nextStage(q) ?? 'none: failed or done'})`);
    const list = await findMedia({ type, searches: queries });
    const dir = path.join(CFG.workDir, 'media');
    await fs.mkdir(dir, { recursive: true });
    for (const [i, c] of list.entries()) {
      if (c.vision) {
        c.preview = path.join(dir, `${id}-${role}-${i}.${c.vision.type.split('/')[1].replace('jpeg', 'jpg')}`);
        await fs.writeFile(c.preview, Buffer.from(c.vision.b64, 'base64'));
      }
      delete c.vision;
    }
    q.cands[role] = list;
    await R.save(run);
    if (!list.length) console.log('no free-licensed match; try other English queries, another media type, or fail stage 10');
    list.forEach((c, i) => console.log(`[${i}] ${describe(c)} · ${c.license}${c.preview ? ` · preview: ${c.preview}` : ' · (audio: judge by title and description)'}`));
  },

  async verdict() {
    const n = Number(args[0]);
    const run = await R.load();
    const { touched, gone, waiting } = await R.recordVerdicts(run, n, await readJson(args[1]));
    await R.save(run);
    for (const q of touched) {
      console.log(`${q.id}: ${R.alive(q) ? `pass → next stage ${R.nextStage(q) ?? 'done ✓'}` : R.failure(q).join(' ')}`);
      if (n === 10 && R.alive(q)) console.log(`   question media: ${q.m.preview || describe(q.m)}\n   answer media: ${q.am.preview || describe(q.am)}`);
    }
    if (gone.length) console.log(`ignored (already failed earlier): ${gone.join(', ')}`);
    if (waiting.length) console.log(`still waiting for stage ${n}: ${waiting.join(', ')}`);
  },

  async skip() {
    const run = await R.load(), c = run.categories.find(c => c.id === args[0]);
    if (!c || !args[1]) throw new Error('usage: skip <category id> "reason"');
    c.skipped = args[1];
    await R.save(run);
    console.log(`${c.id} ${c.name} skipped`);
  },

  async sheet() {
    const run = await R.load(), kind = args[0];
    const text = kind === 'blind14' ? R.blindSheet(run, 14) : kind === 'blind17' ? R.blindSheet(run, 17) : kind === 'judge' ? R.judgeSheet(run) : null;
    if (text === null) throw new Error('usage: sheet blind14 | blind17 | judge');
    const file = path.join(CFG.workDir, `${kind}.md`);
    await fs.writeFile(file, text || '(no questions waiting)\n');
    console.log(`${file}: ${text ? text.split('### ').length - 1 : 0} questions`);
  },

  async status() { console.log(R.status(await R.load())); },

  async write() {
    const dry = has('dry'), run = await R.load();
    const fin = R.finalists(run);
    if (!dry && !store.hasDb()) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    // Last safety net, independent of the stage records: re-check text, duplicates against the live database, licenses and links.
    const ok = [], dropped = [];
    for (const c of run.categories) {
      const mine = fin.filter(q => q.cat === c.id);
      if (!mine.length) continue;
      const live = store.hasDb() && !c.id.startsWith('try') ? await store.existingQuestions(getDb(), c.id) : c.existing;
      const kept = [];
      for (const q of mine) {
        const why = R.formatProblem(q) || ([q.a, ...q.alts].some(a => leaksAnswer(q.q, a)) && 'answer in question')
          || (isDuplicate(q, [...live, ...kept]) && 'duplicate')
          || (![q.m, q.am].every(m => m && isFreeLicense(m.license)) && 'license')
          || (!(await isPlayable(q.m)) || !(await isPlayable(q.am))) && 'media link';
        if (why) dropped.push(`${q.id} (${why})`); else kept.push(q);
      }
      ok.push(...kept);
      if (!dry && kept.length) await store.writeQuestions(getDb(), c.id, kept, run.run);
    }
    if (!dry) {
      for (const c of run.categories) {
        if (c.id.startsWith('try')) continue;
        if (c.skipped) await store.markSkipped(getDb(), c.id, c.skipped);
        else if (!ok.some(q => q.cat === c.id)) await store.markFailed(getDb(), c.id);
      }
      if (ok.length) console.log(`catalog republished: ${await store.publishCatalog(getDb())} categories`);
    }
    const failedAt = {};
    for (const q of run.questions) { const f = R.failure(q); if (f) failedAt[f[0]] = (failedAt[f[0]] || 0) + 1; }
    const summary = { run: run.run, dry, written: ok.length, planned: run.categories.reduce((s, c) => s + LEVELS.reduce((a, p) => a + (c.need[p] || 0), 0), 0),
      candidates: run.questions.length, failedAtStage: failedAt, dropped,
      categories: run.categories.map(c => ({ id: c.id, name: c.name, written: ok.filter(q => q.cat === c.id).length, skipped: c.skipped })) };
    if (!dry) await store.saveRunSummary(getDb(), summary);
    // Same format as the admin page's bulk import (استيراد جماعي).
    await fs.writeFile(path.join(CFG.workDir, 'questions-import.json'), JSON.stringify(ok.map(q => ({
      category: run.categories.find(c => c.id === q.cat).name, points: q.pts, question: q.q, answer: q.a, media_url: q.m.url, answer_media_url: q.am.url
    })), null, 1));
    console.log(JSON.stringify(summary, null, 1));
    console.log(`${dry ? 'DRY RUN, nothing written. ' : ''}${ok.length} questions ${dry ? 'would be ' : ''}written; review copy: ${path.join(CFG.workDir, 'questions-import.json')}`);
  }
};

if (!commands[cmd]) { console.log((await fs.readFile(new URL(import.meta.url), 'utf8')).split('\n').filter(l => l.startsWith('//')).join('\n')); process.exit(cmd ? 1 : 0); }
try { await commands[cmd](); }
catch (e) { console.error(`error: ${e.message}`); process.exitCode = 1; }
process.exit();   // the Firestore client keeps a connection open
