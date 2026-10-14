// Firestore access with the Admin SDK. Same data shape as the site's admin page (public/js/admin.js, qeditor.js).
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { LEVELS } from './config.js';

export function init() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  const sa = JSON.parse(raw);
  initializeApp({ credential: cert(sa), storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${sa.project_id}.firebasestorage.app` });
  return getFirestore();
}

export async function loadCategories(db) {
  const s = await db.collection('categories').get();
  return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
}

export async function existingQuestions(db, catId, max = 400) {
  const s = await db.collection('categories').doc(catId).collection('questions').select('q', 'a', 'pts').limit(max).get();
  return s.docs.map(d => d.data());
}

/** Adds the accepted questions and bumps the category counts, like addQuestions() in the site's qeditor.js. */
export async function writeQuestions(db, cat, items, runId) {
  const ref = db.collection('categories').doc(cat.id);
  const b = db.batch(), cnt = { 200: 0, 400: 0, 600: 0 };
  for (const x of items) {
    b.set(ref.collection('questions').doc(), {
      q: x.q, a: x.a, m: x.mq.url, am: x.ma.url, pts: x.pts, rnd: Math.random(), createdAt: FieldValue.serverTimestamp(),
      ai: {
        run: runId, stages: x.passed.length, confidence: x.conf ?? null, alts: x.alts,
        sources: (x.sources || []).map(s => s.url),
        media: [x.mq, x.ma].map(c => ({ title: c.title, page: c.page, license: c.license, artist: c.artist }))
      }
    });
    cnt[x.pts]++;
  }
  b.set(ref, {
    counts: Object.fromEntries(LEVELS.map(p => [String(p), FieldValue.increment(cnt[p])])),
    aiAt: FieldValue.serverTimestamp(), aiFails: 0
  }, { merge: true });
  await b.commit();
}

export const markSkipped = (db, catId, reason) => db.collection('categories').doc(catId).set({ aiSkip: reason, aiAt: FieldValue.serverTimestamp() }, { merge: true });
export const markFailed = (db, catId) => db.collection('categories').doc(catId).set({ aiFails: FieldValue.increment(1), aiAt: FieldValue.serverTimestamp() }, { merge: true });

/** Rebuilds meta/catalog exactly like publishCatalog() in the site's admin.js (players read categories from it). */
export async function publishCatalog(db) {
  const cats = (await loadCategories(db)).filter(c => c.active !== false).map(catalogEntry);
  await db.collection('meta').doc('catalog').set({ cats, updatedAt: FieldValue.serverTimestamp() });
  return cats.length;
}
export const catalogEntry = c => ({
  id: c.id, name: c.name, sector: c.sector ?? 0, premium: !!c.premium, gen: c.gen || null, media: !!c.media, img: c.img || null,
  counts: LEVELS.map(p => (c.counts || {})[p] || 0)
});

/** Sets a category's counts from the questions actually stored. */
export async function recount(db, catId) {
  const col = db.collection('categories').doc(catId).collection('questions');
  const n = await Promise.all(LEVELS.map(async p => (await col.where('pts', '==', p).count().get()).data().count));
  await db.collection('categories').doc(catId).set({ counts: Object.fromEntries(LEVELS.map((p, i) => [String(p), n[i]])) }, { merge: true });
  return n;
}

export const saveRunSummary = (db, summary) => db.collection('meta').doc('aigen').set({ lastRun: summary, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
