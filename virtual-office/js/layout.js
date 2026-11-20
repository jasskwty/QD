// Map of the QD headquarters: rooms, walls, doors, desks and seats. Pure data, no Phaser here.
export const T = 32;                 // tile size in px
export const COLS = 120, ROWS = 80;  // world = 3840 × 2560
export const WORLD_W = COLS * T, WORLD_H = ROWS * T;

// x, y, w, h in px (multiples of 32). doors: sides with a 3-tile opening.
export const ROOMS = [
  { id: 'ceo', label: 'مكتب المدير التنفيذي 👑', x: 64, y: 64, w: 640, h: 512, doors: ['bottom'], floor: 0x3b2f4a, accent: 0xffd23f },
  { id: 'leaders', label: 'القيادة ومجلس التفتيش الأعلى', x: 768, y: 64, w: 896, h: 512, doors: ['bottom'], floor: 0x2f3a4a, accent: 0x9ec5ff },
  { id: 'meet1', label: 'قاعة الاجتماعات 1', x: 1728, y: 64, w: 384, h: 512, doors: ['bottom'], floor: 0x26404a, accent: 0x7fe3ff, meeting: true },
  { id: 'meet2', label: 'قاعة الاجتماعات 2', x: 2176, y: 64, w: 384, h: 512, doors: ['bottom'], floor: 0x26404a, accent: 0x7fe3ff, meeting: true },
  { id: 'meet3', label: 'قاعة الاجتماعات 3', x: 2624, y: 64, w: 384, h: 512, doors: ['bottom'], floor: 0x26404a, accent: 0x7fe3ff, meeting: true },
  { id: 'meet4', label: 'قاعة الاجتماعات 4', x: 3072, y: 64, w: 384, h: 512, doors: ['bottom'], floor: 0x26404a, accent: 0x7fe3ff, meeting: true },
  { id: 'restroom', label: 'دورات المياه 🚻', x: 3520, y: 64, w: 256, h: 512, doors: ['bottom'], floor: 0x3a4a52, accent: 0xb8d8e8 },

  { id: 'cells', label: 'صالة خلايا الأسئلة', x: 64, y: 704, w: 2240, h: 960, doors: ['top', 'bottom'], floor: 0x2e3b33, accent: 0x8fe39a },
  { id: 'lounge', label: 'قاعة الألعاب والاختبار الحي 🎮', x: 2368, y: 704, w: 896, h: 576, doors: ['top', 'bottom'], floor: 0x40284a, accent: 0xff7ad9 },
  { id: 'diner', label: 'مطعم وكافيه QD ☕', x: 3328, y: 704, w: 448, h: 576, doors: ['top', 'bottom'], floor: 0x4a3626, accent: 0xffb36b },
  { id: 'training', label: 'مختبر التدريب والمهارات', x: 2368, y: 1344, w: 448, h: 320, doors: ['bottom'], floor: 0x2c3550, accent: 0xa3b5ff },
  { id: 'hr', label: 'الموارد البشرية والترقيات ⭐', x: 2880, y: 1344, w: 384, h: 320, doors: ['bottom'], floor: 0x3f3a2a, accent: 0xffe08a },
  { id: 'language', label: 'التدقيق اللغوي والترجمة', x: 3328, y: 1344, w: 448, h: 320, doors: ['bottom'], floor: 0x2f3f3f, accent: 0x8ff0e0 },

  { id: 'eng', label: 'الهندسة والبث والذكاء الاصطناعي', x: 64, y: 1792, w: 1088, h: 704, doors: ['top'], floor: 0x232f40, accent: 0x6fb6ff },
  { id: 'design', label: 'استوديو التصميم والصوت', x: 1216, y: 1792, w: 576, h: 704, doors: ['top'], floor: 0x3d2a3d, accent: 0xff9ecf },
  { id: 'marketing', label: 'جناح التسويق 📣', x: 1856, y: 1792, w: 512, h: 704, doors: ['top'], floor: 0x3d3324, accent: 0xffc94d },
  { id: 'gamelab', label: 'مختبر ابتكار الألعاب 💡', x: 2432, y: 1792, w: 512, h: 704, doors: ['top'], floor: 0x2b3d2b, accent: 0xb6ff6b },
  { id: 'innov', label: 'ابتكار الفئات والنمو والمشاهير', x: 3008, y: 1792, w: 768, h: 704, doors: ['top'], floor: 0x33304a, accent: 0xc7a6ff }
];
export const roomById = Object.fromEntries(ROOMS.map(r => [r.id, r]));

const ROOM_OF_SLUG = { leadership: 'leaders', categories: 'cells', joylab: 'lounge', hr: 'hr', training: 'training', language: 'language',
  streaming: 'eng', ai: 'eng', apps: 'eng', infra: 'eng', design: 'design', marketing: 'marketing', gamelab: 'gamelab', innovation: 'innov', growth: 'innov' };

export const LEADERS = ['coo', 'chief-inspector', 'auditor-content', 'auditor-tech', 'auditor-design', 'auditor-growth', 'auditor-compliance',
  'head-strategy', 'head-academy', 'joy-index-editor', 'game-lab-head', 'marketing-head', 'hr-head'];

// ── walkability grid ──
export function buildGrid() {
  const g = Array.from({ length: ROWS }, () => new Array(COLS).fill(true));
  for (let x = 0; x < COLS; x++) { g[0][x] = false; g[ROWS - 1][x] = false; }
  for (let y = 0; y < ROWS; y++) { g[y][0] = false; g[y][COLS - 1] = false; }
  const doors = [];
  for (const r of ROOMS) {
    const x0 = r.x / T, y0 = r.y / T, x1 = (r.x + r.w) / T - 1, y1 = (r.y + r.h) / T - 1;
    for (let x = x0; x <= x1; x++) { g[y0][x] = false; g[y1][x] = false; }
    for (let y = y0; y <= y1; y++) { g[y][x0] = false; g[y][x1] = false; }
    for (const side of r.doors) {
      const tiles = [];
      if (side === 'top' || side === 'bottom') {
        const y = side === 'top' ? y0 : y1;
        const cx = r.id === 'cells' ? [x0 + 8, Math.round((x0 + x1) / 2), x1 - 8] : [Math.round((x0 + x1) / 2)];
        for (const c of cx) for (let d = -1; d <= 1; d++) { g[y][c + d] = true; tiles.push([c + d, y]); }
      }
      doors.push({ room: r.id, side, tiles });
    }
  }
  return { grid: g, doors };
}

// ── seats ──
function gridSeats(r, n, top = 96, dx = 64, dy = 72) {
  const cols = Math.max(1, Math.floor((r.w - 96) / dx));
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: r.x + 64 + (i % cols) * dx, y: r.y + top + Math.floor(i / cols) * dy });
  return out;
}

export function meetingSeats(r) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2 - 16;
  const seats = [];
  for (let i = 0; i < 5; i++) seats.push({ x: cx - 128 + i * 64, y: cy - 112 });
  for (let i = 0; i < 5; i++) seats.push({ x: cx - 128 + i * 64, y: cy + 112 });
  for (const s of [-1, 1]) for (const dy of [-40, 40]) seats.push({ x: cx + s * 168, y: cy + dy });
  return seats; // 14
}

export const DINER_SEATS = (() => {
  const r = roomById.diner, out = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) for (const s of [-1, 1])
    out.push({ x: r.x + 80 + col * 128 + s * 26, y: r.y + 200 + row * 96 });
  return out; // 24
})();

export const LOUNGE_REWARD_SEATS = (() => {
  const r = roomById.lounge, out = [];
  for (let i = 0; i < 8; i++) out.push({ x: r.x + 450 + i * 50, y: r.y + 528 });
  return out;
})();

// Places every employee at a desk. Returns { pos: {id: {x,y}}, cellSlots: [{x,y,w,h,label}] }
export function placeEmployees(org) {
  const pos = {}, cellSlots = [];
  const byRoom = {};
  const cells = new Map();
  const qMonitors = [];
  for (const e of org) {
    if (e.id === 'ceo' || e.id === 'ceo-business-manager') continue;
    if (e.cslug === 'categories') {
      const m = e.id.match(/^(cat-\d+)-/);
      if (m) { if (!cells.has(m[1])) cells.set(m[1], []); cells.get(m[1]).push(e); }
      else qMonitors.push(e);
      continue;
    }
    const room = ROOM_OF_SLUG[e.cslug] || 'innov';
    (byRoom[room] ||= []).push(e);
  }
  // CEO office: the AI CEO at the big desk, the business manager by the door
  const ceo = roomById.ceo;
  pos['ceo'] = { x: ceo.x + ceo.w / 2 + 120, y: ceo.y + 150 };
  pos['ceo-business-manager'] = { x: ceo.x + ceo.w / 2 + 80, y: ceo.y + ceo.h - 92 };
  // cells hall: one slot per cell + slots for the quality monitors
  const hall = roomById.cells;
  const monitorSlots = Math.ceil(qMonitors.length / 3);
  const slots = cells.size + monitorSlots;
  const cols = 10, rows = Math.ceil(slots / cols);
  const sw = (hall.w - 64) / cols, sh = (hall.h - 96) / rows;
  let i = 0;
  const ORDER = ['rival', 'writer', 'media', 'checker'];
  for (const [cid, members] of cells) {
    const sx = hall.x + 32 + (i % cols) * sw, sy = hall.y + 64 + Math.floor(i / cols) * sh;
    const label = (members.find(m => m.id.endsWith('-monitor'))?.title || cid).replace(/^مراقب العملية - /, '');
    cellSlots.push({ x: sx, y: sy, w: sw, h: sh, label, cid });
    for (const m of members) {
      const role = m.id.slice(cid.length + 1);
      const k = ORDER.indexOf(role);
      pos[m.id] = k >= 0 ? { x: sx + 26 + k * ((sw - 52) / 3), y: sy + sh * 0.5 } : { x: sx + sw / 2, y: sy + sh * 0.82 };
    }
    i++;
  }
  qMonitors.forEach((m, j) => {
    const slot = i + Math.floor(j / 3);
    const sx = hall.x + 32 + (slot % cols) * sw, sy = hall.y + 64 + Math.floor(slot / cols) * sh;
    if (j % 3 === 0) cellSlots.push({ x: sx, y: sy, w: sw, h: sh, label: 'مراقبو الجودة', cid: 'quality' });
    pos[m.id] = { x: sx + 40 + (j % 3) * ((sw - 80) / 2), y: sy + sh * 0.6 };
  });
  // lounge: playtesters on the sofas facing the 3 screens, analysts behind them
  const lounge = roomById.lounge;
  const testers = (byRoom.lounge || []).filter(e => e.id.startsWith('playtester'));
  const analysts = (byRoom.lounge || []).filter(e => !e.id.startsWith('playtester'));
  testers.forEach((e, k) => { pos[e.id] = { x: lounge.x + 96 + (k % 3) * 64 + Math.floor(k / 3) * 232, y: lounge.y + 250 }; });
  analysts.forEach((e, k) => { pos[e.id] = { x: lounge.x + 120 + k * 120, y: lounge.y + 340 }; });
  delete byRoom.lounge;
  for (const [room, list] of Object.entries(byRoom)) {
    const r = roomById[room];
    const seats = gridSeats(r, list.length, room === 'leaders' ? 150 : 96);
    list.sort((a, b) => (a.committee + a.no).localeCompare(b.committee + b.no));
    list.forEach((e, k) => { pos[e.id] = seats[k]; });
  }
  return { pos, cellSlots };
}

// ── A* on the tile grid ──
export function findPath(grid, sx, sy, tx, ty) {
  const W = COLS, H = ROWS;
  const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x];
  if (!ok(tx, ty)) { // snap the target to the nearest walkable tile
    let best = null;
    for (let r = 1; r < 6 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!best && ok(tx + dx, ty + dy)) best = [tx + dx, ty + dy];
    if (!best) return null;
    [tx, ty] = best;
  }
  if (!ok(sx, sy)) return null;
  const key = (x, y) => y * W + x;
  const g = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
  const heap = []; // [f, x, y]
  const push = (n) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);
  g[key(sx, sy)] = 0; push([h(sx, sy), sx, sy]);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (heap.length) {
    const [, x, y] = pop(), k = key(x, y);
    if (closed[k]) continue; closed[k] = 1;
    if (x === tx && y === ty) {
      const path = []; let c = k;
      while (c !== -1) { path.push([c % W, Math.floor(c / W)]); c = from[c]; }
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!ok(nx, ny)) continue;
      const nk = key(nx, ny), ng = g[k] + 1;
      if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push([ng + h(nx, ny), nx, ny]); }
    }
  }
  return null;
}

// ── department meeting tables: one per room (cells huddle around their own slot) ──
export const DEPT_TABLES = {
  leaders: { dx: 448, dy: 400, rx: 150, ry: 50 }, eng: { dx: 544, dy: 520, rx: 160, ry: 55 }, design: { dx: 288, dy: 480, rx: 130, ry: 55 },
  marketing: { dx: 256, dy: 410, rx: 120, ry: 55 }, gamelab: { dx: 256, dy: 410, rx: 120, ry: 55 }, innov: { dx: 384, dy: 490, rx: 150, ry: 55 },
  hr: { dx: 120, dy: 225, rx: 70, ry: 34 }, training: { dx: 130, dy: 225, rx: 80, ry: 34 }, language: { dx: 224, dy: 228, rx: 110, ry: 34 },
  lounge: { dx: 220, dy: 505, rx: 130, ry: 28 }
};
export function tableOf(roomId) {
  const t = DEPT_TABLES[roomId], r = roomById[roomId];
  return t && { x: r.x + t.dx, y: r.y + t.dy, rx: t.rx, ry: t.ry };
}
// n seats on an ellipse around a table
export function tableSeats(t, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push({ x: t.x + Math.cos(a) * (t.rx + 22), y: t.y + Math.sin(a) * (t.ry + 22) });
  }
  return out;
}
export const roomAt = (x, y) => ROOMS.find(r => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) || null;
