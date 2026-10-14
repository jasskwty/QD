import test from 'node:test';
import assert from 'node:assert/strict';
import { produceCategory } from '../src/pipeline.js';
import { STAGES } from '../src/stages.js';
import { catalogEntry } from '../src/store.js';

const Q = (pts, q, a, extra = {}) => ({ pts, q, a, alts: [], media_dependent: false, fact: 'x',
  q_media: { type: 'image', intent: 'scene', searches: ['scene ' + a] }, a_media: { type: 'image', intent: 'answer', searches: ['answer ' + a] }, ...extra });

// Each question is designed to stop at a known stage (or pass all 20).
const BANK = [
  Q(200, 'ما عاصمة اليابان؟', 'طوكيو'),                                   // passes
  Q(200, 'ما عاصمة إسبانيا؟', 'مدريد'),                                   // passes
  Q(200, 'ما أطول نهر في أفريقيا؟', 'النيل', { alts: ['نهر النيل'] }),    // stage 2: alt "نهر النيل" is in the text? no → passes 2; fails 7 (unique)
  Q(200, 'ما اسم برج الكويت الشهير أبراج الكويت؟', 'أبراج الكويت'),        // stage 2: answer in question
  Q(400, 'ما هي عاصمة اليابان؟', 'طوكيو'),                                // stage 3: duplicate of an earlier one
  Q(400, 'في أي سنة انتهت الحرب العالمية الثانية؟', '1945'),               // passes
  Q(400, 'ما أكبر قارة في العالم من حيث المساحة؟', 'آسيا'),                // stage 15: only one source
  Q(400, 'من مؤسس الدولة العباسية؟', 'أبو العباس السفاح'),                 // stage 17: research finds another answer
  Q(600, 'ما الاسم العلمي للأسد؟', 'Panthera leo', { alts: ['بانثيرا ليو'] }), // passes (research answer matched by the same-answer judge)
  Q(600, 'ما أصغر دولة في العالم مساحة؟', 'الفاتيكان'),                    // stage 10: no media
  Q(600, 'كم عدد عظام جسم الإنسان البالغ؟', '206'),                       // stage 20: low confidence
  Q(600, 'ما أعلى قمة جبلية في العالم؟', 'إيفرست'),                        // passes
  Q(600, 'ما عاصمة أستراليا؟', 'كانبرا'),                                  // passes (surplus for 600)
];
const FAIL_AT = { unique: ['ما أطول نهر في أفريقيا؟'], facts1source: ['ما أكبر قارة في العالم من حيث المساحة؟'], lowConf: ['كم عدد عظام جسم الإنسان البالغ؟'] };
const RESEARCH = { 'من مؤسس الدولة العباسية؟': 'أبو مسلم الخراساني', 'ما الاسم العلمي للأسد؟': 'بانثرا ليو' };

function fakeModel() {
  const calls = [];
  const ask = async opts => {
    calls.push({ stage: opts.stage, tool: opts.tool.name, web: opts.web });
    const text = Array.isArray(opts.content) ? opts.content.filter(b => b.type === 'text').map(b => b.text).join('\n') : opts.content;
    const items = [...text.matchAll(/^\[(r\d+q\d+)\][^\n]*\nQ: (.*)$/gm)].map(m => ({ id: m[1], q: m[2] }));
    const truth = q => BANK.find(b => b.q === q);
    let out;
    if (opts.tool.name === 'submit_questions') out = { supported: true, reason: '', questions: BANK };
    else if (opts.tool.name === 'submit_picks') out = { picks: items.map(x => ({ id: x.id, q: 0, a: 0, reason: 'ok' })) };
    else if (opts.tool.name === 'submit_answers') out = { answers: items.map(x => ({ id: x.id, confidence: 90,
      answer: opts.stage === 'research' && RESEARCH[x.q] ? RESEARCH[x.q] : truth(x.q).a })) };
    else out = { verdicts: items.map(x => {
      const v = { id: x.id, pass: true, reason: 'تمام' };
      if (opts.stage === 'unique' && FAIL_AT.unique.includes(x.q)) Object.assign(v, { pass: false, reason: 'فيه أكثر من إجابة' });
      if (opts.stage === 'facts') v.sources = FAIL_AT.facts1source.includes(x.q)
        ? [{ url: 'https://en.wikipedia.org/wiki/A', title: 'a' }, { url: 'https://ar.wikipedia.org/wiki/B', title: 'b' }]
        : [{ url: 'https://en.wikipedia.org/wiki/A', title: 'a' }, { url: 'https://www.britannica.com/a', title: 'b' }];
      if (opts.stage === 'research' && opts.tool.name === 'submit_verdicts') v.pass = x.q === 'ما الاسم العلمي للأسد؟';
      if (opts.stage === 'final') v.confidence = FAIL_AT.lowConf.includes(x.q) ? 90 : 99;
      return v;
    }) };
    assert.equal(opts.validate(out), null, `validator rejected a well-formed ${opts.tool.name} for ${opts.stage}`);
    return out;
  };
  return { ask, calls };
}

const media = { findMedia: async plan => plan.searches[0].includes('الفاتيكان') ? [] : [{
  kind: plan.type, title: 'File:' + plan.searches[0] + '.jpg', url: `https://upload.wikimedia.org/wikipedia/commons/${encodeURIComponent(plan.searches[0])}.jpg`,
  page: 'https://commons.wikimedia.org/wiki/File:x', license: 'CC BY-SA 4.0', artist: 'someone', vision: { type: 'image/png', b64: 'AA==' } }],
  playable: async () => true };

test('a category run: survivors pass all 20 stages, failures stop at the right stage, need per level is respected', async () => {
  const { ask, calls } = fakeModel();
  const cat = { id: 'c201', name: 'معلومات عامة', sector: 6, counts: {} };
  const out = await produceCategory(cat, { 200: 2, 400: 2, 600: 2 }, [], { ask, ...media });

  assert.equal(STAGES.length, 20);
  for (const x of out.accepted) assert.deepEqual(x.passed, STAGES.map(s => s.n), x.q);
  const got = p => out.accepted.filter(x => x.pts === p).map(x => x.q).sort();
  assert.deepEqual(got(200), ['ما عاصمة إسبانيا؟', 'ما عاصمة اليابان؟'].sort());
  assert.deepEqual(got(600).length, 2);
  // 400 has only one survivor in the bank, so a second round runs and asks again for the missing one.
  assert.deepEqual(got(400), ['في أي سنة انتهت الحرب العالمية الثانية؟']);
  assert.equal(calls.filter(c => c.stage === 'generate').length, 2);

  const stopAt = q => out.rejected.find(x => x.q === q)?.failed.n;
  assert.equal(stopAt('ما اسم برج الكويت الشهير أبراج الكويت؟'), 2);
  assert.equal(stopAt('ما هي عاصمة اليابان؟'), 3);
  assert.equal(stopAt('ما أطول نهر في أفريقيا؟'), 7);
  assert.equal(stopAt('ما أصغر دولة في العالم مساحة؟'), 10);
  assert.equal(stopAt('ما أكبر قارة في العالم من حيث المساحة؟'), 15);
  assert.equal(stopAt('من مؤسس الدولة العباسية؟'), 17);
  assert.equal(stopAt('كم عدد عظام جسم الإنسان البالغ؟'), 20);
  for (const x of out.accepted) { assert.ok(x.mq.url && x.ma.url && x.mq.url !== x.ma.url); assert.ok(x.sources.length >= 2); }

  // Web search only in the four research stages.
  assert.deepEqual([...new Set(calls.filter(c => c.web).map(c => c.stage))].sort(), ['counter', 'details', 'facts', 'research']);
});

test('unsupported category is skipped without questions', async () => {
  const ask = async () => ({ supported: false, reason: 'تحتاج صور معدلة', questions: [] });
  const out = await produceCategory({ id: 'c131', name: 'الظل', sector: 4 }, { 200: 2, 400: 2, 600: 2 }, [], { ask, ...media });
  assert.equal(out.skipped, 'تحتاج صور معدلة');
  assert.equal(out.accepted.length, 0);
});

test('a model error fails only the items of that call, never passes them', async () => {
  const { ask } = fakeModel();
  const broken = async opts => { if (opts.stage === 'counter') throw new Error('overloaded'); return ask(opts); };
  const out = await produceCategory({ id: 'c1', name: 'x', sector: 0 }, { 200: 1, 400: 0, 600: 0 }, [], { ask: broken, ...media });
  assert.equal(out.accepted.length, 0);
  assert.ok(out.rejected.some(x => x.failed.n === 16));
});

test('catalog entry matches the site admin publishCatalog()', () => {
  assert.deepEqual(catalogEntry({ id: 'c001', name: 'أهل البحر', sector: 1, order: 1, counts: { 200: 3, 600: 1 }, aiAt: 1 }),
    { id: 'c001', name: 'أهل البحر', sector: 1, premium: false, gen: null, media: false, img: null, counts: [3, 0, 1] });
});
