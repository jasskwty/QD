import Phaser from 'phaser';
import { bus } from '../eventBus.js';
import { WORLD, SPAWN, ZONES } from '../officeLayout.js';

const TXT = (size, color = '#e2e8f0') => ({ fontFamily: 'Tahoma, Arial', fontSize: `${size}px`, color, rtl: true });
const SPEED = 260;
const INTERACT_DIST = 40;

export default class OfficeScene extends Phaser.Scene {
  constructor() {
    super('Office');
    this.zoneViews = {};
    this.seenEvents = new Set();
    this.state = null;
  }

  create() {
    this.makeTextures();
    this.physics.world.setBounds(0, 0, WORLD.w, WORLD.h);
    this.drawFloor();
    ZONES.forEach((z) => this.buildZone(z));

    this.player = this.physics.add.sprite(SPAWN.x, SPAWN.y, 'ceo').setCollideWorldBounds(true).setDepth(10);
    this.playerLabel = this.add.text(0, 0, 'أنت (المدير)', TXT(12, '#fde68a')).setOrigin(0.5).setDepth(11);

    this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h).startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setBackgroundColor('#0b1220');

    // enableCapture=false so typing in React inputs keeps working
    this.keys = this.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,E', false);

    const cam = this.cameras.main;
    this.crisisOverlay = this.add.rectangle(0, 0, cam.width, cam.height, 0xdc2626, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(50);
    this.prompt = this.add.text(cam.width / 2, cam.height - 28, '', { ...TXT(15, '#fff'), backgroundColor: '#000a', padding: { x: 10, y: 5 } })
      .setOrigin(0.5).setScrollFactor(0).setDepth(60);
    this.scale.on('resize', (size) => {
      this.crisisOverlay.setSize(size.width, size.height);
      this.prompt.setPosition(size.width / 2, size.height - 28);
    });

    this.input.on('gameobjectdown', (_p, obj) => obj.zoneId && this.interact(obj.zoneId));

    bus.on('state', this.applyState, this);
    bus.on('flash-zone', this.flashZone, this);
    this.events.once('shutdown', () => {
      bus.off('state', this.applyState, this);
      bus.off('flash-zone', this.flashZone, this);
    });
    bus.emit('scene-ready');
  }

  makeTextures() {
    const g = this.add.graphics();
    const dot = (key, fill, r, ring = 0xffffff) => {
      g.clear();
      g.fillStyle(ring, 1).fillCircle(r + 2, r + 2, r + 2);
      g.fillStyle(fill, 1).fillCircle(r + 2, r + 2, r);
      g.generateTexture(key, (r + 2) * 2, (r + 2) * 2);
    };
    dot('ceo', 0xfacc15, 13, 0x1e3a8a);
    dot('agent', 0x93c5fd, 8);
    dot('player', 0xfb923c, 8);
    dot('lead', 0x34d399, 9);
    g.clear().fillStyle(0xffffff, 1).fillRect(0, 0, 6, 6).generateTexture('confetti', 6, 6);
    g.destroy();
  }

  drawFloor() {
    const g = this.add.graphics();
    g.fillStyle(0x111827, 1).fillRect(0, 0, WORLD.w, WORLD.h);
    g.lineStyle(1, 0x1f2937, 1);
    for (let x = 0; x < WORLD.w; x += 40) g.lineBetween(x, 0, x, WORLD.h);
    for (let y = 0; y < WORLD.h; y += 40) g.lineBetween(0, y, WORLD.w, y);
  }

  buildZone(z) {
    const box = this.add.rectangle(z.x, z.y, z.w, z.h, z.color, 0.28).setOrigin(0)
      .setStrokeStyle(2, z.color, 1).setInteractive({ useHandCursor: true });
    box.zoneId = z.id;
    const label = this.add.text(z.x + z.w - 8, z.y + 6, z.label, TXT(13)).setOrigin(1, 0);
    const status = this.add.text(z.x + z.w - 8, z.y + 24, '', TXT(11, '#cbd5e1')).setOrigin(1, 0);
    const agents = (z.agents || []).map((name, i) => this.spawnAgent(z, name, i));
    this.zoneViews[z.id] = { z, box, label, status, agents };
  }

  spawnAgent(z, name, i) {
    const tex = z.kind === 'joy' && i < 9 ? 'player' : z.kind === 'manager' ? 'lead' : 'agent';
    const pad = 22;
    const rx = () => Phaser.Math.Between(z.x + pad, z.x + z.w - pad);
    const ry = () => Phaser.Math.Between(z.y + 46, z.y + z.h - pad);
    const s = this.add.image(rx(), ry(), tex).setDepth(5);
    const t = this.add.text(s.x, s.y + 12, name, TXT(9, '#94a3b8')).setOrigin(0.5, 0).setDepth(5);
    const wander = () => {
      if (!s.active) return;
      const x = rx(), y = ry();
      this.tweens.add({ targets: s, x, y, duration: Phaser.Math.Between(2500, 6000), ease: 'Sine.inOut',
        onUpdate: () => t.setPosition(s.x, s.y + 12),
        onComplete: () => this.time.delayedCall(Phaser.Math.Between(400, 3000), wander) });
    };
    if (z.kind !== 'manager') this.time.delayedCall(Phaser.Math.Between(0, 2000), wander);
    return { s, t };
  }

  update() {
    const k = this.keys;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    let vx = 0, vy = 0;
    if (!typing) {
      if (k.LEFT.isDown || k.A.isDown) vx = -1; else if (k.RIGHT.isDown || k.D.isDown) vx = 1;
      if (k.UP.isDown || k.W.isDown) vy = -1; else if (k.DOWN.isDown || k.S.isDown) vy = 1;
    }
    const v = new Phaser.Math.Vector2(vx, vy).normalize().scale(SPEED);
    this.player.setVelocity(v.x, v.y);

    this.blockLockedRooms();
    this.playerLabel.setPosition(this.player.x, this.player.y - 24);

    const near = this.nearestZone();
    if (near?.id !== this.near?.id) {
      this.near = near;
      bus.emit('near-zone', near ? near.id : null);
    }
    this.prompt.setText(near ? `E: ${near.label}` : 'تحرك بالأسهم أو WASD، واضغط E عند أي قسم');
    if (!typing && near && Phaser.Input.Keyboard.JustDown(k.E)) this.interact(near.id);
  }

  nearestZone() {
    const { x, y } = this.player;
    return ZONES.find((z) => x > z.x - INTERACT_DIST && x < z.x + z.w + INTERACT_DIST && y > z.y - INTERACT_DIST && y < z.y + z.h + INTERACT_DIST) || null;
  }

  // During CODE_RED the meeting rooms are locked: the CEO avatar cannot walk in.
  blockLockedRooms() {
    if (!this.state?.meeting_rooms_locked) return;
    const p = this.player;
    for (const z of ZONES) {
      if (z.kind !== 'room') continue;
      if (p.x > z.x && p.x < z.x + z.w && p.y > z.y && p.y < z.y + z.h) {
        p.y = z.y + z.h + 16;
        p.setVelocityY(0);
        this.flashZone(z.id);
      }
    }
  }

  interact(zoneId) {
    bus.emit('interact', zoneId);
  }

  flashZone(zoneId) {
    const v = this.zoneViews[zoneId];
    if (!v || v.flashing) return;
    v.flashing = true;
    this.tweens.add({ targets: v.box, fillAlpha: 0.75, yoyo: true, repeat: 2, duration: 180,
      onComplete: () => { v.flashing = false; v.box.setFillStyle(v.box.fillColor, 0.28); } });
  }

  floatIcon(zoneId, icon) {
    const v = this.zoneViews[zoneId] || this.zoneViews.board;
    const { z } = v;
    const t = this.add.text(z.x + z.w / 2, z.y + z.h / 2, icon || '✅', { fontSize: '34px' }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: t.y - 70, alpha: 0, duration: 2200, onComplete: () => t.destroy() });
    this.flashZone(v.z.id);
  }

  celebrate() {
    const cam = this.cameras.main;
    const colors = [0xfacc15, 0x3b82f6, 0xffffff, 0x22c55e];
    const p = this.add.particles(0, 0, 'confetti', {
      x: { min: 0, max: cam.width }, y: -10, lifespan: 3500, speedY: { min: 120, max: 260 }, speedX: { min: -60, max: 60 },
      rotate: { min: 0, max: 360 }, tint: colors, quantity: 6, frequency: 40
    }).setScrollFactor(0).setDepth(55);
    this.time.delayedCall(2500, () => p.stop());
    this.time.delayedCall(6500, () => p.destroy());
  }

  applyState(st) {
    const prev = this.state;
    this.state = st;

    // Shifts: resting cells are dimmed
    for (const z of ZONES.filter((x) => x.kind === 'cell')) {
      const v = this.zoneViews[z.id];
      const on = z.shift === st.active_shift;
      v.box.setAlpha(on ? 1 : 0.35);
      v.agents.forEach(({ s, t }) => { s.setAlpha(on ? 1 : 0.25); t.setAlpha(on ? 1 : 0.25); });
      v.status.setText(on ? 'على رأس العمل' : 'استراحة');
    }

    // Meeting rooms
    for (const id of ['room_1', 'room_2', 'room_3', 'room_4']) {
      const v = this.zoneViews[id];
      const r = st.rooms?.[id];
      const locked = !!st.meeting_rooms_locked;
      v.box.setStrokeStyle(locked ? 4 : 2, locked ? 0xef4444 : v.z.color, 1);
      v.status.setText((locked ? '🔒 مقفلة (CODE_RED)\n' : '') + (r ? `${r.topic}\n${(r.attendees || []).join('، ')}` : 'متاحة'));
    }

    // Crisis mode: pulsing red overlay
    const crisis = st.mode === 'CODE_RED_JOY_CRISIS';
    if (crisis && !this.crisisTween) {
      this.crisisTween = this.tweens.add({ targets: this.crisisOverlay, fillAlpha: { from: 0.05, to: 0.22 }, yoyo: true, repeat: -1, duration: 700 });
    } else if (!crisis && this.crisisTween) {
      this.crisisTween.stop();
      this.crisisTween = null;
      this.crisisOverlay.setFillStyle(0xdc2626, 0);
    }

    const j = st.joy_meter || {};
    this.zoneViews.joy.status.setText(`لعبتنا ${j.ours ?? 0}% | سين جيم ${j.sinjim ?? 0}% | مخمخ ${j.mukhmukh ?? 0}%`);
    this.zoneViews.board.status.setText(st.last_report ? `${st.last_report.icon || ''} ${st.last_report.title}` : 'لا توجد تقارير بعد');

    // New events -> floating icon on the matching zone
    const events = st.events || [];
    const firstLoad = !prev;
    for (const e of events) {
      const key = `${e.at}|${e.title}`;
      if (this.seenEvents.has(key)) continue;
      this.seenEvents.add(key);
      if (firstLoad) continue;
      const cell = e.cell_id || (String(e.title).match(/cell_\d{2}/) || [])[0];
      const zone = cell || (e.source === '02_joy_lab' ? 'joy' : e.source === '03_growth_engine' ? 'marketing' : e.source === 'meeting' ? 'room_1' : 'board');
      this.floatIcon(zone, e.icon);
    }

    if (st.celebrate && !(prev && prev.celebrate)) this.celebrate();
  }
}
