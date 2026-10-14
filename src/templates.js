// Question templates over Wikidata. Each one: a SPARQL pattern binding ?s (what the question is about) and ?a (the answer,
// an item or a literal), the site category it fills (c201 = عواصم الدول, numbers from the site's catalog.js), the Arabic
// wording, and where the question and answer media come from (Wikidata image properties, or a fixed Commons file).
//
// SPARQL variables: ?s ?a, optional ?qm ?am (media files), plus any extras a template lists in `vars`.
// Labels, popularity (?pop = number of Wikipedia languages) and Wikipedia titles are added by the builder.

// Places whose status is disputed or that the audience won't accept as a quiz answer: never asked about, never an answer.
export const EXCLUDE = ['Q801', 'Q865', 'Q1246', 'Q40362', 'Q6250', 'Q23681', 'Q23427', 'Q23334', 'Q907112', 'Q34754'];

const SOVEREIGN = '?s wdt:P31 wd:Q3624078. FILTER NOT EXISTS { ?s wdt:P576 [] }';
const noEnd = p => `FILTER NOT EXISTS { ?s p:${p} [ps:${p} ?a; pq:P582 []] }`;
const FLAG_S = '?s wdt:P41 ?qm', FLAG_A = '?a wdt:P41 ?am', IMG_S = '?s wdt:P18 ?qm', IMG_A = '?a wdt:P18 ?am';

// Arabic helpers: add a word the label may already start with; "للحديد" from "حديد"; drop a leading "ال".
const pre = (w, x) => (x.startsWith(w) ? x : `${w} ${x}`);
const lil = x => 'لل' + x.replace(/^ال/, '');
const NOBEL = { Q38104: 'الفيزياء', Q44585: 'الكيمياء', Q80061: 'الطب', Q37922: 'الأدب', Q35637: 'السلام', Q47170: 'الاقتصاد' };
const nobelPrize = q => (q === 'Q35637' ? 'جائزة نوبل للسلام' : `جائزة نوبل في ${NOBEL[q]}`);
const she = x => x.g === 'Q6581072';

export const TEMPLATES = [
  /* ---------- countries ---------- */
  { key: 'capital', cat: 201, where: `${SOVEREIGN} ?s wdt:P36 ?a. ${noEnd('P36')} FILTER(?s != wd:Q219060)`,
    q: x => `ما عاصمة ${x.s_ar}؟`, qm: FLAG_S, am: IMG_A },
  { key: 'flag', cat: 202, where: `${SOVEREIGN} BIND(?s AS ?a)`, dependent: true, verify: false,
    q: () => 'لأي دولة هذا العلم؟', qm: FLAG_S, am: '?s wdt:P242 ?am' },
  { key: 'currency', cat: 204, where: `${SOVEREIGN} ?s wdt:P38 ?a. ${noEnd('P38')}`,
    q: x => `ما عملة ${x.s_ar}؟`, qm: FLAG_S, am: IMG_A, sameOk: false },
  { key: 'language', cat: 205, where: `${SOVEREIGN} ?s wdt:P37 ?a. ${noEnd('P37')}`,
    q: x => `ما اللغة الرسمية في ${x.s_ar}؟`, qm: FLAG_S, am: '{ ?a wdt:P1846 ?am } UNION { ?a wdt:P18 ?am }' },
  { key: 'continent', cat: 213, where: `${SOVEREIGN} ?s wdt:P30 ?a.`,
    q: x => `في أي قارة تقع ${x.s_ar}؟`, qm: FLAG_S, am: '?s wdt:P242 ?am' },
  { key: 'capital-of', vars: ['arab', 'cont'],
    where: '?a wdt:P31 wd:Q3624078; wdt:P36 ?s. FILTER NOT EXISTS { ?a wdt:P576 [] } FILTER NOT EXISTS { ?a p:P36 [ps:P36 ?s; pq:P582 []] } ' +
      'OPTIONAL { ?a wdt:P463 ?arab. FILTER(?arab = wd:Q7172) } OPTIONAL { ?a wdt:P30 ?cont }',
    cat: x => (x.arab ? 231 : x.cont === 'Q15' ? 229 : x.cont === 'Q48' ? 230 : null),
    q: x => `ما الدولة التي عاصمتها ${x.s_ar}؟`, qm: IMG_S, am: FLAG_A },

  /* ---------- regions ---------- */
  { key: 'us-state-capital', cat: 226, where: '?s wdt:P31 wd:Q35657; wdt:P36 ?a.', q: x => `ما عاصمة ${pre('ولاية', x.s_ar)}؟`, qm: '?s wdt:P242 ?qm', am: IMG_A },
  { key: 'saudi-region-seat', cat: 225, where: '?s wdt:P31 wd:Q15728204; wdt:P36 ?a.', q: x => `ما مقر إمارة ${pre('منطقة', x.s_ar)}؟`, qm: '?s wdt:P242 ?qm', am: IMG_A },
  { key: 'canada-capital', cat: 227, where: 'VALUES ?t { wd:Q11828004 wd:Q9357527 } ?s wdt:P31 ?t; wdt:P36 ?a.', q: x => `ما عاصمة ${x.s_ar}؟`, qm: FLAG_S, am: IMG_A },

  /* ---------- places → country ---------- */
  { key: 'heritage-country', minPop: 10, vars: [], where: '?s wdt:P1435 wd:Q9259; wdt:P17 ?a.',
    cat: x => (x.pop >= 60 ? 207 : 240), q: x => `في أي دولة يقع موقع «${x.s_ar}»؟`, qm: IMG_S, am: FLAG_A },
  { key: 'landmark-name', minPop: 70, where: '?s wdt:P1435 wd:Q9259. BIND(?s AS ?a)', cat: 208, dependent: true, verify: false,
    q: () => 'ما اسم هذا المعلم؟', qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true },
  { key: 'city-country', minPop: 25, vars: ['cont'], where: '?s wdt:P31/wdt:P279* wd:Q515; wdt:P17 ?a; wdt:P1082 ?n. FILTER(?n > 300000) OPTIONAL { ?a wdt:P30 ?cont }',
    cat: x => (x.cont === 'Q46' ? 228 : x.pop >= 60 ? 220 : 206), q: x => `في أي دولة توجد ${pre('مدينة', x.s_ar)}؟`, qm: IMG_S, am: FLAG_A },
  { key: 'mountain-country', minPop: 10, vars: ['h'], where: '?s wdt:P31 wd:Q8502; wdt:P17 ?a; wdt:P2044 ?h. FILTER(?h > 2000)',
    cat: x => (Number(x.h) > 6000 ? 216 : 211), q: x => `في أي دولة يقع ${/^(جبل|قمة|بركان)/.test(x.s_ar) ? x.s_ar : pre('جبل', x.s_ar)}؟`, qm: IMG_S, am: FLAG_A },
  { key: 'island-country', minPop: 15, where: '?s wdt:P31 wd:Q23442; wdt:P17 ?a.', cat: 212, q: x => `إلى أي دولة تتبع ${pre('جزيرة', x.s_ar)}؟`, qm: IMG_S, am: FLAG_A },
  { key: 'lake-country', minPop: 15, where: '?s wdt:P31 wd:Q23397; wdt:P17 ?a.', cat: 218, q: x => `في أي دولة توجد ${pre('بحيرة', x.s_ar)}؟`, qm: IMG_S, am: FLAG_A },
  { key: 'park-country', minPop: 15, where: '?s wdt:P31 wd:Q46169; wdt:P17 ?a.', cat: 233, q: x => `في أي دولة توجد «${x.s_ar}»؟`, qm: IMG_S, am: FLAG_A },
  { key: 'volcano-country', minPop: 15, where: '?s wdt:P31 wd:Q8072; wdt:P17 ?a.', cat: 188, q: x => `في أي دولة يقع ${pre('بركان', x.s_ar)}؟`, qm: IMG_S, am: FLAG_A },
  { key: 'cave-country', minPop: 8, where: '?s wdt:P31 wd:Q35509; wdt:P17 ?a.', cat: 234, q: x => `في أي دولة يوجد «${x.s_ar}»؟`, qm: IMG_S, am: FLAG_A },
  { key: 'desert-country', minPop: 10, where: '?s wdt:P31 wd:Q8514; wdt:P17 ?a.', cat: 235, q: x => `في أي دولة توجد «${x.s_ar}»؟`, qm: IMG_S, am: FLAG_A },
  { key: 'stadium-country', minPop: 10, where: '?s wdt:P1083 ?cap; wdt:P17 ?a. FILTER(?cap >= 40000) ?s wdt:P31/wdt:P279* wd:Q483110.', cat: 66,
    q: x => `في أي دولة يقع ${pre('ملعب', x.s_ar)}؟`, qm: IMG_S, am: FLAG_A },
  { key: 'circuit-country', minPop: 10, where: '?s wdt:P31 wd:Q2338524; wdt:P17 ?a.', cat: 61, q: x => `في أي دولة تقع ${pre('حلبة', x.s_ar)}؟`, qm: IMG_S, am: FLAG_A },
  { key: 'river-mouth', minPop: 15, vars: ['len'], where: '?s wdt:P31 wd:Q4022; wdt:P403 ?a. OPTIONAL { ?s wdt:P2043 ?len }',
    cat: x => (Number(x.len) > 1500 ? 217 : 209), q: x => `أين يصب ${pre('نهر', x.s_ar)}؟`, qm: IMG_S, am: IMG_A },

  /* ---------- airports ---------- */
  { key: 'airport-iata', minPop: 15, literal: true, latin: true, where: '?s wdt:P31/wdt:P279* wd:Q1248784; wdt:P238 ?a. FILTER(REGEX(?a, "^[A-Z]{3}$"))', cat: 222,
    q: x => (x.s_ar.startsWith('مطار') ? `ما رمز IATA الخاص ب${x.s_ar}؟` : null), qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true },
  { key: 'airport-city', minPop: 15, where: '?s wdt:P31/wdt:P279* wd:Q1248784; wdt:P931 ?a.', cat: 221,
    q: x => (x.s_ar.startsWith('مطار') ? `في أي مدينة يقع ${x.s_ar}؟` : null), qm: IMG_S, am: IMG_A },

  /* ---------- science ---------- */
  { key: 'element-symbol', literal: true, latin: true, where: '?s wdt:P31 wd:Q11344; wdt:P246 ?a.', cat: 172,
    q: x => `ما الرمز الكيميائي ${lil(x.s_ar)}؟`, qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true },
  { key: 'element-from-symbol', vars: ['sym'], where: '?s wdt:P31 wd:Q11344; wdt:P246 ?sym. BIND(?s AS ?a)', cat: 172, needles: x => [x.sym],
    q: x => `ما العنصر الكيميائي الذي رمزه ${x.sym}؟`, qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true },
  { key: 'element-number', literal: true, where: '?s wdt:P31 wd:Q11344; wdt:P1086 ?a.', cat: 172,
    q: x => `ما العدد الذري ${lil(x.s_ar)}؟`, qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true },
  { key: 'moon-planet', minPop: 15, where: '?s wdt:P31/wdt:P279* wd:Q2537; wdt:P397 ?a. ?a wdt:P31/wdt:P279* wd:Q634.', cat: 184, q: x => `حول أي كوكب يدور ${pre('القمر', x.s_ar)}؟`, qm: IMG_S, am: IMG_A },
  ...[['Q7377', 60], ['Q5113', 90], ['Q10811', 50], ['Q10908', 50], ['Q1390', 60], ['Q127282', 60], ['Q7372', 60]].map(([cls, min]) => ({
    key: `animal-${cls}`, minPop: min, where: `?s wdt:P105 wd:Q7432; wdt:P171+ wd:${cls}. FILTER NOT EXISTS { ?s wdt:P171+ wd:Q7375 } ${cls === 'Q10811' ? 'FILTER NOT EXISTS { ?s wdt:P171+ wd:Q5113 }' : ''} BIND(?s AS ?a)`,
    cat: 180, dependent: true, verify: false, q: () => 'ما اسم هذا الحيوان؟', qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true })),
  { key: 'animal-sound', minPop: 50, where: '?s wdt:P51 ?qm; wdt:P105 wd:Q7432. FILTER NOT EXISTS { ?s wdt:P171+ wd:Q7375 } BIND(?s AS ?a)', cat: 129,
    dependent: true, verify: false, qKind: 'audio', q: () => 'ما الحيوان صاحب هذا الصوت؟', am: '?s wdt:P18 ?am' },
  { key: 'dog-breed', minPop: 20, where: '?s wdt:P31 wd:Q39367. BIND(?s AS ?a)', cat: 396, dependent: true, verify: false,
    q: () => 'ما اسم سلالة الكلاب هذه؟', qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true },
  { key: 'cat-breed', minPop: 15, where: '?s wdt:P31 wd:Q43577. BIND(?s AS ?a)', cat: 396, dependent: true, verify: false,
    q: () => 'ما اسم سلالة القطط هذه؟', qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true },
  { key: 'language-designer', minPop: 20, where: '?s wdt:P31 wd:Q9143; wdt:P287 ?a. ?a wdt:P31 wd:Q5.', cat: 164,
    q: x => `من مصمم لغة البرمجة ${x.s_ar}؟`, qm: '?s wdt:P154 ?qm', am: IMG_A },

  /* ---------- people and works ---------- */
  { key: 'nobel-field', vars: ['g'], where: `?s wdt:P31 wd:Q5; wdt:P166 ?a. VALUES ?a { ${Object.keys(NOBEL).map(q => 'wd:' + q).join(' ')} } OPTIONAL { ?s wdt:P21 ?g }`,
    cat: 376, answer: x => NOBEL[x.a], needles: x => [NOBEL[x.a]],
    q: x => `في أي مجال ${she(x) ? 'حصلت' : 'حصل'} ${x.s_ar} على جائزة نوبل؟`, qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true },
  { key: 'nobel-year', literal: true, vars: ['g', 'prize'], key2: x => x.prize, cat: 376,
    where: `?s wdt:P31 wd:Q5; p:P166 ?st. ?st ps:P166 ?prize; pq:P585 ?t. VALUES ?prize { ${Object.keys(NOBEL).map(q => 'wd:' + q).join(' ')} } BIND(STR(YEAR(?t)) AS ?a) OPTIONAL { ?s wdt:P21 ?g }`,
    q: x => `في أي سنة ${she(x) ? 'حصلت' : 'حصل'} ${x.s_ar} على ${nobelPrize(x.prize)}؟`, qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true },
  { key: 'work-author', minPop: 20, vars: ['t'], where: 'VALUES ?t { wd:Q8261 wd:Q7725634 wd:Q25379 wd:Q5185279 } ?s wdt:P31 ?t; wdt:P50 ?a. ?a wdt:P31 wd:Q5. ' +
      // never religious scripture (the Torah, Gospels…) or a prophet as an "author"
      'FILTER NOT EXISTS { ?s wdt:P31/wdt:P279* wd:Q179461 } FILTER NOT EXISTS { ?s wdt:P136/wdt:P279* wd:Q179461 } FILTER NOT EXISTS { ?a wdt:P106 wd:Q42857 }',
    cat: x => (x.t === 'Q8261' ? 375 : 382), q: x => `من مؤلف «${x.s_ar}»؟`, qm: IMG_S, am: IMG_A },
  { key: 'painting-painter', minPop: 8, where: '?s wdt:P31 wd:Q3305213; wdt:P170 ?a. ?a wdt:P31 wd:Q5.', cat: 117,
    q: x => `من رسم لوحة «${x.s_ar.replace(/^لوحة\s+/, '')}»؟`, qm: IMG_S, am: IMG_A },
  { key: 'us-president-n', vars: ['ord'], key2: x => x.ord, cat: 252, where: '?s p:P39 ?st. ?st ps:P39 wd:Q11696; pq:P1545 ?ord. BIND(?s AS ?a)',
    q: x => `من الرئيس رقم ${x.ord} للولايات المتحدة الأمريكية؟`, qmFile: 'File:Seal of the President of the United States.svg', am: '?s wdt:P18 ?am' },
  { key: 'us-president-order', literal: true, cat: 252, where: '?s p:P39 ?st. ?st ps:P39 wd:Q11696; pq:P1545 ?a.',
    q: x => `ما ترتيب ${x.s_ar} بين رؤساء الولايات المتحدة الأمريكية؟`, qm: IMG_S, am: '?s wdt:P18 ?am', sameOk: true },

  /* ---------- sport ---------- */
  { key: 'olympics-host', where: 'VALUES ?t { wd:Q159821 wd:Q82414 } ?s wdt:P31 ?t; wdt:P276 ?a. ?a wdt:P31/wdt:P279* wd:Q515.', cat: 62,
    q: x => `أي مدينة استضافت ${x.s_ar}؟`, qmFile: 'File:Olympic rings without rims.svg', am: IMG_A },
  { key: 'world-cup-winner', where: '?s wdt:P3450 wd:Q19317; wdt:P1346 ?team. ?team wdt:P1532 ?a.', cat: 77,
    q: x => `أي منتخب فاز ببطولة ${x.s_ar}؟`, qmFile: 'File:FIFA World Cup Trophy.svg', am: FLAG_A },
  { key: 'world-cup-host', where: '?s wdt:P3450 wd:Q19317; wdt:P17 ?a.', cat: 77,
    q: x => `أي دولة استضافت ${x.s_ar}؟`, qmFile: 'File:FIFA World Cup Trophy.svg', am: FLAG_A }
];

// Names of the site categories the templates fill (from the site's catalog.js).
export const CAT_NAMES = {
  61: 'فورمولا 1', 62: 'أبطال الأولمبياد', 66: 'ملاعب عالمية', 77: 'إحصائيات الفيفا', 117: 'الفن التشكيلي', 129: 'خمن الصوت',
  164: 'لغات البرمجة', 172: 'الكيمياء', 180: 'عالم الحيوان', 184: 'المجموعة الشمسية', 188: 'البراكين والزلازل',
  201: 'عواصم الدول', 202: 'أعلام الدول', 204: 'عملات الدول', 205: 'لغات العالم', 206: 'سياحة وسفر', 207: 'معالم عالمية',
  208: 'عجائب الدنيا', 209: 'أنهار العالم', 211: 'جبال وسهول', 212: 'جزر العالم', 213: 'قارات العالم', 216: 'أعلى القمم',
  217: 'أطول الأنهار', 218: 'أكبر البحيرات', 220: 'مدن سياحية', 221: 'مطارات دولية', 222: 'رموز المطارات', 225: 'مناطق السعودية',
  226: 'ولايات أمريكا', 227: 'مقاطعات كندا', 228: 'مدن أوروبية', 229: 'دول أفريقيا', 230: 'دول آسيا', 231: 'العالم العربي',
  233: 'محميات طبيعية', 234: 'الكهوف', 235: 'الصحاري', 240: 'مواقع التراث العالمي', 252: 'رؤساء أمريكا', 375: 'الروايات العالمية',
  376: 'الحائزون على نوبل', 382: 'كتاب وشعراء', 396: 'الحيوانات الأليفة'
};
