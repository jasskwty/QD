// Office floor plan. Coordinates are world pixels.
export const WORLD = { w: 1700, h: 1100 };
export const SPAWN = { x: 1520, y: 560 };

export const LEADS = ['قائد الإنتاج', 'قائد مختبر المتعة', 'قائد الابتكار', 'قائد الموارد البشرية', 'قائد التسويق', 'مدرب المهارات', 'مدير الأعمال'];

const CELL_ROLES = ['محلل منافسين', 'كاتب أسئلة', 'باحث صور', 'مدقق حقائق', 'مراقب العمليات'];
const PLAYERS = ['بو فهد', 'أم سالم', 'عبدالله', 'نوف', 'بو يوسف', 'حمد', 'سارة', 'مشاري', 'دانة'];
const ANALYSTS = ['محلل 1', 'محلل 2', 'محلل 3', 'محلل 4', 'محلل 5'];
const n = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);

export const ZONES = [
  { id: 'ceo', kind: 'ceo', label: 'مكتب المدير التنفيذي', x: 1380, y: 40, w: 280, h: 220, color: 0x1e3a8a, agents: [] },
  { id: 'manager', kind: 'manager', label: 'مدير الأعمال (عند الباب)', x: 1380, y: 270, w: 280, h: 90, color: 0x2563eb, agents: ['مدير الأعمال'] },
  { id: 'board', kind: 'board', label: 'لوحة التقارير', x: 1380, y: 380, w: 280, h: 120, color: 0x334155, agents: [] },
  ...[0, 1, 2, 3].map((i) => ({
    id: `room_${i + 1}`, kind: 'room', label: `قاعة اجتماعات ${i + 1}`,
    x: 40 + i * 330, y: 40, w: 300, h: 220, color: 0x0f766e, agents: []
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `cell_${String(i + 1).padStart(2, '0')}`, kind: 'cell',
    label: `خلية ${i + 1} - وردية ${i % 2 === 0 ? 'A' : 'B'}`,
    shift: i % 2 === 0 ? 'A' : 'B',
    x: 40 + (i % 5) * 270, y: 300 + Math.floor(i / 5) * 190, w: 250, h: 170,
    color: i % 2 === 0 ? 0x7c3aed : 0x9333ea, agents: CELL_ROLES
  })),
  { id: 'joy', kind: 'joy', label: 'مختبر المتعة (9 لاعبين + 5 محللين)', x: 40, y: 700, w: 520, h: 360, color: 0xb45309, agents: [...PLAYERS, ...ANALYSTS] },
  { id: 'innovation', kind: 'growth', label: 'مختبر الابتكار (11)', x: 580, y: 700, w: 360, h: 360, color: 0x15803d, agents: n('مبتكر', 11) },
  { id: 'hr', kind: 'growth', label: 'الموارد البشرية (4)', x: 960, y: 700, w: 220, h: 170, color: 0xbe185d, agents: n('HR', 4) },
  { id: 'coach', kind: 'growth', label: 'مدرب المهارات (3)', x: 960, y: 890, w: 220, h: 170, color: 0x0369a1, agents: n('مدرب', 3) },
  { id: 'marketing', kind: 'growth', label: 'التسويق (12)', x: 1200, y: 700, w: 460, h: 360, color: 0xc2410c, agents: n('مسوق', 12) }
];

export const zoneById = (id) => ZONES.find((z) => z.id === id);
