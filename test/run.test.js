import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun, addQuestions, recordVerdicts, nextStage, alive, done, finalists, blindSheet, judgeSheet } from '../src/run.js';
import { STAGES } from '../src/config.js';

const cat = { id: 'c201', name: 'عواصم الدول', sector: 6, counts: { 200: 0 } };
const fresh = () => newRun([{ cat, need: { 200: 2, 400: 0, 600: 0 } }], { c201: [{ q: 'ما عاصمة اليابان؟', a: 'طوكيو' }] });

test('stages 1-3 run on add and catch format, leaked answer and duplicates', () => {
  const run = fresh();
  const { added, errors } = addQuestions(run, [
    { cat: 'c201', pts: 200, q: 'ما عاصمة إسبانيا؟', a: 'مدريد' },
    { cat: 'c201', pts: 200, q: 'ما هي عاصمة اليابان؟', a: 'طوكيو' },
    { cat: 'c201', pts: 200, q: 'ما عاصمة إسبانيا مدريد؟', a: 'مدريد' },
    { cat: 'c201', pts: 200, q: 'عاصمة فرنسا', a: 'باريس' },
    { cat: 'nope', pts: 200, q: 'x؟', a: 'y' }
  ]);
  assert.equal(errors.length, 1);
  assert.deepEqual(added.map(q => q.id), ['c201-01', 'c201-02', 'c201-03', 'c201-04']);
  assert.equal(nextStage(added[0]), 4);
  assert.match(added[1].stages[3], /^fail/);
  assert.match(added[2].stages[2], /^fail/);
  assert.match(added[3].stages[1], /^fail/);
});

test('verdicts must follow the stage order; failed questions are ignored, not errors', async () => {
  const run = fresh();
  addQuestions(run, [{ cat: 'c201', pts: 200, q: 'ما عاصمة إسبانيا؟', a: 'مدريد' }, { cat: 'c201', pts: 200, q: 'ما عاصمة مصر؟', a: 'القاهرة' }]);
  await assert.rejects(recordVerdicts(run, 5, { 'c201-01': 'pass' }), /not waiting for stage 5/);
  await assert.rejects(recordVerdicts(run, 3, { 'c201-01': 'pass' }), /run by the tool/);
  await assert.rejects(recordVerdicts(run, 4, { 'c201-01': 'ok' }), /a verdict is/);
  const r = await recordVerdicts(run, 4, { 'c201-01': 'pass', 'c201-02': 'fail: خطأ إملائي' });
  assert.deepEqual(r.waiting, []);
  assert.equal(nextStage(run.questions[0]), 5);
  assert.ok(!alive(run.questions[1]));
  const r2 = await recordVerdicts(run, 5, { 'c201-01': 'pass', 'c201-02': 'pass' });
  assert.deepEqual(r2.gone, ['c201-02']);
});

test('stage 10 needs searched media; blind answers, sources and confidence are checked by code', async () => {
  const run = fresh();
  addQuestions(run, [{ cat: 'c201', pts: 200, q: 'ما عاصمة إسبانيا؟', a: 'مدريد', alts: ['Madrid'] }, { cat: 'c201', pts: 200, q: 'ما عاصمة مصر؟', a: 'القاهرة' }]);
  for (const n of [4, 5, 6, 7, 8, 9]) await recordVerdicts(run, n, { 'c201-01': 'pass', 'c201-02': 'pass' });
  await assert.rejects(recordVerdicts(run, 10, { 'c201-01': { m: 0, am: 0 } }), /search media/);
  const img = (n, license = 'CC BY-SA 4.0') => ({ kind: 'image', url: `https://upload.wikimedia.org/x/${n}.jpg`, page: 'https://commons.wikimedia.org/wiki/File:x', license, title: n });
  run.questions[0].cands = { q: [img('flag')], a: [img('palace')] };
  run.questions[1].cands = { q: [img('same')], a: [img('same')] };
  // Pretend the links were already found playable: stage 11 is exercised against real Commons in the live rehearsal.
  run.questions[0].stages[10] = 'pass'; run.questions[0].stages[11] = 'pass'; run.questions[0].m = img('flag'); run.questions[0].am = img('palace');
  await recordVerdicts(run, 10, { 'c201-02': { m: 0, am: 0 } });
  assert.match(run.questions[1].stages[10], /نفس الملف/);

  const q = run.questions[0];
  await recordVerdicts(run, 12, { 'c201-01': 'pass' });
  await recordVerdicts(run, 13, { 'c201-01': 'pass' });
  assert.ok(!blindSheet(run, 14).includes('مدريد'), 'the blind sheet must not show the answer');
  await recordVerdicts(run, 14, { 'c201-01': { answer: '?' } });             // not knowing without search is fine
  assert.equal(nextStage(q), 15);
  const copy = structuredClone(run);
  await recordVerdicts(copy, 15, { 'c201-01': { sources: ['https://en.wikipedia.org/a', 'https://ar.wikipedia.org/b'] } });
  assert.match(copy.questions[0].stages[15], /مصدرين/);
  await recordVerdicts(run, 15, { 'c201-01': { sources: ['https://en.wikipedia.org/a', 'https://www.britannica.com/b'] } });
  await recordVerdicts(run, 16, { 'c201-01': 'pass' });
  const wrong = structuredClone(run);
  await recordVerdicts(wrong, 17, { 'c201-01': { answer: 'برشلونة' } });
  assert.match(wrong.questions[0].stages[17], /مختلفة/);
  await recordVerdicts(run, 17, { 'c201-01': { answer: 'Madrid' } });
  await recordVerdicts(run, 18, { 'c201-01': 'pass' });
  assert.ok(judgeSheet(run).includes('A: مدريد'));
  await recordVerdicts(run, 19, { 'c201-01': 'pass' });
  const low = structuredClone(run);
  await recordVerdicts(low, 20, { 'c201-01': { pass: true, confidence: 90 } });
  assert.match(low.questions[0].stages[20], /الثقة/);
  await recordVerdicts(run, 20, { 'c201-01': { pass: true, confidence: 99 } });
  assert.ok(done(q));
  assert.deepEqual(Object.keys(q.stages).map(Number), STAGES.map(s => s.n));
  assert.deepEqual(finalists(run).map(x => x.id), ['c201-01']);
});
