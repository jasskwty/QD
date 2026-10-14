import test from 'node:test';
import assert from 'node:assert/strict';
import { norm, similarity, isDuplicate, leaksAnswer, sameAnswer, siteOf, stripHtml } from '../src/text.js';

test('norm folds Arabic letter forms, diacritics and digits', () => {
  assert.equal(norm('أَبْرَاجُ الكويتِ'), norm('ابراج الكويت'));
  assert.equal(norm('مدينة'), norm('مدينه'));
  assert.equal(norm('٢٠١٨'), '2018');
  assert.equal(norm('مَنْ؟!'), 'من');
});

test('duplicates: rephrased question or same answer with a close question', () => {
  const old = [{ q: 'ما هي عاصمة اليابان؟', a: 'طوكيو' }];
  assert.ok(isDuplicate({ q: 'ما عاصمة اليابان؟', a: 'طوكيو' }, old));
  assert.ok(!isDuplicate({ q: 'ما هي عاصمة كوريا الجنوبية؟', a: 'سيول' }, old));
  assert.ok(similarity('من فاز بكأس العالم 2018؟', 'من فاز بكأس العالم 2018 ؟') > 0.95);
});

test('answer leak is caught with and without the article', () => {
  assert.ok(leaksAnswer('ما اسم نهر النيل الذي يمر بمصر؟', 'النيل'));
  assert.ok(leaksAnswer('في أي سنة كانت كأس العالم 2018؟', '2018'));
  assert.ok(!leaksAnswer('ما أطول نهر في أفريقيا؟', 'النيل'));
});

test('sameAnswer accepts spelling variants and listed alternatives only', () => {
  assert.ok(sameAnswer('طوكيو', 'طوكيو'));
  assert.ok(sameAnswer('الفاتيكان', 'فاتيكان'));
  assert.ok(sameAnswer('١٩٤٥', '1945'));
  assert.ok(sameAnswer('Tokyo', 'طوكيو', ['Tokyo']));
  assert.ok(!sameAnswer('كيوتو', 'طوكيو'));
  assert.ok(!sameAnswer('?', 'طوكيو'));
});

test('siteOf groups subdomains and country second levels', () => {
  assert.equal(siteOf('https://en.wikipedia.org/wiki/X'), 'wikipedia.org');
  assert.equal(siteOf('https://ar.wikipedia.org/wiki/X'), 'wikipedia.org');
  assert.equal(siteOf('https://www.kuna.net.kw/a'), 'kuna.net.kw');
  assert.equal(siteOf('https://www.bbc.co.uk/news'), 'bbc.co.uk');
  assert.equal(siteOf('not a url'), '');
});

test('stripHtml leaves readable text', () => {
  assert.equal(stripHtml('<a href="x">Mikael&nbsp;Lindmark</a> &amp; co'), 'Mikael Lindmark & co');
});
