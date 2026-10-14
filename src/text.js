// Arabic-aware text helpers for the code-only checks (format, answer leak, duplicates, answer matching).

const DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

export function norm(s) {
  return String(s ?? '')
    .replace(/[ً-ٰٟـ]/g, '')          // tashkeel, superscript alef, tatweel
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩۰-۹]/g, d => DIGITS[d])
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Drops the Arabic definite article so "النيل" and "نيل" compare equal.
const stem = w => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w);
export const words = s => norm(s).split(' ').filter(Boolean).map(stem);

function grams(s) {
  const t = ' ' + words(s).join(' ') + ' ', g = new Set();
  for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3));
  return g;
}
export function similarity(a, b) {
  const x = grams(a), y = grams(b);
  if (!x.size || !y.size) return 0;
  let n = 0; for (const g of x) if (y.has(g)) n++;
  return (2 * n) / (x.size + y.size);
}

export function isDuplicate(item, others) {
  const a = words(item.a).join(' ');
  return others.some(o => {
    const s = similarity(item.q, o.q);
    return s >= 0.85 || (s >= 0.6 && a && a === words(o.a).join(' '));
  });
}

// True when the answer is written inside the question text.
export function leaksAnswer(q, a) {
  const aw = words(a), qw = ' ' + words(q).join(' ') + ' ';
  if (!aw.length) return false;
  const phrase = aw.join(' ');
  if (phrase.length < 3 && !/^\d+$/.test(phrase)) return false;
  return qw.includes(' ' + phrase + ' ');
}

// Cheap exact comparison; anything it can't confirm goes to the model's equivalence judge.
export function sameAnswer(given, official, alts = []) {
  const g = words(given).join(' ');
  if (!g) return false;
  return [official, ...alts].some(x => {
    const o = words(x).join(' ');
    if (!o) return false;
    if (g === o) return true;
    const gn = g.replace(/\s/g, ''), on = o.replace(/\s/g, '');
    return /^\d+$/.test(gn) && gn === on;
  });
}

export function stripHtml(s) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Registrable domain, near enough to tell independent sources apart (en.wikipedia.org and ar.wikipedia.org count once).
export function siteOf(url) {
  let h;
  try { h = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
  const p = h.split('.');
  if (p.length >= 3 && p.at(-1).length === 2 && /^(com|gov|org|edu|net|co|ac|mil|sch)$/.test(p.at(-2))) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
}
