// Media from Wikimedia Commons: freely licensed images, sounds and clips, linked straight from upload.wikimedia.org.
import { stripHtml } from './text.js';

const UA = 'QnsQuestionBot/1.0 (https://qns.web.app; quiz question generator)';
const API = 'https://commons.wikimedia.org/w/api.php';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = u => (u ? String(u).split('?')[0] : '');   // Commons adds utm_* tracking parameters to file URLs

// Commons asks bots to send API requests one at a time; file downloads go a few at a time.
let chain = Promise.resolve();
function polite(fn) { const p = chain.then(fn); chain = p.catch(() => {}).then(() => sleep(300)); return p; }
let active = 0; const waiting = [];
async function limited(fn) {
  if (active >= 4) await new Promise(r => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

async function http(url, { api = false, range } = {}) {
  for (let i = 0; ; i++) {
    const headers = { 'User-Agent': UA, 'Api-User-Agent': UA };
    if (api && process.env.WIKIMEDIA_TOKEN) headers.Authorization = 'Bearer ' + process.env.WIKIMEDIA_TOKEN;
    if (range) headers.Range = range;
    let r;
    try { r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30000) }); }
    catch (e) { if (i < 4) { await sleep(2000 * 2 ** i); continue; } throw e; }
    if ((r.status === 429 || r.status >= 500) && i < 4) {
      await r.body?.cancel();
      await sleep(Math.min(Number(r.headers.get('retry-after')) || 2 * 2 ** i, 60) * 1000);
      continue;
    }
    return r;
  }
}

const FREE = /(cc0|cc[- ]?by|public domain|^pd\b|\bpd-|gfdl|free art|\bfal\b|attribution|no restrictions|copyrighted free use)/i;
const NOT_FREE = /\b(nc|nd|non-?commercial|no ?deriv\w*|fair use|non-free|all rights reserved)\b/i;
export const isFreeLicense = l => !!l && FREE.test(l) && !NOT_FREE.test(l);

// 960px thumbnail → 500px copy for the model's eyes (both are standard Commons sizes).
const smaller = u => u.replace(/\/\d+px-/, '/500px-');

const VIDEO_PREF = ['480p.vp9.webm', '720p.vp9.webm', '360p.vp9.webm', '240p.vp9.webm'];

/** Turns one page of a Commons search result into a playable candidate, or null when it doesn't fit the kind. */
export function toCandidate(pg, kind) {
  const ii = pg.imageinfo?.[0];
  if (!ii) return null;
  const vi = pg.videoinfo?.[0] || {};
  const meta = k => stripHtml(ii.extmetadata?.[k]?.value);
  const base = {
    kind, title: pg.title, page: clean(ii.descriptionurl), mime: ii.mime || '',
    license: meta('LicenseShortName'), artist: meta('Artist').slice(0, 200),
    description: (meta('ImageDescription') || meta('ObjectName')).slice(0, 300)
  };
  const duration = vi.duration ?? ii.duration ?? null;
  if (kind === 'image') {
    if (!['BITMAP', 'DRAWING'].includes(ii.mediatype)) return null;
    if ((ii.width || 0) < 300 || (ii.height || 0) < 200) return null;
    const url = clean(ii.thumburl || ii.url);
    if (!/\.(jpe?g|png|gif|webp)$/i.test(url)) return null;
    return { ...base, url, thumb: smaller(url) };
  }
  const ds = (vi.derivatives || []).map(d => ({ ...d, src: clean(d.src) }));
  if (kind === 'audio') {
    if (ii.mediatype !== 'AUDIO' || (duration && duration > 120)) return null;
    // mp3 transcode first: iPhones don't play Ogg.
    const url = ds.find(d => /^audio\/mpeg/.test(d.type))?.src || (/\.(mp3|wav|m4a)$/i.test(clean(ii.url)) ? clean(ii.url) : '');
    return url ? { ...base, url, duration } : null;
  }
  if (kind === 'video') {
    if (ii.mediatype !== 'VIDEO' || (duration && duration > 180)) return null;
    const url = ds.find(d => /^video\/mp4/.test(d.type))?.src
      || VIDEO_PREF.map(k => ds.find(d => d.transcodekey === k)?.src).find(Boolean)
      || (/\.(mp4|webm)$/i.test(clean(ii.url)) ? clean(ii.url) : '');
    if (!url || !/\.(mp4|webm|mov)$/i.test(url)) return null;
    return { ...base, url, duration, thumb: ii.thumburl ? smaller(clean(ii.thumburl)) : '' };
  }
  return null;
}

export async function searchCommons(query, kind) {
  const ft = kind === 'audio' ? ' filetype:audio' : kind === 'video' ? ' filetype:video' : '';
  const p = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    generator: 'search', gsrsearch: query + ft, gsrnamespace: '6', gsrlimit: '12',
    prop: 'imageinfo|videoinfo', iiprop: 'url|mime|size|mediatype|extmetadata', iiurlwidth: '960',
    iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription|ObjectName', viprop: 'size|derivatives'
  });
  const r = await polite(() => http(`${API}?${p}`, { api: true }));
  if (!r.ok) throw new Error(`Commons search ${r.status}`);
  const j = await r.json();
  return (j.query?.pages || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(pg => toCandidate(pg, kind)).filter(Boolean);
}

// Downloads a small picture of the candidate (the image itself, or a video frame) so the model can look at it.
async function loadVision(c) {
  if (!c.thumb) return null;
  try {
    const r = await limited(() => http(c.thumb));
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok || !/^image\/(jpeg|png|gif|webp)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 3.5e6 ? null : { type, b64: buf.toString('base64') };
  } catch { return null; }
}

/** Up to `max` usable candidates for one media plan ({type, searches}), each with a picture when it has one. */
export async function findMedia(plan, max = plan.type === 'audio' ? 5 : 3) {
  const out = [], seen = new Set();
  for (const s of (plan.searches || []).slice(0, 3)) {
    let list = [];
    try { list = await searchCommons(s, plan.type); } catch { continue; }
    for (const c of list) {
      if (seen.has(c.url) || !isFreeLicense(c.license)) continue;
      seen.add(c.url); out.push(c);
      if (out.length >= max) break;
    }
    if (out.length >= max) break;
  }
  for (const c of out) c.vision = await loadVision(c);
  return out.filter(c => c.kind === 'audio' || c.vision);
}

/** The final URL answers and serves the right kind of file (what the game's player will request). */
export async function isPlayable(c) {
  try {
    const r = await limited(() => http(c.url, { range: 'bytes=0-4095' }));
    await r.body?.cancel();
    const type = r.headers.get('content-type') || '';
    const want = { image: /^image\//, audio: /^audio\//, video: /^video\// }[c.kind];
    return (r.status === 200 || r.status === 206) && want.test(type);
  } catch { return false; }
}

export const visionBlock = c => (c?.vision ? [{ type: 'image', source: { type: 'base64', media_type: c.vision.type, data: c.vision.b64 } }] : []);

export function describe(c) {
  if (!c) return 'none';
  const kind = { image: 'image', audio: 'audio clip', video: 'video clip' }[c.kind];
  return `${kind} "${c.title}"${c.description ? ` — ${c.description}` : ''}${c.duration ? ` (${Math.round(c.duration)}s)` : ''}`;
}
