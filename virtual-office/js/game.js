// QD Virtual Office — Phaser 3 top-down game. The CEO walks the headquarters, inspects and talks to every agent,
// calls meetings in the four rooms, and watches the Joy Lab, shifts and the JOY CRISIS protocol live.
import * as data from './data.js';
import * as ui from './ui.js';
import { T, COLS, ROWS, WORLD_W, WORLD_H, ROOMS, roomById, LEADERS, buildGrid, placeEmployees, meetingSeats, findPath,
  DINER_SEATS, LOUNGE_REWARD_SEATS, DEPT_TABLES, tableOf, tableSeats, roomAt } from './layout.js';

const SECTOR_COLOR = {
  'القيادة العليا ومجلس التفتيش الأعلى': 0x2b2d42, 'قطاع المحتوى والفئات': 0x2a9d8f, 'قطاع الهندسة والبث والذكاء الاصطناعي': 0x457b9d,
  'قطاع التصميم والصوتيات والإنتاج المرئي': 0xe56b9f, 'قطاع النمو والمشاهير والرقابة المجتمعية': 0x9b5de5, 'مختبر تجربة اللعب والحماس': 0xf15bb5,
  'الموارد البشرية والتدريب': 0xc9a227, 'مختبر ابتكار الألعاب': 0x70c84a, 'قطاع التسويق': 0xf3722c
};
const SCARVES = ['q', 'b', 'k']; // القادسية، برشلونة، الأزرق
const ROLE_ICON = { rival: '🕵️', writer: '✍️', media: '📷', checker: '🔎', monitor: '👁️' };
const CHANTS = ['💛 يا قادسية يا ملكي!', 'Visca el Barça! 💙❤️', '💙 الأزرق الأزرق!', 'هدددددف ⚽', 'الملكي ما يغلب 💛', 'Força Barça 💙❤️',
  'يا أزرق شد حيلك 💙', 'القادسية بطل الدوري 🏆'];
const REACTIONS = ['😂', '🔥', '🤩', '😮', '🤔', '👏', '😆', '🥳', '😐'];
const DEPT_MEETING_MS = 35000, DEPT_MEETINGS_AT_ONCE = 5;
const JOY_EMOJI = (v) => (v == null ? '🎮' : v >= 85 ? '🤩' : v >= 70 ? '😂' : v >= 55 ? '🔥' : v >= 40 ? '😐' : '💤');

const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const kuwaitHour = () => Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuwait', hour: 'numeric', hour12: false })) % 24;
const currentShift = () => { const h = kuwaitHour(); return h >= 6 && h < 18 ? 'A' : 'B'; };

class Office extends Phaser.Scene {
  constructor() { super('office'); }
  init(d) { this.org = d.org; this.byId = Object.fromEntries(d.org.map(e => [e.id, e])); this.state = d.state; }

  create() {
    const { grid, doors } = buildGrid();
    this.grid = grid; this.doors = doors;
    this.sound_on = false; this.typing = false; this.panel = false;
    this.makeTextures();
    this.dynamic = new Set();
    const before = this.children.list.length;
    this.drawWorld();
    const { pos, cellSlots } = placeEmployees(this.org);
    this.home = pos;
    this.cellSlots = cellSlots;
    this.drawCells(cellSlots);
    this.drawFurniture();
    this.drawDeptTables();
    this.drawLoungeLive();
    this.bakeStatic(before);
    this.spawnNPCs();
    this.spawnPlayer();
    this.setupCameras();
    this.setupInput();
    ui.initUI({
      org: this.org, byId: this.byId,
      onSummon: (roomId, ids) => this.summon(roomId || this.nearestFreeRoom(), ids),
      onEndMeeting: (roomId) => this.endMeeting(roomId),
      onGoTo: (id) => this.goTo(id),
      onEmergency: () => this.emergency(),
      onPriorities: () => ui.openPriorities(this.state),
      onTravel: (dest) => this.travel(dest),
      travelList: () => this.travelList(),
      toggleSprint: () => (this.sprint = !this.sprint),
      toggleMap: () => { this.mini.setVisible(!this.mini.visible); },
      zoom: (d) => this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom + d, 0.4, 1.6)),
      setStick: (x, y) => { this.stick = x || y ? { x, y } : null; },
      onPromptTap: () => { if (this.nearNPC) ui.openAgent(this.nearNPC.e, this.state); else if (this.inRoom) ui.openRoom(this.inRoom, this.state); },
      onSay: (id, text) => this.say(id, text.split('\n')[0].slice(0, 70), 6000),
      toggleSound: () => (this.sound_on = !this.sound_on),
      setTyping: (v) => { this.typing = v; this.input.keyboard.enabled = !v; },
      setPanelOpen: (v) => { this.panel = v; }
    });
    this.applyState(true);
    this.time.addEvent({ delay: 60000, loop: true, callback: async () => { this.state = await data.loadState(); this.applyState(false); } });
    this.time.addEvent({ delay: 9000, loop: true, callback: () => this.randomChant() });
    this.time.addEvent({ delay: 1500, loop: true, callback: () => this.siren() });
    this.time.addEvent({ delay: 30000, loop: true, callback: () => ui.updateHUD(this.state, currentShift()) });
    this.setupDepartments();
    this.time.addEvent({ delay: 4000, loop: true, callback: () => this.deptTick() });
    this.time.addEvent({ delay: 2500, loop: true, callback: () => this.loungeTick() });
    this.deptTick();
    document.getElementById('loading').hidden = true;
  }

  // Everything drawn so far that never changes goes into one texture, so the map costs one draw per camera per frame.
  bakeStatic(from) {
    const objs = this.children.list.slice(from).filter(o => !this.dynamic.has(o));
    const rt = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0).setDepth(0);
    rt.beginDraw();
    for (const o of objs) rt.batchDraw(o);
    rt.endDraw();
    objs.forEach(o => o.destroy());
  }

  // ── textures ──
  makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const person = (key, shirt, scarf, ceo = false) => {
      g.clear();
      g.fillStyle(0x000000, 0.25).fillEllipse(14, 33, 22, 7);
      g.fillStyle(0x2b2b2b).fillRect(8, 24, 5, 9).fillRect(15, 24, 5, 9);
      g.fillStyle(shirt).fillRoundedRect(4, 12, 20, 15, 5);
      if (scarf === 'q') g.fillStyle(0xffd200).fillRect(5, 12, 18, 4);
      if (scarf === 'b') { g.fillStyle(0x004d98).fillRect(5, 12, 6, 4); g.fillStyle(0xa50044).fillRect(11, 12, 6, 4); g.fillStyle(0x004d98).fillRect(17, 12, 6, 4); }
      if (scarf === 'k') g.fillStyle(0x0072ce).fillRect(5, 12, 18, 4);
      g.fillStyle(0xe8b98a).fillCircle(14, 8, 7);
      g.fillStyle(ceo ? 0xffffff : 0x2a1a10).fillRect(7, 1, 14, 4);
      if (ceo) { g.fillStyle(0xffd23f).fillTriangle(8, 2, 11, -4 + 6, 14, 2).fillTriangle(12, 2, 15, -4 + 6, 18, 2).fillTriangle(16, 2, 19, -4 + 6, 21, 2); }
      g.generateTexture(key, 28, 36);
    };
    for (const [sector, color] of Object.entries(SECTOR_COLOR)) for (const s of SCARVES) person(`p-${color}-${s}`, color, s);
    person('ceo-player', 0xffffff, 'q', true);
    g.clear(); g.fillStyle(0xffffff).fillRect(0, 0, 6, 6); g.generateTexture('px', 6, 6);
    g.clear(); g.fillStyle(0x1c2029).fillRect(0, 0, T, T); g.lineStyle(1, 0x252a35).strokeRect(0, 0, T, T); g.generateTexture('floor', T, T);
    g.destroy();
  }

  // ── world ──
  drawWorld() {
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'floor').setOrigin(0);
    const g = this.add.graphics();
    this.roomOverlays = {};
    for (const r of ROOMS) {
      g.fillStyle(r.floor, 1).fillRect(r.x, r.y, r.w, r.h);
      const glass = r.meeting;
      g.fillStyle(glass ? 0x9fe8ff : 0x11141b, glass ? 0.55 : 1);
      g.fillRect(r.x, r.y, r.w, T).fillRect(r.x, r.y + r.h - T, r.w, T).fillRect(r.x, r.y, T, r.h).fillRect(r.x + r.w - T, r.y, T, r.h);
      g.lineStyle(2, r.accent, 0.8).strokeRect(r.x + T, r.y + T, r.w - 2 * T, r.h - 2 * T);
      this.add.text(r.x + r.w / 2, r.y + T + 6, r.label, { fontFamily: 'Noto Kufi Arabic, Tahoma', fontSize: '15px', color: '#ffffff', rtl: true,
        backgroundColor: '#00000066', padding: { x: 8, y: 3 } }).setOrigin(0.5, 0);
      if (glass) { this.roomOverlays[r.id] = this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0xff1a1a, 0).setDepth(5); this.dynamic.add(this.roomOverlays[r.id]); }
    }
    // doors
    this.doorGfx = {};
    for (const d of this.doors) {
      const gd = this.add.graphics().setDepth(2); this.dynamic.add(gd);
      this.doorGfx[d.room] = (this.doorGfx[d.room] || []).concat(gd);
      const r = roomById[d.room];
      for (const [x, y] of d.tiles) { gd.fillStyle(r.meeting ? 0x7fe3ff : r.floor, r.meeting ? 0.35 : 1).fillRect(x * T, y * T, T, T); }
    }
    // corridors' guide lines
    g.lineStyle(2, 0xffd23f, 0.15).lineBetween(64, 640, WORLD_W - 64, 640).lineBetween(64, 1728, WORLD_W - 64, 1728);
  }

  drawCells(slots) {
    const g = this.add.graphics();
    for (const s of slots) {
      g.fillStyle(0x000000, 0.18).fillRoundedRect(s.x + 4, s.y + 4, s.w - 8, s.h - 8, 10);
      g.lineStyle(1, 0x8fe39a, 0.35).strokeRoundedRect(s.x + 4, s.y + 4, s.w - 8, s.h - 8, 10);
      this.add.text(s.x + s.w / 2, s.y + 12, s.label, { fontFamily: 'Noto Kufi Arabic, Tahoma', fontSize: '11px', color: '#cfe9d4', rtl: true,
        wordWrap: { width: s.w - 16 }, align: 'center' }).setOrigin(0.5, 0);
    }
  }

  desk(g, x, y, w = 40, h = 16, color = 0x6b4f35) { g.fillStyle(color).fillRoundedRect(x - w / 2, y - 26, w, h, 3); g.fillStyle(0x9fd3ff, 0.9).fillRect(x - 7, y - 32, 14, 8); }

  drawFurniture() {
    const g = this.add.graphics().setDepth(1);
    const label = (x, y, t, size = 12, color = '#ffffff') => this.add.text(x, y, t, { fontFamily: 'Noto Kufi Arabic, Tahoma', fontSize: `${size}px`, color, rtl: true, align: 'center' }).setOrigin(0.5).setDepth(2);
    // desks for everyone (except lounge sitters)
    for (const e of this.org) { const p = this.home[e.id]; if (p && e.cslug !== 'joylab') this.desk(g, p.x, p.y, e.cslug === 'categories' ? 30 : 40); }
    // CEO office
    const c = roomById.ceo;
    g.fillStyle(0x7a1f2b, 0.6).fillRoundedRect(c.x + 120, c.y + 110, 400, 260, 20);
    g.fillStyle(0x4a3220).fillRoundedRect(c.x + 200, c.y + 150, 240, 50, 8);
    label(c.x + 320, c.y + 175, 'مكتبك 👑', 13, '#ffd23f');
    this.scarfWall(g, c.x + 60, c.y + 60);
    label(c.x + 100, c.y + 420, '🏆', 28);
    label(c.x + c.w / 2 + 80, c.y + c.h - 130, '📋 مدير أعمالك', 11, '#ffe9a8');
    // meeting rooms: table, chairs, screen
    for (const r of ROOMS.filter(r => r.meeting)) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2 - 16;
      g.fillStyle(0x5b4636).fillRoundedRect(cx - 150, cy - 70, 300, 140, 30);
      for (const s of meetingSeats(r)) g.fillStyle(0x222831).fillCircle(s.x, s.y + 6, 12);
      g.fillStyle(0x0d0f14).fillRect(cx - 80, r.y + 64, 160, 40);
      label(cx, r.y + 84, 'شاشة العرض', 10, '#7fe3ff');
    }
    // lounge
    const L = roomById.lounge;
    const screens = [['الديوانية', 0xffd23f], ['سين جيم', 0x3fa9ff], ['مخمخ', 0xff5d8f]];
    screens.forEach(([name, col], i) => {
      const x = L.x + 160 + i * 232;
      g.fillStyle(0x0d0f14).fillRect(x - 90, L.y + 70, 180, 90); g.lineStyle(3, col).strokeRect(x - 90, L.y + 70, 180, 90);
      label(x, L.y + 115, `🎮 ${name}`, 15, '#ffffff');
      g.fillStyle(0x6d3a8f).fillRoundedRect(x - 100, L.y + 262, 200, 26, 10); // sofa
    });
    g.fillStyle(0x1f7a3a).fillRoundedRect(L.x + 560, L.y + 330, 150, 80, 10); g.lineStyle(5, 0x5b3a1e).strokeRoundedRect(L.x + 560, L.y + 330, 150, 80, 10);
    label(L.x + 635, L.y + 370, '🎱 بلياردو', 11);
    g.fillStyle(0x111111).fillRoundedRect(L.x + 760, L.y + 330, 90, 50, 8); label(L.x + 805, L.y + 355, '🎮 PS5', 11);
    g.fillStyle(0x8a5a2b, 0.7).fillRect(L.x + 40, L.y + 470, 360, 70); label(L.x + 220, L.y + 505, 'ديوانية 🫖 قهوة وتمر', 12);
    this.tvs = [];
    this.tvs.push(this.footballTV(L.x + 700, L.y + 450));
    this.scarfWall(g, L.x + 600, L.y + 196);
    // diner
    const D = roomById.diner;
    g.fillStyle(0x6b3f1f).fillRect(D.x + 48, D.y + 70, D.w - 96, 40); label(D.x + D.w / 2, D.y + 90, '☕ القهوة والكرك · 🍔 المطعم', 12, '#ffe0b3');
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) g.fillStyle(0xd9c3a5).fillCircle(D.x + 80 + col * 128, D.y + 200 + row * 96, 18);
    this.tvs.push(this.footballTV(D.x + D.w / 2, D.y + 145));
    this.scarfWall(g, D.x + D.w - 110, D.y + 520);
    // restroom
    const W = roomById.restroom;
    for (let i = 0; i < 4; i++) { g.fillStyle(0x8fb3c4).fillRect(W.x + 48, W.y + 90 + i * 80, 70, 60); label(W.x + 83, W.y + 120 + i * 80, '🚪', 16); }
    for (let i = 0; i < 3; i++) { g.fillStyle(0xe8f4fa).fillRoundedRect(W.x + 160, W.y + 100 + i * 100, 50, 30, 8); }
    label(W.x + 185, W.y + 420, '🚹 🚺', 20);
    // others
    const TR = roomById.training; g.fillStyle(0xf2f2f2).fillRect(TR.x + 250, TR.y + 70, 160, 70); label(TR.x + 330, TR.y + 105, '🧠 Skills + MCP', 11, '#333333');
    const HR = roomById.hr; g.fillStyle(0xf2f2f2).fillRect(HR.x + 200, HR.y + 70, 150, 70); label(HR.x + 275, HR.y + 105, '⭐ لوحة الترقيات', 11, '#333333');
    const MK = roomById.marketing; g.fillStyle(0xffc94d, 0.9).fillRect(MK.x + 96, MK.y + 600, MK.w - 192, 50); label(MK.x + MK.w / 2, MK.y + 625, '🎯 التارقت: 200 د.ك ← +25% كل مرة', 12, '#3d2a00');
    const GL = roomById.gamelab; for (let i = 0; i < 6; i++) g.fillStyle([0xfff176, 0xff8a80, 0x80d8ff][i % 3]).fillRect(GL.x + 80 + i * 60, GL.y + 600, 44, 44);
    label(GL.x + GL.w / 2, GL.y + 670, '💡 أفكار الألعاب', 11);
    const EN = roomById.eng; for (let i = 0; i < 8; i++) { g.fillStyle(0x0e1520).fillRect(EN.x + 80 + i * 120, EN.y + 620, 70, 50); g.fillStyle(0x34d399).fillRect(EN.x + 88 + i * 120, EN.y + 630, 6, 6); }
    label(EN.x + EN.w / 2, EN.y + 685, '🖥️ الخوادم', 11);
  }

  drawDeptTables() {
    const g = this.add.graphics().setDepth(1);
    for (const id of Object.keys(DEPT_TABLES)) {
      const t = tableOf(id);
      g.fillStyle(0x5b4636, 0.95).fillEllipse(t.x, t.y, t.rx * 2, t.ry * 2);
      g.lineStyle(2, 0xffd23f, 0.4).strokeEllipse(t.x, t.y, t.rx * 2, t.ry * 2);
      this.add.text(t.x, t.y, 'طاولة اجتماع القسم', { fontFamily: 'Noto Kufi Arabic, Tahoma', fontSize: '10px', color: '#ffe9a8', rtl: true }).setOrigin(0.5).setDepth(2);
    }
  }

  scarfWall(g, x, y) {
    const scarf = (sx, sy, cols) => cols.forEach((c, i) => g.fillStyle(c).fillRect(sx + i * 10, sy, 10, 22));
    scarf(x, y, [0xffd200, 0x0047ab, 0xffd200, 0x0047ab]);
    scarf(x + 50, y, [0x004d98, 0xa50044, 0x004d98, 0xa50044]);
    scarf(x + 100, y, [0x0072ce, 0xffffff, 0x0072ce, 0xffffff]);
  }

  footballTV(x, y) {
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(0x0d0f14).fillRect(x - 110, y - 40, 220, 80); g.lineStyle(2, 0xffd23f).strokeRect(x - 110, y - 40, 220, 80);
    const tv = this.add.text(x, y, '', { fontFamily: 'Noto Kufi Arabic, Tahoma', fontSize: '10px', color: '#ffffff', rtl: true, align: 'center', lineSpacing: 2 }).setOrigin(0.5).setDepth(3);
    this.dynamic.add(tv);
    return tv;
  }

  // ── people ──
  spawnNPCs() {
    this.npcs = new Map();
    for (const e of this.org) {
      const p = this.home[e.id]; if (!p) continue;
      const color = SECTOR_COLOR[e.sector] ?? 0x666666;
      const tex = `p-${color}-${SCARVES[hash(e.id) % 3]}`;
      const s = this.add.sprite(p.x, p.y, this.textures.exists(tex) ? tex : 'ceo-player').setDepth(10).setInteractive({ useHandCursor: true });
      s.on('pointerdown', (ptr, lx, ly, ev) => { ev?.stopPropagation(); ui.openAgent(e, this.state); });
      const emo = this.add.text(p.x, p.y - 26, '', { fontSize: '14px' }).setOrigin(0.5).setDepth(11);
      this.npcs.set(e.id, { e, s, emo, path: null, at: { ...p }, place: 'desk' });
    }
    this.nameTag = this.add.text(0, 0, '', { fontFamily: 'Noto Kufi Arabic, Tahoma', fontSize: '12px', color: '#fff', rtl: true,
      backgroundColor: '#000000aa', padding: { x: 6, y: 2 } }).setOrigin(0.5, 1).setDepth(30).setVisible(false);
  }

  spawnPlayer() {
    const c = roomById.ceo;
    this.player = this.add.sprite(c.x + c.w / 2 - 40, c.y + 250, 'ceo-player').setDepth(20).setScale(1.35);
    this.playerTag = this.add.text(0, 0, 'أنت 👑', { fontFamily: 'Noto Kufi Arabic, Tahoma', fontSize: '12px', color: '#ffd23f', rtl: true }).setOrigin(0.5).setDepth(21);
    this.playerPath = null;
  }

  setupCameras() {
    const cam = this.cameras.main;
    const phone = this.scale.width < 600;
    cam.setBounds(0, 0, WORLD_W, WORLD_H).startFollow(this.player, true, 0.12, 0.12).setZoom(phone ? 0.8 : 1);
    const mw = this.scale.width < 600 ? 180 : 240, mh = mw * 2 / 3, my = (h) => (this.scale.width < 600 ? 104 : h - mh - 12);
    this.mini = this.cameras.add(12, my(this.scale.height), mw, mh).setZoom(mw / WORLD_W).setBackgroundColor(0x0b0d12).centerOn(WORLD_W / 2, WORLD_H / 2);
    this.mini.setName('mini');
    if (phone) this.mini.setVisible(false);
    this.dot = this.add.circle(0, 0, 60, 0xffd23f).setDepth(50);
    cam.ignore(this.dot);
    this.mini.ignore([this.nameTag, this.playerTag, ...[...this.npcs.values()].map(n => n.emo)]);
    this.scale.on('resize', (sz) => { this.mini.setPosition(12, my(sz.height)); });
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,R,SHIFT', false);
    this.pathG = this.add.graphics().setDepth(8);
    this.input.keyboard.on('keydown-E', () => { if (this.typing) return; if (this.nearNPC) ui.openAgent(this.nearNPC.e, this.state); });
    this.input.keyboard.on('keydown-R', () => { if (this.typing) return; if (this.inRoom) ui.openRoom(this.inRoom, this.state); });
    this.input.on('pointerdown', (ptr) => {
      if (this.panel || ptr.camera === this.mini) {
        if (ptr.camera === this.mini) this.teleport(ptr.worldX, ptr.worldY);
        return;
      }
      this.walkTo(ptr.worldX, ptr.worldY);
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', (p, o, dx, dy) => { const z = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.4, 1.6); this.cameras.main.setZoom(z); });
  }

  tileOf(x, y) { return [Math.floor(x / T), Math.floor(y / T)]; }
  walkable(x, y) { const [tx, ty] = this.tileOf(x, y); return tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS && this.grid[ty][tx]; }

  walkTo(x, y) {
    const [sx, sy] = this.tileOf(this.player.x, this.player.y), [tx, ty] = this.tileOf(x, y);
    const p = findPath(this.grid, sx, sy, tx, ty);
    if (p) this.playerPath = p.map(([px, py]) => ({ x: px * T + T / 2, y: py * T + T / 2 })).concat(this.walkable(x, y) ? [{ x, y }] : []);
  }

  goTo(id) {
    const n = this.npcs.get(id); if (!n) return;
    this.walkTo(n.s.x, n.s.y + 40);
    ui.toast(`رايح لـ ${n.e.no} ${n.e.title}`);
    this.say(id, '👋 هلا والله!', 3000);
  }

  moveNPC(id, x, y, place) {
    const n = this.npcs.get(id); if (!n) return;
    const [sx, sy] = this.tileOf(n.s.x, n.s.y), [tx, ty] = this.tileOf(x, y);
    const p = findPath(this.grid, sx, sy, tx, ty);
    n.path = (p || []).map(([px, py]) => ({ x: px * T + T / 2, y: py * T + T / 2 })).concat([{ x, y }]);
    n.place = place;
  }

  // ── meetings ──
  nearestFreeRoom() {
    const rooms = ROOMS.filter(r => r.meeting);
    return (rooms.find(r => !ui.meetingOf(r.id).attendees.length) || rooms[0]).id;
  }
  summon(roomId, ids) {
    const r = roomById[roomId], m = ui.meetingOf(roomId);
    const seats = meetingSeats(r);
    for (const id of ids) {
      if (m.attendees.includes(id) || !this.npcs.has(id)) continue;
      if (m.attendees.length >= seats.length) { ui.toast('القاعة مليانة (14 كرسي)'); break; }
      for (const [rid, other] of ROOMS.filter(x => x.meeting).map(x => [x.id, ui.meetingOf(x.id)])) if (rid !== roomId) other.attendees = other.attendees.filter(a => a !== id);
      m.attendees.push(id);
      const seat = seats[m.attendees.length - 1];
      this.moveNPC(id, seat.x, seat.y, roomId);
      const n = this.npcs.get(id); n.s.setAlpha(1); n.emo.setText(this.crisisOn ? '🚨' : '🗣️');
    }
    ui.toast(`📣 ${ids.length === 1 ? (this.byId[ids[0]]?.title || '') : `${ids.length} موظف`} رايحين لـ ${r.label}`);
  }
  endMeeting(roomId) {
    for (const id of ui.meetingOf(roomId).attendees) { const h = this.home[id]; this.moveNPC(id, h.x, h.y, 'desk'); }
  }
  emergency() {
    const room = 'meet1';
    this.summon(room, LEADERS.filter(id => this.byId[id]));
    this.walkTo(roomById[room].x + roomById[room].w / 2, roomById[room].y + roomById[room].h - 80);
    ui.toast('🚨 اجتماع قادة عاجل في قاعة 1. امشِ للقاعة واضغط R');
    this.cameras.main.shake(250, 0.004);
  }

  // ── crisis ──
  crisisAttendees() {
    const ids = (pre) => this.org.filter(e => pre.some(p => e.id.startsWith(p))).map(e => e.id);
    return {
      meet1: LEADERS.filter(id => this.byId[id]),
      meet2: ids(['game-lab-head', 'game-inventor-']),
      meet3: ids(['ux-tv-web-', 'ux-mobile-', 'motion-designer-']).slice(0, 14),
      meet4: ids(['joy-analyst-', 'lifeline-designer-', 'tournament-designer-']).slice(0, 14)
    };
  }
  setLock(locked) {
    for (const d of this.doors) {
      if (!roomById[d.room].meeting) continue;
      for (const [x, y] of d.tiles) this.grid[y][x] = !locked;
      for (const gd of this.doorGfx[d.room] || []) { gd.clear(); for (const [x, y] of d.tiles) gd.fillStyle(locked ? 0xff1a1a : 0x7fe3ff, locked ? 0.85 : 0.35).fillRect(x * T, y * T, T, T); }
    }
    for (const [id, ov] of Object.entries(this.roomOverlays)) {
      this.tweens.killTweensOf(ov);
      if (locked) { ov.setFillStyle(0xff1a1a, 0.08); this.tweens.add({ targets: ov, fillAlpha: 0.28, duration: 700, yoyo: true, repeat: -1 }); }
      else ov.setFillStyle(0xff1a1a, 0);
    }
  }
  siren() {
    if (!this.state.status.crisis?.active || !this.sound_on) return;
    try {
      this.ac ||= new AudioContext();
      const o = this.ac.createOscillator(), gn = this.ac.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(660, this.ac.currentTime); o.frequency.linearRampToValueAtTime(990, this.ac.currentTime + 0.5);
      gn.gain.setValueAtTime(0.06, this.ac.currentTime); gn.gain.linearRampToValueAtTime(0, this.ac.currentTime + 0.6);
      o.connect(gn).connect(this.ac.destination); o.start(); o.stop(this.ac.currentTime + 0.6);
    } catch { /* audio blocked */ }
  }

  // ── apply live state ──
  applyState(first) {
    const st = this.state, shift = currentShift();
    ui.updateHUD(st, shift);
    ui.setCrisisBanner(st.status.crisis);
    const crisis = !!st.status.crisis?.active;
    if (crisis !== this.crisisOn) {
      this.crisisOn = crisis;
      if (crisis) {
        for (const [room, ids] of Object.entries(this.crisisAttendees())) { ui.meetingOf(room).attendees = []; this.summon(room, ids); }
        this.setLock(true);
        if (!first) this.cameras.main.flash(600, 255, 0, 0);
      } else if (!first) {
        for (const r of ROOMS.filter(r => r.meeting)) { this.endMeeting(r.id); ui.meetingOf(r.id).attendees = []; }
        this.setLock(false);
      }
    }
    // football screens
    const fb = st.status.football || [];
    for (const tv of this.tvs) tv.setText(['⚽ شاشة المباريات', ...fb.map(f => `${f.team}: ${f.text || 'بانتظار آخر نتيجة'}`)].join('\n'));
    // who sits where
    const busy = new Set(ROOMS.filter(r => r.meeting).flatMap(r => ui.meetingOf(r.id).attendees));
    for (const m of (this.deptMeetings || new Map()).values()) for (const id of m.ids) busy.add(id);
    const promoted = new Set(st.roster?.promoted || []);
    const off = this.org.filter(e => e.shift !== shift && !busy.has(e.id) && e.cslug !== 'joylab' && e.id !== 'ceo-business-manager');
    const hourKey = String(new Date().getUTCHours());
    const cafe = new Set(off.slice().sort((a, b) => hash(hourKey + a.id) - hash(hourKey + b.id)).slice(0, DINER_SEATS.length).map(e => e.id));
    const stars = this.org.filter(e => e.shift === shift && !busy.has(e.id) && (st.agents?.[e.id]?.score ?? 0) >= 9).slice(0, LOUNGE_REWARD_SEATS.length).map(e => e.id);
    let ci = 0, li = 0;
    for (const [id, n] of this.npcs) {
      const e = n.e, a = st.agents?.[id];
      let want = 'desk';
      if (busy.has(id)) want = n.place;
      else if (cafe.has(id)) want = 'cafe';
      else if (stars.includes(id)) want = 'lounge';
      if (want !== n.place) {
        const seat = want === 'cafe' ? DINER_SEATS[ci++] : want === 'lounge' ? LOUNGE_REWARD_SEATS[li++] : this.home[id];
        if (first && want === 'desk') { n.s.setPosition(seat.x, seat.y); n.place = 'desk'; }
        else this.moveNPC(id, seat.x, seat.y, want);
      } else if (want === 'cafe') ci++; else if (want === 'lounge') li++;
      const offShift = e.shift !== shift && e.cslug !== 'joylab' && !busy.has(id);
      n.s.setAlpha(offShift && want === 'desk' ? 0.45 : 1);
      let emo = '';
      if (e.cslug === 'joylab' && e.id.startsWith('playtester')) emo = JOY_EMOJI(st.status.joy?.testers?.[id]);
      else if (busy.has(id) && crisis) emo = '🚨';
      else if (n.place === 'dept') emo = '🗣️';
      else if (want === 'cafe') emo = '☕';
      else if (want === 'lounge') emo = '🎮';
      else if (offShift) emo = '💤';
      else if (promoted.has(id)) emo = '⭐';
      else if (a?.score >= 9) emo = '🔥';
      else if (a?.state) emo = { working: '💻', reviewing: '🔍', inventing: '💡', done: '✅', late: '⚠️' }[a.state] || '';
      else emo = ROLE_ICON[id.split('-').pop()] || '';
      n.emo.setText(emo);
    }
    const j = st.status.joy || {};
    const ours = j.diwaniya, best = Math.max(j.seenjeem ?? -1, j.makhmakh ?? -1);
    if ((st.status.celebrate || (typeof ours === 'number' && ours > best && best >= 0)) && !this.celebrated) { this.celebrated = true; this.celebrate(); }
  }

  // ── fun ──
  say(id, text, ms = 3500) {
    const n = id === 'me' ? { s: this.player } : this.npcs.get(id); if (!n) return;
    const t = this.add.text(n.s.x, n.s.y - 44, text, { fontFamily: 'Noto Kufi Arabic, Tahoma', fontSize: '12px', color: '#111', rtl: true,
      backgroundColor: '#ffffffee', padding: { x: 8, y: 4 }, wordWrap: { width: 220 } }).setOrigin(0.5, 1).setDepth(40);
    this.cameras.main && this.mini.ignore(t);
    const follow = this.time.addEvent({ delay: 30, loop: true, callback: () => t.setPosition(n.s.x, n.s.y - 44) });
    this.time.delayedCall(ms, () => { follow.remove(); t.destroy(); });
  }
  randomChant() {
    const pool = [...this.npcs.values()].filter(n => n.place === 'cafe' || n.place === 'lounge' || n.e.cslug === 'joylab');
    if (!pool.length) return;
    const n = pool[Math.floor(Math.random() * pool.length)];
    this.say(n.e.id, CHANTS[Math.floor(Math.random() * CHANTS.length)]);
  }
  celebrate() {
    ui.toast('🎉 لعبتنا متصدرة مؤشر الفرحة! المكتب يحتفل 💛💙', 6000);
    const cam = this.cameras.main;
    for (let i = 0; i < 160; i++) {
      const p = this.add.image(cam.worldView.x + Math.random() * cam.worldView.width, cam.worldView.y - 20, 'px')
        .setTint([0xffd200, 0x004d98, 0xa50044, 0x0072ce, 0xffffff][i % 5]).setDepth(60).setAngle(Math.random() * 360);
      this.mini.ignore(p);
      this.tweens.add({ targets: p, y: cam.worldView.bottom + 40, angle: 720, duration: 2500 + Math.random() * 2500, delay: Math.random() * 1500, onComplete: () => p.destroy() });
    }
    const people = [...this.npcs.keys()].sort(() => Math.random() - 0.5).slice(0, 25);
    people.forEach((id, k) => this.time.delayedCall(k * 150, () => this.say(id, CHANTS[k % CHANTS.length], 4000)));
  }

  // ── movement helpers ──
  nearestWalkable(x, y) {
    const [tx, ty] = this.tileOf(x, y);
    for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = tx + dx, ny = ty + dy;
      if (nx > 0 && ny > 0 && nx < COLS && ny < ROWS && this.grid[ny][nx]) return { x: nx * T + T / 2, y: ny * T + T / 2 };
    }
    return null;
  }
  teleport(x, y) {
    const p = this.nearestWalkable(x, y); if (!p) return;
    this.playerPath = null;
    this.cameras.main.fadeOut(140, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.player.setPosition(p.x, p.y); this.cameras.main.fadeIn(180, 0, 0, 0); });
  }
  travelList() {
    const rooms = ROOMS.map(r => ({ key: 'room:' + r.id, label: r.label, x: r.x + r.w / 2, y: r.y + r.h - 70 }));
    const live = [...(this.deptMeetings || new Map()).values()].map(m => ({ key: 'dept:' + m.dept.id, label: `🗣️ اجتماع: ${m.dept.name}`, x: m.table.x, y: m.table.y + m.table.ry + 60 }));
    return [{ key: 'me', label: '👑 مكتبي', x: roomById.ceo.x + 280, y: roomById.ceo.y + 260 }, ...live, ...rooms];
  }
  travel(dest) { const d = this.travelList().find(x => x.key === dest); if (d) this.teleport(d.x, d.y); }

  // ── department meetings: every department, even a 5-person cell, meets in turn around its own table ──
  setupDepartments() {
    this.depts = (this.state.departments || []).filter(d => d.members?.length);
    this.deptMeetings = new Map();
    this.deptCursor = Math.floor(Math.random() * Math.max(1, this.depts.length));
    for (const d of this.depts) d.table = this.deptTable(d);
  }
  deptTable(d) {
    const homes = d.members.map(id => this.home[id]).filter(Boolean);
    if (!homes.length) return null;
    const first = homes[0];
    const slot = (this.cellSlots || []).find(s => first.x >= s.x && first.x <= s.x + s.w && first.y >= s.y && first.y <= s.y + s.h);
    if (slot) return { x: slot.x + slot.w / 2, y: slot.y + slot.h * 0.62, rx: slot.w * 0.28, ry: slot.h * 0.16, room: 'cells', slot: slot.cid };
    const counts = {};
    for (const h of homes) { const r = roomAt(h.x, h.y); if (r) counts[r.id] = (counts[r.id] || 0) + 1; }
    const room = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const t = room && tableOf(room);
    return t ? { ...t, room } : null;
  }
  deptTick() {
    if (!this.depts?.length) return;
    const now = this.time.now, shift = currentShift();
    for (const [id, m] of this.deptMeetings) if (now > m.until) {
      for (const pid of m.ids) { const h = this.home[pid], n = this.npcs.get(pid); if (h && n && n.place === 'dept') this.moveNPC(pid, h.x, h.y, 'desk'); }
      this.deptMeetings.delete(id);
    }
    const roomsBusy = new Set([...this.deptMeetings.values()].map(m => m.table.slot || m.table.room));
    const bigBusy = new Set(ROOMS.filter(r => r.meeting).flatMap(r => ui.meetingOf(r.id).attendees));
    let tries = 0;
    while (this.deptMeetings.size < DEPT_MEETINGS_AT_ONCE && tries++ < this.depts.length) {
      const d = this.depts[this.deptCursor++ % this.depts.length];
      if (!d.table || this.deptMeetings.has(d.id) || roomsBusy.has(d.table.slot || d.table.room)) continue;
      const ids = [d.chair, ...d.members.filter(id => id !== d.chair)]
        .filter(id => this.npcs.has(id) && !bigBusy.has(id) && this.npcs.get(id).place === 'desk' && (this.byId[id].shift === shift || this.byId[id].cslug === 'joylab' || id === d.chair))
        .slice(0, 14);
      if (ids.length < 2) continue;
      const seats = tableSeats(d.table, ids.length);
      ids.forEach((id, i) => { this.moveNPC(id, seats[i].x, seats[i].y, 'dept'); const n = this.npcs.get(id); n.s.setAlpha(1); n.emo.setText(i === 0 ? '🎤' : '🗣️'); });
      this.deptMeetings.set(d.id, { dept: d, ids, table: d.table, until: now + DEPT_MEETING_MS });
      roomsBusy.add(d.table.slot || d.table.room);
      this.say(ids[0], `📋 بدينا اجتماع ${d.name.replace(/^خلية فئة /, 'خلية ')}`, 3500);
    }
    ui.setDeptMeetings([...this.deptMeetings.values()].map(m => ({ key: 'dept:' + m.dept.id, label: m.dept.name, n: m.ids.length })));
  }

  // ── lounge plays around the clock ──
  drawLoungeLive() {
    const L = roomById.lounge;
    this.screenTexts = [0, 1, 2].map(i => {
      const tx = this.add.text(L.x + 160 + i * 232, L.y + 140, '', { fontFamily: 'Noto Kufi Arabic, Tahoma', fontSize: '10px', color: '#ffe9a8', rtl: true, align: 'center' }).setOrigin(0.5).setDepth(3);
      this.dynamic.add(tx); return tx;
    });
    const sign = this.add.text(L.x + L.w - 60, L.y + 60, '🔴 اللعب شغال 24 ساعة', { fontFamily: 'Noto Kufi Arabic, Tahoma', fontSize: '12px', color: '#ff7ad9', rtl: true }).setOrigin(1, 0).setDepth(3);
    this.dynamic.add(sign);
    this.tweens.add({ targets: sign, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });
  }
  loungeTick() {
    const cats = (this.cellSlots || []).filter(s => s.cid !== 'quality').map(s => s.label);
    const pts = [200, 400, 600];
    this.round = (this.round || 0) + 1;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    if (this.screenTexts) {
      this.screenTexts[0].setText(`سؤال ${pick(pts)} · ${pick(cats) || ''}`);
      this.screenTexts[1].setText(`جولة ${this.round} ⏱️`);
      this.screenTexts[2].setText(`جولة ${this.round} ⏱️`);
    }
    const real = this.state.status.joy?.testers || {};
    for (const [id, n] of this.npcs) {
      if (!id.startsWith('playtester') || n.place !== 'desk') continue;
      if (real[id] == null) n.emo.setText(pick(REACTIONS));
      if (Math.random() < 0.12) this.say(id, pick(['جاوبتها! 💪', 'لااا كانت سهلة 😭', 'فزعة! 🆘', 'الحين دورنا 🔥', 'VAR! 📺', 'هذي من وين جايبينها 😂']), 2200);
    }
    for (const [id, n] of this.npcs) if (id.startsWith('joy-analyst') && n.place === 'desk') n.emo.setText(pick(['📝', '📊', '🧐']));
  }

  // ── loop ──
  update(time, dt) {
    const k = this.keys;
    const speed = 240 * dt / 1000 * (this.sprint || k.SHIFT.isDown ? 2.2 : 1);
    let vx = 0, vy = 0;
    if (this.stick) { vx = this.stick.x; vy = this.stick.y; }
    else if (!this.typing) {
      if (k.A.isDown || k.LEFT.isDown) vx -= 1; if (k.D.isDown || k.RIGHT.isDown) vx += 1;
      if (k.W.isDown || k.UP.isDown) vy -= 1; if (k.S.isDown || k.DOWN.isDown) vy += 1;
    }
    if (vx || vy) {
      this.playerPath = null;
      const len = Math.max(1, Math.hypot(vx, vy)); vx = vx / len * speed; vy = vy / len * speed;
      const box = (x, y) => [[-9, 0], [9, 0], [-9, 14], [9, 14]].every(([ox, oy]) => this.walkable(x + ox, y + oy));
      if (box(this.player.x + vx, this.player.y)) this.player.x += vx;
      if (box(this.player.x, this.player.y + vy)) this.player.y += vy;
      if (vx) this.player.setFlipX(vx < 0);
    } else if (this.playerPath?.length) this.step(this.player, this.playerPath, speed) || (this.playerPath = null);
    const pl = this.playerPath?.length || 0;
    if (pl !== this.lastPathLen) {
      this.lastPathLen = pl; this.pathG.clear();
      if (pl) { this.pathG.fillStyle(0xffd23f, 0.7); this.playerPath.forEach((pt, i) => { if (i % 2 === 0) this.pathG.fillCircle(pt.x, pt.y, 4); }); }
    }
    for (const n of this.npcs.values()) {
      if (n.path?.length) { if (!this.step(n.s, n.path, 180 * dt / 1000)) n.path = null; }
      n.emo.setPosition(n.s.x, n.s.y - 26);
    }
    this.playerTag.setPosition(this.player.x, this.player.y - 34);
    this.dot.setPosition(this.player.x, this.player.y);
    // nearest agent
    let best = null, bd = 60;
    for (const n of this.npcs.values()) { const d = Math.abs(n.s.x - this.player.x) + Math.abs(n.s.y - this.player.y); if (d < bd) { bd = d; best = n; } }
    this.nearNPC = best;
    this.inRoom = ROOMS.find(r => r.meeting && this.player.x > r.x && this.player.x < r.x + r.w && this.player.y > r.y && this.player.y < r.y + r.h) || null;
    if (best) {
      if (this.tagFor !== best) { this.tagFor = best; this.nameTag.setText(`${best.e.no} · ${best.e.title}`); }
      this.nameTag.setPosition(best.s.x, best.s.y - 34).setVisible(true);
    } else this.nameTag.setVisible(false);
    const tips = [];
    if (best) tips.push(`اضغط <kbd>E</kbd> للتحدث / التفتيش: <b>${best.e.title}</b>`);
    if (this.inRoom) tips.push(`اضغط <kbd>R</kbd> لإدارة ${this.inRoom.label}`);
    const nearLocked = this.crisisOn && ROOMS.some(r => r.meeting && Math.abs(this.player.x - (r.x + r.w / 2)) < 90 && Math.abs(this.player.y - (r.y + r.h)) < 70);
    if (nearLocked) tips.push('🚨 القاعة مقفلة: اجتماع طوارئ لكارثة الفرحة');
    const prompt = this.panel ? '' : tips.join(' · ');
    if (prompt !== this.lastPrompt) { this.lastPrompt = prompt; ui.showPrompt(prompt || null); }
  }
  step(obj, path, speed) {
    const t = path[0], dx = t.x - obj.x, dy = t.y - obj.y, d = Math.hypot(dx, dy);
    if (d <= speed) { obj.setPosition(t.x, t.y); path.shift(); return path.length > 0; }
    obj.x += dx / d * speed; obj.y += dy / d * speed;
    if (Math.abs(dx) > 1) obj.setFlipX(dx < 0);
    return true;
  }
}

// ── boot ──
(async () => {
  const msg = document.getElementById('loading-msg');
  try {
    if (!window.Phaser) throw new Error('ما انحمل محرك Phaser');
    const org = await data.init();
    msg.textContent = `انحمل ${org.length} موظف… نجيب حالتهم`;
    const state = await data.loadState();
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent: 'game', backgroundColor: '#0b0d12',
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      render: { antialias: true }, scene: []
    });
    game.scene.add('office', Office, true, { org, state });
    window.__office = game;
  } catch (e) {
    msg.textContent = `⚠️ ${e.message}`;
  }
})();
