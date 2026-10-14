// Deletes every question in the public categories (categories/*/questions). Players' private categories (users/*/cats) are not touched.
// Two steps so nothing is deleted before the backup is safe:
//   QGEN_WIPE_STEP=backup  → writes out/questions-backup.jsonl (and a copy to Firebase Storage when the project has it)
//   QGEN_WIPE_STEP=delete  → deletes exactly the questions listed in that file, recounts, republishes the catalog
// Restore with src/restore.js.
import fs from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { CFG } from './config.js';
import * as store from './store.js';

const CONFIRM = 'DELETE-ALL-QUESTIONS';
if (process.env.QGEN_WIPE_CONFIRM !== CONFIRM) throw new Error(`Set QGEN_WIPE_CONFIRM=${CONFIRM} to wipe.`);
const step = process.env.QGEN_WIPE_STEP;
if (!['backup', 'delete'].includes(step)) throw new Error('Set QGEN_WIPE_STEP to backup, then delete.');

const db = store.init();
const file = path.join(CFG.workDir, 'questions-backup.jsonl');
const cats = await store.loadCategories(db);

if (step === 'backup') {
  await fs.mkdir(CFG.workDir, { recursive: true });
  const enc = v => (v instanceof Timestamp ? { _ts: v.toDate().toISOString() } : v);
  const out = createWriteStream(file);
  let n = 0;
  for (const c of cats) {
    let last = null;
    for (;;) {
      let q = db.collection('categories').doc(c.id).collection('questions').orderBy('__name__').limit(500);
      if (last) q = q.startAfter(last);
      const s = await q.get();
      for (const d of s.docs) {
        const data = Object.fromEntries(Object.entries(d.data()).map(([k, v]) => [k, enc(v)]));
        if (!out.write(JSON.stringify({ cat: c.id, id: d.id, data }) + '\n')) await new Promise(r => out.once('drain', r));
        n++;
      }
      if (s.size < 500) break;
      last = s.docs.at(-1);
    }
  }
  await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));
  console.log(`backup: ${n} questions from ${cats.length} categories → ${file}`);
  try {
    const dest = `backups/questions-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    await getStorage().bucket().upload(file, { destination: dest, gzip: true });
    console.log(`copy in Firebase Storage: ${dest}`);
  } catch (e) { console.log(`no Firebase Storage copy (${e.message}); the workflow artifact is the backup`); }
}

if (step === 'delete') {
  const w = db.bulkWriter();
  let n = 0;
  for await (const line of readline.createInterface({ input: createReadStream(file) })) {
    if (!line.trim()) continue;
    const { cat, id } = JSON.parse(line);
    w.delete(db.collection('categories').doc(cat).collection('questions').doc(id));
    n++;
  }
  await w.close();
  for (const c of cats) await store.recount(db, c.id);
  console.log(`deleted ${n} questions · catalog republished: ${await store.publishCatalog(db)} categories`);
}
