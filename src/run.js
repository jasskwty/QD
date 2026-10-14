// State of one run (work/run.json): the planned categories, every candidate question and its result at each of the 20 stages.
// The tool enforces the order: a question only moves to stage n after passing 1..n-1, and one failure removes it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CFG, LEVELS, STAGES, SECTORS } from './config.js';
import { isDuplicate, leaksAnswer, sameAnswer, siteOf } from './text.js';
import { isFreeLicense, isPlayable, describe } from './media.js';
import { counts } from './plan.js';

export const runFile = () => path.join(CFG.workDir, 'run.json');
export const load = async () => JSON.parse(await fs.readFile(runFile(), 'utf8'));
export async function save(run) {
  await fs.mkdir(CFG.workDir, { recursive: true });
  await fs.writeFile(runFile(), JSON.stringify(run, null, 1));
}

export const failure = q => Object.entries(q.stages).find(([, v]) => v.startsWith('fail'));
export const alive = q => !failure(q);
export const done = q => STAGES.every(s => q.stages[s.n]?.startsWith('pass'));
export const nextStage = q => (alive(q) ? STAGES.find(s => !q.stages[s.n])?.n ?? null : null);
const pass = (q, n, note) => { q.stages[n] = note ? `pass: ${String(note).slice(0, 300)}` : 'pass'; };
const fail = (q, n, reason) => { q.stages[n] = `fail: ${String(reason || 'رفض').slice(0, 300)}`; };

export function newRun(planned, existing) {
  return {
    run: new Date().toISOString().replace(/[:.]/g, '-'),
    categories: planned.map(({ cat, need }) => ({
      id: cat.id, name: cat.name, sector: SECTORS[cat.sector] ?? SECTORS[0], media: !!cat.media, counts: counts(cat), need,
      existing: (existing[cat.id] || []).map(x => ({ q: x.q, a: x.a })), skipped: null, seq: 0
    })),
    questions: []
  };
}

/* ---------- stages 1-3: run as soon as questions are added ---------- */
export function formatProblem(x) {
  if (!LEVELS.includes(x.pts)) return 'النقاط لازم 200 أو 400 أو 600';
  if (!/[؀-ۿ]/.test(x.q)) return 'السؤال مو بالعربي';
  if (x.q.length < 8 || x.q.length > 250) return 'طول السؤال غير مناسب';
  if (!/[؟?]\s*$/.test(x.q)) return 'السؤال لازم ينتهي بعلامة استفهام';
  if (!x.a.trim() || x.a.length > 60 || x.a.trim().split(/\s+/).length > 8) return 'الإجابة لازم تكون قصيرة';
  if (/https?:|www\./i.test(x.q + x.a)) return 'فيه رابط في النص';
  return null;
}
const leaks = x => [x.a, ...x.alts].some(a => leaksAnswer(x.q, a));

export function addQuestions(run, items) {
  if (!Array.isArray(items)) throw new Error('expected a JSON array of questions');
  const added = [], errors = [];
  for (const [i, x] of items.entries()) {
    const c = run.categories.find(c => c.id === x?.cat || c.name === x?.cat);
    if (!c) { errors.push(`#${i}: unknown category "${x?.cat}" (use an id from the plan)`); continue; }
    if (c.skipped) { errors.push(`#${i}: category ${c.id} is skipped`); continue; }
    const pts = Number(x.pts);
    if (typeof x.q !== 'string' || typeof x.a !== 'string' || !LEVELS.includes(pts)) { errors.push(`#${i}: needs q, a (strings) and pts 200/400/600`); continue; }
    const q = {
      id: `${c.id}-${String(++c.seq).padStart(2, '0')}`, cat: c.id, pts, q: x.q.trim(), a: x.a.trim(),
      alts: Array.isArray(x.alts) ? x.alts.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()) : [],
      media_dependent: !!x.media_dependent, fact: String(x.fact || ''),
      stages: {}, cands: {}, m: null, am: null, sources: [], answers: {}, confidence: null
    };
    run.questions.push(q); added.push(q);
  }
  for (const q of added) {
    const p = formatProblem(q);
    if (p) { fail(q, 1, p); continue; }
    pass(q, 1);
    if (leaks(q)) { fail(q, 2, 'الإجابة مكتوبة في نص السؤال'); continue; }
    pass(q, 2);
    const c = run.categories.find(c => c.id === q.cat);
    const others = [...c.existing, ...run.questions.filter(o => o !== q && o.cat === q.cat && alive(o) && o.stages[3])];
    if (isDuplicate(q, others)) fail(q, 3, 'يشبه سؤال موجود'); else pass(q, 3);
  }
  return { added, errors };
}

/* ---------- recording the model's verdicts ---------- */
function simple(v) {
  if (typeof v === 'string') {
    const m = v.trim().match(/^(pass|fail)\b[\s:،,-]*(.*)$/is);
    if (m) return { ok: m[1].toLowerCase() === 'pass', note: m[2].trim() };
  } else if (v && typeof v.pass === 'boolean') return { ok: v.pass, note: String(v.reason ?? v.note ?? '') };
  throw new Error('a verdict is "pass", "pass: note", "fail: reason" or {"pass": true|false, "reason": "..."}');
}
const onCommons = u => /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(u || '');

function apply(q, n, v) {
  if (n === 10) {
    if (typeof v === 'string' || typeof v?.pass === 'boolean') {
      const s = simple(v);
      if (s.ok) throw new Error(`${q.id}: stage 10 is {"m": index, "am": index} from q.js media, or "fail: reason"`);
      return fail(q, 10, s.note);
    }
    if (!q.cands.q?.length || !q.cands.a?.length) throw new Error(`${q.id}: search media for both "q" and "a" first (q.js media)`);
    const m = q.cands.q[v?.m], am = q.cands.a[v?.am];
    if (!m || !am) return fail(q, 10, 'ما فيه وسائط مناسبة');
    if (m.url === am.url) return fail(q, 10, 'نفس الملف للسؤال والإجابة');
    q.m = m; q.am = am;
    return pass(q, 10, v.note);
  }
  if (n === 14 || n === 17) {
    if (typeof v?.answer !== 'string') throw new Error(`${q.id}: stage ${n} is {"answer": "...", "same": true|false (only when it is the same thing written differently)}`);
    const ans = v.answer.trim();
    q.answers[n] = ans;
    if (!ans || ans === '?' || Number(v.confidence) < 50) return n === 14 ? pass(q, 14, 'ما عرف بدون بحث') : fail(q, 17, 'البحث المستقل ما وصل لإجابة');
    if (sameAnswer(ans, q.a, q.alts)) return pass(q, n, ans);
    if (v.same === true) return pass(q, n, `${ans} (نفس الإجابة بكتابة ثانية)`);
    return fail(q, n, `إجابة مستقلة مختلفة: ${ans}`);
  }
  if (n === 15) {
    if (typeof v === 'string' || v?.pass === false) {
      const s = simple(v);
      if (s.ok) throw new Error(`${q.id}: stage 15 needs {"sources": ["url", "url"]}`);
      return fail(q, 15, s.note);
    }
    const urls = (Array.isArray(v?.sources) ? v.sources : []).map(s => (typeof s === 'string' ? s : s?.url)).filter(u => /^https?:\/\//.test(u || ''));
    if (new Set(urls.map(siteOf).filter(Boolean)).size < 2) return fail(q, 15, 'أقل من مصدرين مستقلين');
    q.sources = urls.slice(0, 6);
    return pass(q, 15);
  }
  if (n === 20) {
    const s = simple(v), conf = Number(v?.confidence);
    q.confidence = Number.isFinite(conf) ? conf : null;
    if (!s.ok) return fail(q, 20, s.note);
    if (!(conf >= CFG.minConfidence)) return fail(q, 20, `الثقة ${v?.confidence ?? '؟'}% أقل من ${CFG.minConfidence}%`);
    return pass(q, 20, `${conf}%`);
  }
  const s = simple(v);
  return s.ok ? pass(q, n, s.note) : fail(q, n, s.note);
}

/** Records verdicts for stage n ({id: verdict}). Only questions that reached stage n are accepted; stage 10 also runs stage 11. */
export async function recordVerdicts(run, n, map) {
  const st = STAGES.find(s => s.n === n);
  if (!st) throw new Error(`no stage ${n}`);
  if (st.by === 'code') throw new Error(`stage ${n} is run by the tool itself`);
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('verdicts are a JSON object: {"<question id>": verdict}');
  const due = new Map(run.questions.filter(q => nextStage(q) === n).map(q => [q.id, q]));
  const gone = Object.keys(map).filter(id => !due.has(id) && run.questions.some(q => q.id === id && !alive(q)));
  const wrong = Object.keys(map).filter(id => !due.has(id) && !gone.includes(id));
  if (wrong.length) throw new Error(`not waiting for stage ${n}: ${wrong.join(', ')} (see q.js status)`);
  const touched = Object.entries(map).filter(([id]) => due.has(id)).map(([id, v]) => { const q = due.get(id); apply(q, n, v); return q; });
  if (n === 10) await stage11(touched.filter(alive));
  return { touched, gone, waiting: [...due.values()].filter(q => !(q.id in map)).map(q => q.id) };
}

async function stage11(qs) {
  for (const q of qs) {
    const media = [q.m, q.am];
    if (!media.every(c => c && isFreeLicense(c.license) && onCommons(c.url) && c.page)) { fail(q, 11, 'رخصة الوسائط مو حرة أو ناقصة'); continue; }
    if (!(await isPlayable(q.m)) || !(await isPlayable(q.am))) { fail(q, 11, 'رابط الوسائط ما يشتغل'); continue; }
    pass(q, 11, `${q.m.license} / ${q.am.license}`);
  }
}

/* ---------- views ---------- */
export function finalists(run) {
  const out = [];
  for (const c of run.categories) {
    if (c.skipped) continue;
    for (const p of LEVELS) {
      out.push(...run.questions.filter(q => q.cat === c.id && q.pts === p && done(q))
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, c.need[p] || 0));
    }
  }
  return out;
}

export function status(run) {
  const fin = new Set(finalists(run).map(q => q.id));
  const l = [`run ${run.run}`];
  for (const c of run.categories) {
    const qs = run.questions.filter(q => q.cat === c.id);
    if (c.skipped) { l.push(`\n${c.id} ${c.name}: skipped (${c.skipped})`); continue; }
    l.push(`\n${c.id} ${c.name} [${c.sector}${c.media ? ', picture/sound category' : ''}] — need ${LEVELS.map(p => `${p}×${c.need[p]}`).join(' ')}`);
    for (const p of LEVELS) {
      if (!c.need[p]) continue;
      const lvl = qs.filter(q => q.pts === p), ok = lvl.filter(q => fin.has(q.id)).length, going = lvl.filter(q => alive(q) && !done(q)).length;
      l.push(`  ${p}: ready ${ok}/${c.need[p]} · in progress ${going} · failed ${lvl.filter(q => !alive(q)).length}${ok + going < c.need[p] ? '  ← write more candidates' : ''}`);
    }
  }
  const byStage = new Map();
  for (const q of run.questions) { const n = nextStage(q); if (n) byStage.set(n, [...(byStage.get(n) || []), q.id]); }
  l.push('\nwaiting:');
  if (!byStage.size) l.push('  nothing');
  for (const [n, ids] of [...byStage].sort((a, b) => a[0] - b[0])) l.push(`  stage ${n} (${STAGES[n - 1].title}): ${ids.join(', ')}`);
  return l.join('\n');
}

const mediaLine = (label, c, withTitle = true) => {
  if (!c) return `${label}: none`;
  if (c.kind === 'audio') return `${label}: ${withTitle ? describe(c) : '(plays a sound clip)'}`;
  return `${label}: ${c.preview ? `look at ${c.preview}` : describe(c)}${withTitle ? ` (${describe(c)})` : ''}`;
};

/** Questions for an independent helper who must not see the answers (stages 14 and 17). */
export function blindSheet(run, n) {
  const qs = run.questions.filter(q => nextStage(q) === n);
  return qs.map(q => {
    const cat = run.categories.find(c => c.id === q.cat);
    const media = q.m?.kind === 'audio' && !q.media_dependent ? 'Question media: (plays a sound clip)' : mediaLine('Question media', q.m, q.media_dependent && q.m?.kind === 'audio');
    return `### ${q.id}\nCategory: ${cat.name} (${cat.sector}) · ${q.pts} points\nQ: ${q.q}\n${media}`;
  }).join('\n\n');
}

/** Everything about the questions at stages 19-20, for a fresh reviewer. */
export function judgeSheet(run) {
  const qs = run.questions.filter(q => [19, 20].includes(nextStage(q)));
  return qs.map(q => {
    const cat = run.categories.find(c => c.id === q.cat);
    const notes = Object.entries(q.stages).filter(([, v]) => v.startsWith('pass:')).map(([k, v]) => `  stage ${k}: ${v.slice(5).trim()}`);
    return [`### ${q.id} (waiting for stage ${nextStage(q)})`, `Category: ${cat.name} (${cat.sector}) · ${q.pts} points${q.media_dependent ? ' · media_dependent' : ''}`,
      `Q: ${q.q}`, `A: ${q.a}`, q.alts.length ? `Accepted variants: ${q.alts.join(' / ')}` : '',
      mediaLine('Question media', q.m), mediaLine('Answer media', q.am),
      `Sources: ${q.sources.join(' , ') || 'none'}`, `Independent answers: without search "${q.answers[14] ?? ''}", with search "${q.answers[17] ?? ''}"`,
      notes.length ? `Notes from earlier stages:\n${notes.join('\n')}` : ''].filter(Boolean).join('\n');
  }).join('\n\n');
}
