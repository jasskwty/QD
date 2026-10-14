// Puts back the questions from a wipe backup (same document ids). QGEN_RESTORE is a local .jsonl file or a Firebase Storage path (backups/...).
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { createReadStream } from 'node:fs';
import { Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { CFG } from './config.js';
import * as store from './store.js';

const src = process.env.QGEN_RESTORE;
if (!src) throw new Error('Set QGEN_RESTORE to a backup file or a Storage path like backups/questions-backup-....jsonl');
const db = store.init();

let file = src;
if (src.startsWith('backups/')) {
  await fs.mkdir(CFG.outDir, { recursive: true });
  file = path.join(CFG.outDir, path.basename(src));
  await getStorage().bucket().file(src).download({ destination: file });
}

const dec = v => (v && typeof v === 'object' && typeof v._ts === 'string' ? Timestamp.fromDate(new Date(v._ts)) : v);
const w = db.bulkWriter(), cats = new Set();
let n = 0;
for await (const line of readline.createInterface({ input: createReadStream(file) })) {
  if (!line.trim()) continue;
  const { cat, id, data } = JSON.parse(line);
  w.set(db.collection('categories').doc(cat).collection('questions').doc(id), Object.fromEntries(Object.entries(data).map(([k, v]) => [k, dec(v)])));
  cats.add(cat); n++;
}
await w.close();
for (const c of cats) await store.recount(db, c);
console.log(`restored ${n} questions in ${cats.size} categories · catalog republished: ${await store.publishCatalog(db)} categories`);
