import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, split, queue } from '../src/plan.js';
import { catalogEntry } from '../src/store.js';

const cats = [
  { id: 'c300', name: 'جاهزة', order: 300, counts: { 200: 9, 400: 9, 600: 9 } },
  { id: 'c202', name: 'أعلام الدول', order: 202, counts: { 200: 3, 400: 1, 600: 0 } },
  { id: 'c201', name: 'عواصم الدول', order: 201, counts: {} },
  { id: 'c000', name: 'حساب', order: 0, gen: 'math' },
  { id: 'c010', name: 'مشالة', order: 10, active: false },
  { id: 'c131', name: 'الظل', order: 131, aiSkip: 'تحتاج صور معدلة' },
  { id: 'c150', name: 'فاشلة', order: 150, counts: {}, aiFails: 3 }
];

test('queue: empty levels first, then fewest questions; skips generated, hidden, skipped; repeated failures last', () => {
  assert.deepEqual(queue(cats).map(c => c.id), ['c201', 'c202', 'c300', 'c150']);
  assert.deepEqual(queue(cats, ['الظل']).map(c => c.id), ['c131']);
});

test('split gives the emptiest level first, at most 2 per level', () => {
  assert.deepEqual(split(6, cats[1]), { 200: 2, 400: 2, 600: 2 });
  assert.deepEqual(split(3, cats[1]), { 200: 1, 400: 1, 600: 1 });
  assert.deepEqual(split(1, cats[1]), { 200: 0, 400: 0, 600: 1 });
});

test('plan adds up to the questions per run', () => {
  const p = plan(cats, { perRun: 8 });
  assert.deepEqual(p.map(x => x.cat.id), ['c201', 'c202']);
  assert.deepEqual(p[1].need, { 200: 0, 400: 1, 600: 1 });
});

test('catalog entry matches the site admin publishCatalog()', () => {
  assert.deepEqual(catalogEntry({ id: 'c001', name: 'أهل البحر', sector: 1, order: 1, counts: { 200: 3, 600: 1 }, aiAt: 1 }),
    { id: 'c001', name: 'أهل البحر', sector: 1, premium: false, gen: null, media: false, img: null, counts: [3, 0, 1] });
});
