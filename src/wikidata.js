// Free sources for the bulk builder: Wikidata (facts), Wikipedia (second source), Wikimedia Commons (media).
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { toCandidate } from './media.js';

const UA = 'QnsQuestionBot/1.0 (https://qns.web.app; quiz question generator)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function http(url, init = {}, tries = 5) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, 'Api-User-Agent': UA, ...init.headers }, signal: AbortSignal.timeout(90000) });
      if ((r.status === 429 || r.status >= 500) && i < tries - 1) { await r.body?.cancel(); await sleep(Math.min(Number(r.headers.get('retry-after')) || 5 * 2 ** i, 60) * 1000); continue; }
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      return await r.json();
    } catch (e) {
      if (i >= tries - 1 || /^4\d\d /.test(e.message)) throw e;
      await sleep(5000 * 2 ** i);
    }
  }
}

// Responses are cached on disk so an interrupted build resumes without asking again.
async function cached(dir, key, fn) {
  const file = path.join(dir, key.replace(/[^\w-]/g, '_') + '.json');
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  const v = await fn();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(v));
  return v;
}

export async function sparql(query, cacheDir, key) {
  return cached(cacheDir, `sparql-${key}`, async () => {
    const j = await http('https://query.wikidata.org/sparql', {
      method: 'POST', body: 'query=' + encodeURIComponent(query),
      headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return j.results.bindings.map(b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
  });
}

// "http://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20Spain.svg" → "File:Flag of Spain.svg"
export const fileTitle = u => 'File:' + decodeURIComponent(String(u).split('/Special:FilePath/')[1] || '').replace(/_/g, ' ');

const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 16);
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// Follows the API's normalisation and redirects so every requested title maps to its page.
function pagesByTitle(j, asked) {
  const map = new Map();
  for (const t of asked) map.set(t, t);
  for (const n of [...(j.query?.normalized || []), ...(j.query?.redirects || [])]) for (const [k, v] of map) if (v === n.from) map.set(k, n.to);
  const pages = new Map((j.query?.pages || []).map(p => [p.title, p]));
  return new Map([...map].map(([k, v]) => [k, pages.get(v)]));
}

/** Commons file info for many titles at once → Map(title → playable candidate or null). */
export async function commonsFiles(titles, kind, cacheDir) {
  const out = new Map();
  for (const part of chunks([...new Set(titles)].sort(), 50)) {
    const j = await cached(cacheDir, `commons-${kind}-${hash(part.join('|'))}`, () => {
      const p = new URLSearchParams({
        action: 'query', format: 'json', formatversion: '2', titles: part.join('|'),
        prop: 'imageinfo|videoinfo', iiprop: 'url|mime|size|mediatype|extmetadata', iiurlwidth: '960',
        iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription|ObjectName', viprop: 'size|derivatives'
      });
      return http('https://commons.wikimedia.org/w/api.php', { method: 'POST', body: p, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    });
    for (const [t, pg] of pagesByTitle(j, part)) out.set(t, pg && !pg.missing ? toCandidate(pg, kind) : null);
    await sleep(200);
  }
  return out;
}

// Runs fn over items, `n` at a time.
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

/** Plain-text intros of Wikipedia articles → Map(title → text). Four requests at a time: the extracts API is slow per call. */
export async function intros(lang, titles, cacheDir) {
  const out = new Map();
  await pool(chunks([...new Set(titles)].sort(), 20), 4, async part => {
    const j = await cached(cacheDir, `intro-${lang}-${hash(part.join('|'))}`, () => {
      const p = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'extracts', exintro: '1', explaintext: '1', exlimit: '20', redirects: '1', titles: part.join('|') });
      return http(`https://${lang}.wikipedia.org/w/api.php`, { method: 'POST', body: p, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    });
    for (const [t, pg] of pagesByTitle(j, part)) out.set(t, pg?.extract || '');
  });
  return out;
}
