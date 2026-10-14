#!/usr/bin/env node
// Bulk questions from Wikidata (free): thousands of fact questions with media, checked automatically.
//
//   node tools/bulk.js build [--only key,key]   build data/bulk-questions.json, exports/*.json (admin import files), data/bulk-report.md
//   node tools/bulk.js write [--max 15000] [--dry]   add them to the site, skipping ones already there (resumable)
import fs from 'node:fs/promises';
import path from 'node:path';
import { CFG, LEVELS } from '../src/config.js';
import { build } from '../src/bulk.js';
import { CAT_NAMES, TEMPLATES } from '../src/templates.js';
import { norm } from '../src/text.js';
import * as store from '../src/store.js';

const [cmd, ...args] = process.argv.slice(2);
const flag = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const DATA = 'data/bulk-questions.json';
const catId = n => 'c' + String(n).padStart(3, '0');
const t0 = Date.now(), log = m => console.log(`[${((Date.now() - t0) / 60000).toFixed(1)}m] ${m}`);

async function buildCmd() {
  const only = (flag('only', '') || '').split(',').filter(Boolean);
  const { questions, report } = await build({ cacheDir: path.join(CFG.workDir, 'cache'), only, log });
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(DATA, JSON.stringify(questions));
  await fs.rm('exports', { recursive: true, force: true });
  await fs.mkdir('exports');
  const byCat = new Map();
  for (const x of questions) byCat.set(x.cat, [...(byCat.get(x.cat) || []), x]);
  for (const [cat, list] of byCat) {
    await fs.writeFile(path.join('exports', `${String(cat).padStart(3, '0')}-${CAT_NAMES[cat]}.json`), JSON.stringify(list.map(x => ({
      category: String(cat), points: x.pts, question: x.q, answer: x.a, media_url: x.m.url, answer_media_url: x.am.url
    })), null, 1));
  }
  const lv = list => LEVELS.map(p => list.filter(x => x.pts === p).length).join(' / ');
  const md = [
    `# Bulk questions from Wikidata`, '', `**${questions.length}** questions in **${byCat.size}** categories (200 / 400 / 600: ${lv(questions)}).`, '',
    '| # | Category | Questions | 200 / 400 / 600 |', '|---|---|---|---|',
    ...[...byCat].sort((a, b) => a[0] - b[0]).map(([c, l]) => `| ${c} | ${CAT_NAMES[c]} | ${l.length} | ${lv(l)} |`), '',
    '| Template | Wikidata rows | Kept | Dropped (why) |', '|---|---|---|---|',
    ...TEMPLATES.filter(t => report[t.key]).map(t => { const r = report[t.key]; return `| ${t.key} | ${r.rows} | ${r.kept} | ${Object.entries(r.dropped).map(([k, n]) => `${k}: ${n}`).join('; ')} |`; })
  ].join('\n');
  await fs.writeFile('data/bulk-report.md', md + '\n');
  log(`${questions.length} questions → ${DATA}, exports/, data/bulk-report.md`);
}

async function writeCmd() {
  const dry = args.includes('--dry'), max = Number(flag('max', 15000));
  const questions = JSON.parse(await fs.readFile(DATA, 'utf8'));
  const db = store.init();
  const cats = new Map((await store.loadCategories(db)).map(c => [c.id, c]));
  let written = 0;
  const byCat = new Map();
  for (const x of questions) byCat.set(x.cat, [...(byCat.get(x.cat) || []), x]);
  for (const [cat, list] of byCat) {
    if (written >= max) break;
    const id = catId(cat), c = cats.get(id);
    if (!c || c.active === false) { log(`${id} ${CAT_NAMES[cat]}: not an active category on the site, skipped`); continue; }
    const have = await db.collection('categories').doc(id).collection('questions').select('q', 'ai.key').get();
    const keys = new Set(have.docs.map(d => d.get('ai.key')).filter(Boolean)), texts = new Set(have.docs.map(d => norm(d.get('q'))));
    const todo = list.filter(x => !keys.has(x.key) && (x.media_dependent || !texts.has(norm(x.q)))).slice(0, max - written);
    if (!dry) for (let i = 0; i < todo.length; i += 400) await store.writeBulk(db, id, todo.slice(i, i + 400));
    written += todo.length;
    log(`${id} ${CAT_NAMES[cat]}: +${todo.length}${dry ? ' (dry run)' : ''} (already there: ${list.length - todo.length})`);
  }
  if (!dry && written) log(`catalog republished: ${await store.publishCatalog(db)} categories`);
  log(`${dry ? 'would add' : 'added'} ${written} questions${written >= max ? ` (stopped at --max ${max}; run again tomorrow for the rest)` : ''}`);
}

const commands = { build: buildCmd, write: writeCmd };
if (!commands[cmd]) { console.log((await fs.readFile(new URL(import.meta.url), 'utf8')).split('\n').filter(l => l.startsWith('//')).join('\n')); process.exit(cmd ? 1 : 0); }
try { await commands[cmd](); } catch (e) { console.error(`error: ${e.stack || e.message}`); process.exitCode = 1; }
process.exit();
