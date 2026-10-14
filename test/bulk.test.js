import test from 'node:test';
import assert from 'node:assert/strict';
import { mentions, queryFor } from '../src/bulk.js';
import { TEMPLATES, CAT_NAMES, EXCLUDE } from '../src/templates.js';
import { formatProblem } from '../src/run.js';

test('mentions: numbers, element/airport codes and Arabic words with or without the article', () => {
  assert.ok(mentions('Iron is a chemical element; it has symbol Fe and atomic number 26.', 'Fe'));
  assert.ok(!mentions('Ferrous iron', 'Fe'));
  assert.ok(mentions('Iron … atomic number 26.', '26'));
  assert.ok(!mentions('Iron … atomic number 263.', '26'));
  assert.ok(mentions('He was awarded the 1921 Nobel Prize', '1921'));
  assert.ok(mentions('مدريد هي عاصمة إسبانيا وأكبر مدنها', 'مدريد'));
  assert.ok(mentions('حاصل على جائزة نوبل في الفيزياء عام ١٩٢١', 'الفيزياء'));
  assert.ok(mentions('حاصل على جائزة نوبل عام ١٩٢١', '1921'));
  assert.ok(!mentions('', 'مدريد'));
});

test('every template has a site category, Arabic wording that passes the format check, and a query', () => {
  const x = { s: 'Q1', a: 'Q2', s_ar: 'إسبانيا', a_ar: 'مدريد', s_en: 'Spain', a_en: 'Madrid', pop: '100', arab: '', cont: 'Q46', h: '7000', len: '2000',
    sym: 'Fe', ord: '16', g: 'Q6581072', prize: 'Q38104', t: 'Q8261' };
  for (const t of TEMPLATES) {
    const cat = typeof t.cat === 'function' ? t.cat({ ...x }) : t.cat;
    if (cat !== null) assert.ok(CAT_NAMES[cat], `${t.key}: category ${cat} has no name`);
    const q = t.q({ ...x, s_ar: t.key.startsWith('airport') ? 'مطار دبي الدولي' : x.s_ar });
    assert.equal(formatProblem({ q, a: 'مدريد', pts: 200 }), null, `${t.key}: ${q}`);
    const sparql = queryFor(t);
    assert.match(sparql, /SELECT DISTINCT \?s \?a/);
    for (const q of EXCLUDE) assert.ok(sparql.includes(`wd:${q}`), `${t.key} excludes ${q}`);
    assert.ok(t.qm || t.qmFile || /\?qm/.test(t.where), `${t.key}: question media`);
    assert.ok(t.am || t.sameOk, `${t.key}: answer media`);
  }
});

test('Arabic helpers in the wording', () => {
  const by = k => TEMPLATES.find(t => t.key === k);
  assert.equal(by('element-symbol').q({ s_ar: 'حديد' }), 'ما الرمز الكيميائي للحديد؟');
  assert.equal(by('element-symbol').q({ s_ar: 'الهيليوم' }), 'ما الرمز الكيميائي للهيليوم؟');
  assert.equal(by('island-country').q({ s_ar: 'جزيرة جيجو' }), 'إلى أي دولة تتبع جزيرة جيجو؟');
  assert.equal(by('island-country').q({ s_ar: 'سردينيا' }), 'إلى أي دولة تتبع جزيرة سردينيا؟');
  assert.equal(by('nobel-field').q({ s_ar: 'ماري كوري', g: 'Q6581072' }), 'في أي مجال حصلت ماري كوري على جائزة نوبل؟');
  assert.equal(by('nobel-year').q({ s_ar: 'ألبرت أينشتاين', prize: 'Q38104' }), 'في أي سنة حصل ألبرت أينشتاين على جائزة نوبل في الفيزياء؟');
  assert.equal(by('airport-iata').q({ s_ar: 'باريس' }), null);
});
