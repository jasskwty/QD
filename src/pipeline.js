// One category: generate candidates, run them through the 20 stages, keep the best survivors per level.
import { CFG, LEVELS, SECTORS } from './config.js';
import { GENERATE } from './prompts.js';
import { STAGES } from './stages.js';

const MEDIA = {
  type: 'object', additionalProperties: false, required: ['type', 'intent', 'searches'],
  properties: {
    type: { type: 'string', enum: ['image', 'audio', 'video'] },
    intent: { type: 'string', description: 'What the file should show or sound like.' },
    searches: { type: 'array', items: { type: 'string' }, description: '2-3 Wikimedia Commons search queries in English, most specific first.' }
  }
};
const GEN_TOOL = {
  name: 'submit_questions',
  description: 'Submit the new questions for this category, or supported=false with the reason.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['supported', 'reason', 'questions'],
    properties: {
      supported: { type: 'boolean' },
      reason: { type: 'string', description: 'Arabic. Why the category is not supported; empty when it is.' },
      questions: { type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['pts', 'q', 'a', 'alts', 'media_dependent', 'q_media', 'a_media', 'fact'],
        properties: {
          pts: { type: 'integer', enum: LEVELS },
          q: { type: 'string', description: 'The question in Arabic, ending with ؟' },
          a: { type: 'string', description: 'The short answer in Arabic.' },
          alts: { type: 'array', items: { type: 'string' }, description: 'Other accepted ways to write the same answer.' },
          media_dependent: { type: 'boolean' },
          q_media: MEDIA, a_media: MEDIA,
          fact: { type: 'string', description: 'One line: the fact behind the answer and where it is documented.' }
        }
      } }
    }
  }
};

function checkGen(input) {
  if (typeof input?.supported !== 'boolean' || !Array.isArray(input.questions)) return 'needs supported (boolean) and questions (array)';
  for (const [i, x] of input.questions.entries()) {
    if (!LEVELS.includes(x?.pts)) return `question ${i}: pts must be 200, 400 or 600`;
    if (typeof x.q !== 'string' || typeof x.a !== 'string' || !Array.isArray(x.alts)) return `question ${i}: q, a (strings) and alts (array) are required`;
    for (const m of [x.q_media, x.a_media]) {
      if (!['image', 'audio', 'video'].includes(m?.type) || !Array.isArray(m.searches) || !m.searches.some(s => typeof s === 'string' && s.trim()))
        return `question ${i}: q_media and a_media need a type and at least one search query`;
    }
  }
  return null;
}

async function generate(cat, want, existing, rejected, deps) {
  const ask = LEVELS.filter(p => want[p]).map(p => `${p} points × ${want[p]}`).join(', ');
  const lines = [
    `Category: ${cat.name} (sector: ${SECTORS[cat.sector] ?? SECTORS[0]})` +
      (cat.media ? '\nThis is a picture/sound category: questions should be media_dependent (recognise the picture or sound).' : ''),
    `Write these new questions: ${ask}.`
  ];
  if (existing.length) lines.push('Existing questions in this category (do not repeat or rephrase them):', ...existing.slice(0, 150).map(x => `- ${x.q.slice(0, 140)}`));
  if (rejected.length) lines.push('Questions rejected earlier in this run, with the reason (learn from them, do not resubmit):',
    ...rejected.slice(-40).map(x => `- ${x.q.slice(0, 140)} → ${x.failed.title}: ${x.failed.reason}`));
  return deps.ask({ stage: 'generate', system: GENERATE, tool: GEN_TOOL, validate: checkGen, content: lines.join('\n') });
}

/**
 * need: {200: n, 400: n, 600: n}. Returns {accepted, rejected, skipped}.
 * deps: {ask, findMedia, playable, log}; `existing` are the category's current questions ({q, a}).
 */
export async function produceCategory(cat, need, existing, deps) {
  const accepted = [], rejected = [];
  const have = p => accepted.filter(x => x.pts === p).length;
  for (let round = 0; round < CFG.rounds; round++) {
    const want = Object.fromEntries(LEVELS.map(p => [p, Math.max(0, (need[p] || 0) - have(p)) * CFG.candidates]));
    if (!LEVELS.some(p => want[p])) break;
    const gen = await generate(cat, want, [...existing, ...accepted], rejected, deps);
    if (!gen.supported) return { accepted, rejected, skipped: gen.reason || 'غير مدعومة' };
    const cap = { ...want };
    const items = gen.questions
      .filter(x => cap[x.pts]-- > 0)
      .map((x, i) => ({ ...x, q: x.q.trim(), a: x.a.trim(), alts: x.alts.filter(s => typeof s === 'string' && s.trim()),
        id: `r${round}q${i}`, passed: [], notes: {} }));
    const ctx = { cat, existing: [...existing, ...accepted], ask: deps.ask, findMedia: deps.findMedia, playable: deps.playable };
    for (const st of STAGES) {
      const alive = items.filter(x => !x.failed);
      if (!alive.length) break;
      await st.run(alive, ctx);
      deps.log?.(`${cat.name} · ${st.n}. ${st.title}: ${alive.filter(x => !x.failed).length}/${alive.length}`);
    }
    for (const x of items) if (x.failed) rejected.push(x);
    for (const p of LEVELS) {
      const ok = items.filter(x => !x.failed && x.pts === p && x.passed.length === STAGES.length).sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0));
      accepted.push(...ok.slice(0, Math.max(0, (need[p] || 0) - have(p))));
    }
  }
  return { accepted, rejected, skipped: null };
}
