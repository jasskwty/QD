// Every setting can be overridden with an environment variable (GitHub: Settings → Secrets and variables → Actions → Variables).
const env = (k, d) => (process.env[k] ?? '') === '' ? d : process.env[k];
const num = (k, d) => { const v = Number(env(k, d)); return Number.isFinite(v) ? v : d; };

export const CFG = {
  model: env('QGEN_MODEL', 'claude-opus-5-5'),
  effort: env('QGEN_EFFORT', 'high'),             // effort for generation and the verification stages
  finalEffort: env('QGEN_FINAL_EFFORT', 'max'),   // effort for the last stage (final judge)
  perRun: num('QGEN_PER_RUN', 54),                // questions added per run (the workflow runs every hour)
  perLevel: num('QGEN_PER_LEVEL', 2),             // per category per level (200/400/600) in one run → 6 per category
  candidates: num('QGEN_CANDIDATES', 2),          // candidates generated for every question still needed
  rounds: num('QGEN_ROUNDS', 2),                  // generation rounds per category when candidates fail
  concurrency: num('QGEN_CONCURRENCY', 4),        // categories worked on at the same time
  maxCategories: num('QGEN_MAX_CATEGORIES', 27),  // categories tried per run at most
  minConfidence: num('QGEN_MIN_CONFIDENCE', 98),  // final judge confidence needed to publish (0-100)
  maxUsd: num('QGEN_MAX_USD', 60),                // the run stops starting new model calls after this spend
  deadlineMin: num('QGEN_DEADLINE_MIN', 45),      // no new category starts after this many minutes
  dryRun: env('QGEN_DRY_RUN', '') === '1' || env('QGEN_DRY_RUN', '') === 'true',
  only: env('QGEN_CATEGORIES', '').split(',').map(s => s.trim()).filter(Boolean),
  outDir: env('QGEN_OUT', 'out')
};

export const LEVELS = [200, 400, 600];

// Same list as the site's catalog.js.
export const SECTORS = ['أخرى', 'خليجي وتراث', 'رياضة', 'فنون وسينما', 'ألغاز بصرية وسمعية', 'علوم وتقنية',
  'جغرافيا', 'تاريخ واقتصاد', 'إسلامي', 'ألعاب فيديو', 'أدب ونمط حياة'];

// USD per million tokens. Cache write = 1.25x input (5-minute cache).
export const PRICES = {
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }
};
export const WEB_SEARCH_USD = 10 / 1000;
