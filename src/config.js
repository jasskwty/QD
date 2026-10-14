// Settings; each can be overridden with an environment variable or a command-line flag of tools/q.js.
const env = (k, d) => (process.env[k] ?? '') === '' ? d : process.env[k];
const num = (k, d) => { const v = Number(env(k, d)); return Number.isFinite(v) ? v : d; };

export const CFG = {
  perRun: num('QGEN_PER_RUN', 12),                // questions added per run
  perLevel: num('QGEN_PER_LEVEL', 2),             // per category per level (200/400/600) in one run → 6 per category
  minConfidence: num('QGEN_MIN_CONFIDENCE', 98),  // final judge confidence needed to publish (0-100)
  workDir: env('QGEN_WORK', 'work')
};

export const LEVELS = [200, 400, 600];

// Same list as the site's catalog.js.
export const SECTORS = ['أخرى', 'خليجي وتراث', 'رياضة', 'فنون وسينما', 'ألغاز بصرية وسمعية', 'علوم وتقنية',
  'جغرافيا', 'تاريخ واقتصاد', 'إسلامي', 'ألعاب فيديو', 'أدب ونمط حياة'];

// The 20 stages, in order. "code" stages are run by tools/q.js itself; the others are recorded with `q.js verdict`.
export const STAGES = [
  { n: 1, by: 'code', title: 'شكل السؤال والإجابة' },
  { n: 2, by: 'code', title: 'الإجابة مو مكتوبة في السؤال' },
  { n: 3, by: 'code', title: 'مو مكرر' },
  { n: 4, by: 'model', title: 'سلامة اللغة والصياغة' },
  { n: 5, by: 'model', title: 'يناسب الفئة' },
  { n: 6, by: 'model', title: 'الصعوبة تناسب النقاط' },
  { n: 7, by: 'model', title: 'إجابة وحدة بس' },
  { n: 8, by: 'model', title: 'ما يتغير مع الوقت' },
  { n: 9, by: 'model', title: 'يناسب الجمهور وسياسة الموقع' },
  { n: 10, by: 'model', title: 'اختيار الصورة أو الصوت أو المقطع' },
  { n: 11, by: 'code', title: 'رخصة الوسائط حرة والرابط يشتغل' },
  { n: 12, by: 'model', title: 'وسائط السؤال مناسبة وما تكشف الإجابة' },
  { n: 13, by: 'model', title: 'وسائط الإجابة تطابق الإجابة' },
  { n: 14, by: 'blind', title: 'إجابة مستقلة بدون بحث' },
  { n: 15, by: 'model', title: 'مصدرين موثوقين مستقلين على الأقل' },
  { n: 16, by: 'model', title: 'البحث عن أي مصدر يناقض الإجابة' },
  { n: 17, by: 'blind', title: 'بحث مستقل يوصل لنفس الإجابة' },
  { n: 18, by: 'model', title: 'دقة الأسماء والأرقام والتواريخ' },
  { n: 19, by: 'judge', title: 'مراجعة عكسية (اعتراض VAR)' },
  { n: 20, by: 'judge', title: 'الحكم النهائي' }
];
