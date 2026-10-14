// Bulk builder: Wikidata facts → Arabic quiz questions with Commons media, each checked automatically before it is kept.
import { createHash } from 'node:crypto';
import { TEMPLATES, EXCLUDE } from './templates.js';
import { sparql, fileTitle, commonsFiles, intros } from './wikidata.js';
import { formatProblem } from './run.js';
import { leaksAnswer, norm, words } from './text.js';

const qid = u => String(u || '').replace('http://www.wikidata.org/entity/', '');
const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 10);

export function queryFor(t) {
  const ex = EXCLUDE.map(q => 'wd:' + q).join(', ');
  const vars = ['?s', '?a', '?s_ar', '?s_en', '?pop', '?qm', '?am', '?s_arw', '?s_enw', ...(t.literal ? [] : ['?a_ar', '?a_en']), ...(t.vars || []).map(v => '?' + v)];
  return `SELECT DISTINCT ${vars.join(' ')} WHERE {
  ${t.where}
  ?s wikibase:sitelinks ?pop. ${t.minPop ? `FILTER(?pop >= ${t.minPop})` : ''}
  FILTER(?s NOT IN (${ex}))
  ?s rdfs:label ?s_ar. FILTER(LANG(?s_ar) = "ar")
  ${t.literal ? '' : '?a rdfs:label ?a_ar. FILTER(LANG(?a_ar) = "ar") OPTIONAL { ?a rdfs:label ?a_en. FILTER(LANG(?a_en) = "en") }'}
  OPTIONAL { ?s rdfs:label ?s_en. FILTER(LANG(?s_en) = "en") }
  ${t.qm ? `OPTIONAL { ${t.qm} }` : ''}
  ${t.am ? `OPTIONAL { ${t.am} }` : ''}
  OPTIONAL { ?s_arwp schema:about ?s; schema:isPartOf <https://ar.wikipedia.org/>; schema:name ?s_arw. }
  OPTIONAL { ?s_enwp schema:about ?s; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?s_enw. }
}`;
}

// An Arabic label a host can read: Arabic letters, no Latin, no brackets or punctuation, not too long.
const arabicOk = s => !!s && /[؀-ۿ]/.test(s) && !/[A-Za-z()[\]{}\/\\,،;؛"«»:|]/.test(s) && s.length <= 45 && !/^Q\d+$/.test(s);

// The needle (answer) appears in the text: whole number, case-sensitive code (Fe, DXB), or normalised Arabic/English words.
export function mentions(text, needle) {
  if (!text || !needle) return false;
  const t = String(text).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  if (/^\d+$/.test(needle)) return new RegExp(`(?<!\\d)${needle}(?!\\d)`).test(t);
  if (/^[A-Z][A-Za-z]{0,2}$/.test(needle)) return new RegExp(`(?<![A-Za-z])${needle}(?![a-z])`).test(t);
  const n = words(needle).join(' ');
  return !!n && (' ' + words(t).join(' ') + ' ').includes(' ' + n + ' ');
}

/** Runs every template; returns {questions, report}. `log` gets progress lines. */
export async function build({ cacheDir, only = [], log = () => {} }) {
  const report = {}, kept = [];
  const drop = (t, why) => { (report[t.key] ??= { rows: 0, kept: 0, dropped: {} }).dropped[why] = (report[t.key].dropped[why] || 0) + 1; };

  /* 1. facts */
  const items = [];
  for (const t of TEMPLATES.filter(t => !only.length || only.includes(t.key))) {
    const query = queryFor(t);
    let rows;
    try { rows = await sparql(query, cacheDir, `${t.key}-${hash(query)}`); }
    catch (e) { log(`${t.key}: query failed (${e.message.slice(0, 120)})`); report[t.key] = { rows: 0, kept: 0, dropped: { 'query failed': 1 } }; continue; }
    report[t.key] = { rows: rows.length, kept: 0, dropped: {} };
    const groups = new Map();
    for (const r of rows) {
      const x = { ...r, s: qid(r.s), a: t.literal ? r.a : qid(r.a) };
      for (const v of t.vars || []) x[v] = qid(r[v]);
      const id = x.s + (t.key2 ? ':' + t.key2(x) : '');
      const g = groups.get(id) || { x, answers: new Set(), qFiles: [], aFiles: [] };
      g.answers.add(x.a);
      if (r.qm && !g.qFiles.includes(fileTitle(r.qm))) g.qFiles.push(fileTitle(r.qm));
      if (r.am && !g.aFiles.includes(fileTitle(r.am))) g.aFiles.push(fileTitle(r.am));
      groups.set(id, g);
    }
    for (const [id, g] of groups) {
      // A disputed place lists an excluded country among its answers: drop it, don't let the filter make it look settled.
      if ([...g.answers].some(a => EXCLUDE.includes(a))) { drop(t, 'disputed'); continue; }
      if (g.answers.size > 1) { drop(t, 'more than one answer'); continue; }
      const x = g.x;
      if (t.skip?.(x)) { drop(t, 'excluded by template'); continue; }
      const cat = typeof t.cat === 'function' ? t.cat(x) : t.cat;
      if (!cat) { drop(t, 'no category'); continue; }
      const answer = t.answer ? t.answer(x) : t.literal ? String(x.a) : t.dependent ? x.s_ar : x.a_ar;
      if (t.dependent ? !arabicOk(x.s_ar) : !arabicOk(x.s_ar) || (!t.literal && !arabicOk(answer))) { drop(t, 'label not clean Arabic'); continue; }
      if (t.latin ? !/^[A-Z][A-Za-z]{0,2}$/.test(answer) : t.literal && !/^\d{1,4}$/.test(answer)) { drop(t, 'odd literal'); continue; }
      const q = t.q(x);
      if (!q) { drop(t, 'wording'); continue; }
      const alts = [...new Set([!t.literal && x.a_en, t.dependent && x.s_en].filter(v => v && v !== answer))];
      items.push({ t, id, key: `${t.key}:${id}`, cat, q, a: answer, alts, x, pop: Number(x.pop) || 0, qFiles: t.qmFile ? [t.qmFile] : g.qFiles, aFiles: g.aFiles });
    }
    log(`${t.key}: ${rows.length} rows → ${items.filter(i => i.t === t).length} candidates`);
  }

  /* 2. ambiguity: the same Arabic name for two different things makes the question (or its answer) ambiguous */
  const byName = new Map();
  for (const it of items) { const k = `${it.t.key}|${norm(it.t.dependent ? it.a : it.x.s_ar)}|${it.t.key2 ? it.t.key2(it.x) : ''}`; byName.set(k, [...(byName.get(k) || []), it]); }
  const unambiguous = [];
  for (const [, list] of byName) {
    if (list.length === 1) unambiguous.push(list[0]);
    else if (list[0].t.dependent) unambiguous.push(list.sort((a, b) => b.pop - a.pop)[0]), list.slice(1).forEach(it => drop(it.t, 'same answer twice'));
    else list.forEach(it => drop(it.t, 'same name, different things'));
  }

  /* 3. text checks */
  const textOk = unambiguous.filter(it => {
    const enLeak = !it.t.dependent && it.x.a_en && it.x.s_en && mentions(it.x.s_en, it.x.a_en);   // «مطار تشانجيانغ» → «زانجيانغ»
    const p = formatProblem({ ...it, pts: 200 }) || ([it.a, ...it.alts].some(a => leaksAnswer(it.q, a)) && 'answer in question') || (enLeak && 'answer in the English name');
    if (p) drop(it.t, p);
    return !p;
  });

  /* 4. second source: the subject's Wikipedia intro (Arabic or English) states the answer */
  const toCheck = textOk.filter(it => it.t.verify !== false);
  log(`checking ${toCheck.length} facts against Wikipedia…`);
  const needles = it => (it.t.needles ? it.t.needles(it.x) : [it.a, ...it.alts]);
  const ar = await intros('ar', toCheck.map(it => it.x.s_arw).filter(Boolean), cacheDir);
  const arOk = new Set(toCheck.filter(it => needles(it).some(n => mentions(ar.get(it.x.s_arw), n))));
  log(`${arOk.size} confirmed by Arabic Wikipedia; checking the rest in English…`);
  const en = await intros('en', toCheck.filter(it => !arOk.has(it)).map(it => it.x.s_enw).filter(Boolean), cacheDir);
  const verified = textOk.filter(it => {
    if (it.t.verify === false) return true;
    const ok = arOk.has(it) || needles(it).some(n => mentions(en.get(it.x.s_enw), n));
    if (!ok) drop(it.t, 'Wikipedia intro does not state the answer');
    return ok;
  });

  /* 5. media: free license, real file of the right kind; every question and every answer gets one */
  log(`looking up media for ${verified.length} questions…`);
  const kindOf = (it, role) => (role === 'q' && it.t.qKind === 'audio' ? 'audio' : 'image');
  const files = { image: new Set(), audio: new Set() };
  for (const it of verified) { it.qFiles.forEach(f => files[kindOf(it, 'q')].add(f)); it.aFiles.forEach(f => files.image.add(f)); }
  const info = new Map([...(await commonsFiles([...files.image], 'image', cacheDir)), ...(await commonsFiles([...files.audio], 'audio', cacheDir))]);
  const first = list => list.map(f => info.get(f)).find(c => c && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(c.url));
  for (const it of verified) {
    const m = first(it.qFiles);
    let am = first(it.aFiles) || (it.t.sameOk ? m : null);
    if (!m || !am) { drop(it.t, 'no free media'); continue; }
    if (m.url === am.url && !it.t.sameOk) { drop(it.t, 'same media for question and answer'); continue; }
    kept.push({ ...it, m, am });
  }

  /* 6. difficulty: within each template and category, the most famous third is 200, then 400, then 600 */
  const groups = new Map();
  for (const it of kept) { const k = `${it.t.key}|${it.cat}`; groups.set(k, [...(groups.get(k) || []), it]); }
  for (const list of groups.values()) {
    list.sort((a, b) => b.pop - a.pop).forEach((it, i) => { it.pts = i < list.length / 3 ? 200 : i < (2 * list.length) / 3 ? 400 : 600; });
  }

  /* 7. no repeated question text across templates (media-dependent ones repeat the text on purpose) */
  const seen = new Set(), out = [];
  for (const it of kept.sort((a, b) => b.pop - a.pop)) {
    const k = it.t.dependent ? it.key : norm(it.q);
    if (seen.has(k)) { drop(it.t, 'repeated question'); continue; }
    seen.add(k);
    report[it.t.key].kept++;
    out.push({
      key: it.key, cat: it.cat, pts: it.pts, q: it.q, a: it.a, alts: it.alts, media_dependent: !!it.t.dependent, pop: it.pop,
      m: pick(it.m), am: pick(it.am),
      sources: [`https://www.wikidata.org/wiki/${it.x.s}`, it.x.s_arw && `https://ar.wikipedia.org/wiki/${encodeURIComponent(it.x.s_arw)}`, it.x.s_enw && `https://en.wikipedia.org/wiki/${encodeURIComponent(it.x.s_enw)}`].filter(Boolean)
    });
  }
  return { questions: out.sort((a, b) => a.cat - b.cat || a.pts - b.pts || b.pop - a.pop), report };
}
const pick = c => ({ kind: c.kind, url: c.url, title: c.title, page: c.page, license: c.license, artist: c.artist || '' });
