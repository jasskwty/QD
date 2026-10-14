// The 20 verification stages. A question is published only if it passes every one of them, in order.
// Code stages are exact checks; model stages are independent calls with their own instructions and no memory of earlier stages
// (except stages 19 and 20, which review the evidence on purpose). Any error, refusal or missing verdict fails the item.
import { CFG, LEVELS, SECTORS } from './config.js';
import { BudgetError } from './claude.js';
import { PIPELINE, RULES, STAGE } from './prompts.js';
import { describe, visionBlock, isFreeLicense } from './media.js';
import { isDuplicate, leaksAnswer, sameAnswer, siteOf } from './text.js';

const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const sys = (key, rules = false) => `${PIPELINE}\n\n${STAGE[key]}${rules ? RULES : ''}`;

export function fail(x, st, reason) { x.failed = { n: st.n, title: st.title, reason: String(reason || 'رفض').slice(0, 300) }; }
function pass(x, st, note) { x.passed.push(st.n); if (note) x.notes[st.key] = String(note).slice(0, 300); }

/* ---------- tools that carry each stage's structured answer ---------- */
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const list = (name, desc, item) => ({ name, description: desc, input_schema: obj({ [name.replace('submit_', '')]: { type: 'array', items: item } }) });

const VERDICT = { id: { type: 'string' }, pass: { type: 'boolean' }, reason: { type: 'string' } };
const verdictTool = list('submit_verdicts', 'Submit one verdict for every item id.', obj(VERDICT));
const factsTool = list('submit_verdicts', 'Submit one verdict for every item id, with the sources that confirm it.', obj({
  ...VERDICT, sources: { type: 'array', items: obj({ url: { type: 'string' }, title: { type: 'string' } }) }
}));
const finalTool = list('submit_verdicts', 'Submit one verdict for every item id, with your confidence 0-100.', obj({
  ...VERDICT, confidence: { type: 'integer' }
}));
const answersTool = list('submit_answers', 'Submit one answer for every item id ("?" when unknown), with confidence 0-100.', obj({
  id: { type: 'string' }, answer: { type: 'string' }, confidence: { type: 'integer' }
}));
const picksTool = list('submit_picks', 'Submit the chosen candidate index for Q and for A for every item id (-1 when none fits).', obj({
  id: { type: 'string' }, q: { type: 'integer' }, a: { type: 'integer' }, reason: { type: 'string' }
}));

// Every id must come back exactly once with the right field types; otherwise the model is asked again.
const checkList = (key, ids, fields) => input => {
  const arr = input?.[key];
  if (!Array.isArray(arr)) return `"${key}" must be an array`;
  const got = new Set();
  for (const v of arr) {
    if (!v || typeof v.id !== 'string') return 'every entry needs a string id';
    for (const [f, t] of Object.entries(fields)) if (typeof v[f] !== t) return `entry ${v.id}: "${f}" must be ${t}`;
    got.add(v.id);
  }
  const missing = ids.filter(id => !got.has(id));
  return missing.length ? `missing entries for ids: ${missing.join(', ')}` : null;
};

/* ---------- how items are shown to the model ---------- */
const header = cat => `Category: ${cat.name} (sector: ${SECTORS[cat.sector] ?? SECTORS[0]})` +
  (cat.media ? ' — a picture/sound category: its questions are about recognising media.' : '');

function show(x, { answer = true, plan = false, media = false, evidence = false } = {}) {
  const l = [`[${x.id}] ${x.pts} points${x.media_dependent ? ' · media_dependent' : ''}`, `Q: ${x.q}`];
  if (answer) { l.push(`A: ${x.a}`); if (x.alts.length) l.push(`Accepted variants: ${x.alts.join(' / ')}`); }
  if (plan) l.push(`Q media plan: ${x.q_media.type} — ${x.q_media.intent}`, `A media plan: ${x.a_media.type} — ${x.a_media.intent}`);
  if (media) { l.push(`Q media: ${describe(x.mq)}`); if (answer) l.push(`A media: ${describe(x.ma)}`); }
  if (evidence) {
    if (x.sources?.length) l.push(`Sources found: ${x.sources.map(s => s.url).join(' , ')}`);
    for (const [k, v] of Object.entries(x.notes)) l.push(`Stage note (${k}): ${v}`);
    if (x.blind) l.push(`Independent answers: ${x.blind.join(' | ')}`);
  }
  return l.join('\n');
}

// Picture shown with the question for the blind stages: the image or video frame, or the sound's description when the sound is the question.
function blindMedia(x) {
  if (x.mq?.kind === 'audio') return [{ type: 'text', text: x.media_dependent ? `[${x.id}] question sound: ${describe(x.mq)}` : `[${x.id}] (plays a sound clip)` }];
  const v = visionBlock(x.mq);
  return v.length ? [{ type: 'text', text: `[${x.id}] question media:` }, ...v] : [];
}

function content(cat, part, opts, extra, footer) {
  const c = [{ type: 'text', text: header(cat) }];
  for (const x of part) { c.push({ type: 'text', text: show(x, opts) }); if (extra) c.push(...extra(x)); }
  c.push({ type: 'text', text: footer });
  return c;
}

/* ---------- shared stage runners ---------- */
async function judge(st, items, ctx, { system, opts, extra, web = 0, chunk = 12, tool = verdictTool, fields = { pass: 'boolean' },
  effort = CFG.effort, check = v => (v.pass ? null : v.reason) }) {
  for (const part of chunks(items, chunk)) {
    const ids = part.map(x => x.id);
    let out;
    try {
      out = await ctx.ask({ stage: st.key, system, tool, effort, web: web ? Math.min(web * part.length, 30) : 0,
        content: content(ctx.cat, part, opts, extra, `Return one entry for each id: ${ids.join(', ')}.`),
        validate: checkList('verdicts', ids, fields) });
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      part.forEach(x => fail(x, st, `تعذّر التحقق: ${e.message}`)); continue;
    }
    const by = new Map(out.verdicts.map(v => [v.id, v]));
    for (const x of part) {
      const v = by.get(x.id), problem = check(v, x);
      if (problem) fail(x, st, problem); else pass(x, st, v.reason);
    }
  }
}

// Independent answers (no answer shown), then a check that each matches the official answer.
async function blind(st, items, ctx, { web, abstainOk }) {
  const answered = [];
  for (const part of chunks(items, web ? 4 : 12)) {
    const ids = part.map(x => x.id);
    try {
      const out = await ctx.ask({ stage: st.key, system: sys(web ? 'research' : 'blind'), tool: answersTool, web: web ? Math.min(web * part.length, 30) : 0,
        content: content(ctx.cat, part, { answer: false }, blindMedia, `Return one answer for each id: ${ids.join(', ')}.`),
        validate: checkList('answers', ids, { answer: 'string', confidence: 'number' }) });
      const by = new Map(out.answers.map(v => [v.id, v]));
      for (const x of part) answered.push([x, by.get(x.id)]);
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      part.forEach(x => fail(x, st, `تعذّر التحقق: ${e.message}`));
    }
  }
  const unsure = [];
  for (const [x, v] of answered) {
    (x.blind ??= []).push(`${v.answer} (${v.confidence}%)`);
    const abstained = v.answer.trim() === '?' || v.confidence < 50;
    if (abstained) { if (abstainOk) pass(x, st, 'ما عرف الإجابة بدون بحث'); else fail(x, st, 'البحث المستقل ما وصل لإجابة'); }
    else if (sameAnswer(v.answer, x.a, x.alts)) pass(x, st, `نفس الإجابة: ${v.answer}`);
    else unsure.push([x, v]);
  }
  if (!unsure.length) return;
  // Not an exact match: a separate judge decides whether both answers name the same thing.
  const xs = unsure.map(([x]) => x), given = new Map(unsure.map(([x, v]) => [x.id, v.answer]));
  await judge(st, xs, ctx, { system: sys('same'), extra: x => [{ type: 'text', text: `[${x.id}] given answer: ${given.get(x.id)}` }],
    check: v => (v.pass ? null : `إجابة مستقلة مختلفة: ${given.get(v.id)}`) });
}

/* ---------- the 20 stages ---------- */
const formatProblem = x => {
  if (!LEVELS.includes(x.pts)) return 'النقاط لازم 200 أو 400 أو 600';
  if (!/[؀-ۿ]/.test(x.q)) return 'السؤال مو بالعربي';
  if (x.q.length < 8 || x.q.length > 250) return 'طول السؤال غير مناسب';
  if (!/[؟?]\s*$/.test(x.q)) return 'السؤال لازم ينتهي بعلامة استفهام';
  if (!x.a.trim() || x.a.length > 60 || x.a.trim().split(/\s+/).length > 8) return 'الإجابة لازم تكون قصيرة';
  if (/https?:|www\./i.test(x.q + x.a)) return 'فيه رابط في النص';
  return null;
};
const onCommons = u => /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(u || '');

export const STAGES = [
  { key: 'format', title: 'شكل السؤال والإجابة', run: async items => items.forEach(x => { const p = formatProblem(x); p ? fail(x, S.format, p) : pass(x, S.format); }) },
  { key: 'leak', title: 'الإجابة مو مكتوبة في السؤال', run: async items => items.forEach(x =>
    [x.a, ...x.alts].some(a => leaksAnswer(x.q, a)) ? fail(x, S.leak, 'الإجابة مكتوبة في نص السؤال') : pass(x, S.leak)) },
  { key: 'duplicate', title: 'مو مكرر', run: async (items, ctx) => {
    const seen = [...ctx.existing];
    for (const x of items) { if (isDuplicate(x, seen)) fail(x, S.duplicate, 'يشبه سؤال موجود'); else { pass(x, S.duplicate); seen.push(x); } }
  } },
  { key: 'language', title: 'سلامة اللغة والصياغة', run: (items, ctx) => judge(S.language, items, ctx, { system: sys('language') }) },
  { key: 'category', title: 'يناسب الفئة', run: (items, ctx) => judge(S.category, items, ctx, { system: sys('category') }) },
  { key: 'difficulty', title: 'الصعوبة تناسب النقاط', run: (items, ctx) => judge(S.difficulty, items, ctx, { system: sys('difficulty') }) },
  { key: 'unique', title: 'إجابة وحدة بس', run: (items, ctx) => judge(S.unique, items, ctx, { system: sys('unique') }) },
  { key: 'stable', title: 'ما يتغير مع الوقت', run: (items, ctx) => judge(S.stable, items, ctx, { system: sys('stable') }) },
  { key: 'rules', title: 'يناسب الجمهور وسياسة الموقع', run: (items, ctx) => judge(S.rules, items, ctx, { system: sys('rules', true), opts: { plan: true } }) },
  { key: 'media', title: 'إيجاد الصورة أو الصوت أو المقطع', run: pickMedia },
  { key: 'license', title: 'رخصة الوسائط حرة', run: async items => items.forEach(x =>
    [x.mq, x.ma].every(c => c && isFreeLicense(c.license) && onCommons(c.url) && c.page) ? pass(x, S.license, `${x.mq.license} / ${x.ma.license}`)
      : fail(x, S.license, 'رخصة الوسائط مو حرة أو ناقصة')) },
  { key: 'qMedia', title: 'وسائط السؤال مناسبة وما تكشف الإجابة', run: (items, ctx) => judge(S.qMedia, items, ctx, {
    system: sys('qMedia', true), opts: { media: true }, chunk: 6, extra: x => visionBlock(x.mq) }) },
  { key: 'aMedia', title: 'وسائط الإجابة تطابق الإجابة', run: (items, ctx) => judge(S.aMedia, items, ctx, {
    system: sys('aMedia', true), opts: { media: true }, chunk: 6, extra: x => visionBlock(x.ma) }) },
  { key: 'blind', title: 'إجابة مستقلة بدون بحث', run: (items, ctx) => blind(S.blind, items, ctx, { web: 0, abstainOk: true }) },
  { key: 'facts', title: 'مصدرين موثوقين مستقلين على الأقل', run: (items, ctx) => judge(S.facts, items, ctx, {
    system: sys('facts'), tool: factsTool, web: 5, chunk: 4, fields: { pass: 'boolean', sources: 'object' },
    check: (v, x) => {
      if (!v.pass) return v.reason;
      const sources = (Array.isArray(v.sources) ? v.sources : []).filter(s => typeof s?.url === 'string');
      if (new Set(sources.map(s => siteOf(s.url)).filter(Boolean)).size < 2) return 'أقل من مصدرين مستقلين';
      x.sources = sources.slice(0, 6);
      return null;
    } }) },
  { key: 'counter', title: 'البحث عن أي مصدر يناقض الإجابة', run: (items, ctx) => judge(S.counter, items, ctx, { system: sys('counter'), web: 4, chunk: 4 }) },
  { key: 'research', title: 'بحث مستقل يوصل لنفس الإجابة', run: (items, ctx) => blind(S.research, items, ctx, { web: 4, abstainOk: false }) },
  { key: 'details', title: 'دقة الأسماء والأرقام والتواريخ', run: (items, ctx) => judge(S.details, items, ctx, { system: sys('details'), web: 4, chunk: 4 }) },
  { key: 'redteam', title: 'مراجعة عكسية (اعتراض VAR)', run: (items, ctx) => judge(S.redteam, items, ctx, {
    system: sys('redteam', true), opts: { media: true, evidence: true }, chunk: 6, extra: x => [...visionBlock(x.mq), ...visionBlock(x.ma)] }) },
  { key: 'final', title: 'الحكم النهائي', run: (items, ctx) => judge(S.final, items, ctx, {
    system: sys('final', true), opts: { media: true, evidence: true }, chunk: 6, tool: finalTool, effort: CFG.finalEffort,
    fields: { pass: 'boolean', confidence: 'number' }, extra: x => [...visionBlock(x.mq), ...visionBlock(x.ma)],
    check: (v, x) => {
      x.conf = v.confidence;
      if (!v.pass) return v.reason;
      return v.confidence >= CFG.minConfidence ? null : `الثقة ${v.confidence}% أقل من ${CFG.minConfidence}%`;
    } }) }
].map((s, i) => ({ ...s, n: i + 1 }));
const S = Object.fromEntries(STAGES.map(s => [s.key, s]));

// Stage 10: search Commons for each planned media, let the model pick by looking at them, then make sure the links play.
async function pickMedia(items, ctx) {
  const st = S.media;
  for (const x of items) {
    x.cq = await ctx.findMedia(x.q_media);
    x.ca = x.cq.length ? await ctx.findMedia(x.a_media) : [];
    if (!x.cq.length) fail(x, st, 'ما لقيت وسائط حرة للسؤال');
    else if (!x.ca.length) fail(x, st, 'ما لقيت وسائط حرة للإجابة');
  }
  const alive = items.filter(x => !x.failed);
  const cands = x => [
    ...x.cq.flatMap((c, i) => [{ type: 'text', text: `[${x.id}] Q candidate ${i}: ${describe(c)} · license ${c.license}` }, ...visionBlock(c)]),
    ...x.ca.flatMap((c, i) => [{ type: 'text', text: `[${x.id}] A candidate ${i}: ${describe(c)} · license ${c.license}` }, ...visionBlock(c)])
  ];
  for (const part of chunks(alive, 4)) {
    const ids = part.map(x => x.id);
    let out;
    try {
      out = await ctx.ask({ stage: st.key, system: sys('mediaPick', true), tool: picksTool,
        content: content(ctx.cat, part, { plan: true }, cands, `Return one pick for each id: ${ids.join(', ')}.`),
        validate: checkList('picks', ids, { q: 'number', a: 'number' }) });
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      part.forEach(x => fail(x, st, `تعذّر اختيار الوسائط: ${e.message}`)); continue;
    }
    const by = new Map(out.picks.map(p => [p.id, p]));
    for (const x of part) {
      const p = by.get(x.id), q = x.cq[p.q], a = x.ca[p.a];
      if (!q || !a) fail(x, st, `ما فيه وسائط مناسبة: ${p.reason || ''}`);
      else if (q.url === a.url) fail(x, st, 'نفس الملف للسؤال والإجابة');
      else if (!(await ctx.playable(q)) || !(await ctx.playable(a))) fail(x, st, 'رابط الوسائط ما يشتغل');
      else { x.mq = q; x.ma = a; pass(x, st, p.reason); }
    }
  }
  for (const x of items) { delete x.cq; delete x.ca; }
}
