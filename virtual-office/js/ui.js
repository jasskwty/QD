// DOM layer of the office: HUD, prompts, the employee panel, meeting room panel, priorities, crisis banner.
import * as data from './data.js';
import { LEADERS } from './layout.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let ctx = null;            // callbacks + org from the game
const chats = new Map();   // agent id → [{role, content}]

export const STATE_LABEL = { working: '💻 يشتغل', reviewing: '🔍 يدقق', inventing: '💡 يبتكر', done: '✅ خلّص', late: '⚠️ متأخر' };

export function initUI(c) {
  ctx = c;
  $('#btn-priorities').onclick = () => ctx.onPriorities();
  $('#btn-travel').onclick = () => openTravel();
  $('#btn-sprint').onclick = () => { const on = ctx.toggleSprint(); $('#btn-sprint').classList.toggle('on', on); toast(on ? '🏃 الركض شغال' : '🚶 مشي عادي'); };
  $('#btn-zoom-in').onclick = () => ctx.zoom(0.15);
  $('#btn-zoom-out').onclick = () => ctx.zoom(-0.15);
  setupStick();
  $('#btn-emergency').onclick = () => ctx.onEmergency();
  $('#btn-sound').onclick = () => { const on = ctx.toggleSound(); $('#btn-sound').textContent = on ? '🔊' : '🔈'; };
  $('#panel-close').onclick = closePanel;
  $('#prompt').onclick = () => ctx.onPromptTap();  // phones have no E/R keys: tap the hint instead
  const list = $('#people');
  list.innerHTML = ctx.org.map(e => `<option value="${esc(e.no)} ${esc(e.title)}"></option>`).join('');
  $('#search').addEventListener('change', (ev) => {
    const no = ev.target.value.split(' ')[0];
    const e = ctx.org.find(x => x.no === no);
    if (e) { ctx.onGoTo(e.id); ev.target.value = ''; ev.target.blur(); }
  });
  // typing in any field must not move the CEO
  document.addEventListener('focusin', (ev) => { if (ev.target.matches('input, textarea')) ctx.setTyping(true); });
  document.addEventListener('focusout', (ev) => { if (ev.target.matches('input, textarea')) ctx.setTyping(false); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closePanel(); });
}

const pct = (v) => (typeof v === 'number' ? `${Math.round(v)}%` : '—');
export function updateHUD(state, shift) {
  const j = state.status.joy || {};
  const games = [['diwaniya', 'الديوانية'], ['seenjeem', 'سين جيم'], ['makhmakh', 'مخمخ']];
  const vals = games.map(([k]) => j[k]);
  const top = Math.max(...vals.filter(v => typeof v === 'number'), -1);
  $('#joy').innerHTML = games.map(([k, name], i) => {
    const v = vals[i];
    const lead = typeof v === 'number' && v === top;
    return `<div class="joy-row ${k === 'diwaniya' ? 'ours' : ''} ${lead ? 'lead' : ''}"><span class="joy-name">${name}</span>
      <span class="joy-bar"><i style="width:${typeof v === 'number' ? Math.max(2, Math.min(100, v)) : 0}%"></i></span><b>${pct(v)}</b></div>`;
  }).join('') + (j.updated ? '' : '<div class="muted small">ما فيه قياس بعد: مختبر الفرحة ما لعب لين الحين</div>');
  const f = state.status.finance || {};
  const achieved = typeof f.achieved === 'number' ? f.achieved : null;
  $('#finance').innerHTML = `<span class="lbl">🎯 التارقت (المستوى ${f.level ?? 1})</span><b>${achieved ?? '—'} / ${f.target ?? 200} ${esc(f.currency || 'د.ك')}</b>
    <span class="joy-bar gold"><i style="width:${achieved && f.target ? Math.min(100, achieved / f.target * 100) : 0}%"></i></span>`;
  const t = state.status.tokens || {};
  $('#tokens').innerHTML = `<span class="lbl">⚡ توفير التوكنز</span><b>${pct(t.saving_pct)}</b>`;
  const working = Object.values(state.agents || {}).filter(a => ['working', 'reviewing', 'inventing'].includes(a.state)).length;
  $('#shift').innerHTML = `<span class="lbl">🕒 ${kuwaitTime()} · شفت ${shift}</span><b>${working} يشتغل الحين</b>`;
  $('#source').textContent = `البيانات: ${data.source()} · آخر تحديث ${state.loadedAt.toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit' })}`;
}
export function kuwaitTime() {
  return new Date().toLocaleTimeString('ar-KW', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit' });
}

export function setCrisisBanner(crisis) {
  const b = $('#banner');
  if (crisis?.active) {
    b.hidden = false;
    b.innerHTML = `🚨 <b>كارثة الفرحة (JOY CRISIS)</b> · ${esc(crisis.reason || 'منافس متفوق في مؤشر الفرحة')} · الجولة ${crisis.rounds ?? 0} · القاعات مقفلة لين نرجع الأولين`;
  } else b.hidden = true;
}

export function showPrompt(html) {
  const p = $('#prompt');
  if (!html) { p.hidden = true; return; }
  p.hidden = false; p.innerHTML = html;
}

export function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms);
}

function openPanel(html) { $('#panel-body').innerHTML = html; $('#panel').hidden = false; ctx.setPanelOpen(true); }
export function closePanel() { $('#panel').hidden = true; ctx?.setPanelOpen(false); }
export const panelOpen = () => !$('#panel').hidden;

// ── quick travel ──
function openTravel() {
  const list = ctx.travelList();
  openPanel(`<div class="agent-head"><h2>🧭 انتقال سريع</h2><div class="muted small">اختر مكان وتنتقل له فوراً. (الضغط على الخريطة الصغيرة ينقلك بعد.)</div></div>
    <div class="travel">${list.map(d => `<button data-travel="${esc(d.key)}" class="${d.key.startsWith('dept:') ? 'live' : ''}">${esc(d.label)}</button>`).join('')}</div>`);
  document.querySelectorAll('[data-travel]').forEach(b => b.onclick = () => { closePanel(); ctx.onTravel(b.dataset.travel); });
}

// ── department meetings running now ──
export function setDeptMeetings(list) {
  const el = $('#dept-live'); if (!el) return;
  el.innerHTML = `<div class="lbl">🗣️ اجتماعات الأقسام الحين (${list.length})</div>` +
    list.map(m => `<button data-travel="${esc(m.key)}" title="روح للاجتماع">${esc(m.label.replace(/^خلية فئة /, 'خلية '))} · ${m.n}</button>`).join('');
  el.querySelectorAll('[data-travel]').forEach(b => b.onclick = () => ctx.onTravel(b.dataset.travel));
}

// ── on-screen joystick for phones ──
function setupStick() {
  const base = $('#stick'), knob = $('#stick i');
  if (!base) return;
  if (!(matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)) { base.hidden = true; return; }
  base.hidden = false;
  let id = null;
  const R = 46;
  const move = (ev) => {
    const r = base.getBoundingClientRect();
    let dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy); if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    ctx.setStick(dx / R, dy / R);
  };
  base.addEventListener('pointerdown', (ev) => { id = ev.pointerId; base.setPointerCapture(id); move(ev); ev.preventDefault(); });
  base.addEventListener('pointermove', (ev) => { if (ev.pointerId === id) move(ev); });
  const end = (ev) => { if (ev.pointerId !== id) return; id = null; knob.style.transform = ''; ctx.setStick(0, 0); };
  base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end);
}

// ── employee panel ──
export function openAgent(e, state) {
  const a = state.agents?.[e.id] || {};
  const sup = ctx.byId[e.sup];
  const spent = state.allowance?.spent?.[e.id];
  const allowance = state.allowance?.allowance_kd ?? 1;
  const promoted = (state.roster?.promoted || []).includes(e.id);
  const workDir = `company/work/${e.cslug}/` + (e.cslug === 'categories' ? (e.id.match(/^cat-\d+/)?.[0] || '') : e.id);
  const isBM = e.id === 'ceo-business-manager';
  openPanel(`
    <div class="agent-head"><span class="no">${esc(e.no)}</span><h2>${esc(e.title)}</h2><div class="muted">${esc(e.en || '')}</div></div>
    <table class="facts">
      <tr><th>القسم</th><td>${esc(e.committee)} · ${esc(e.sector)} ${e.dept ? `<span class="muted">(${esc(e.dept)})</span>` : ''}</td></tr>
      ${e.focus ? `<tr><th>التخصص</th><td>${esc(e.focus)}</td></tr>` : ''}
      <tr><th>يرفع إلى</th><td>${sup ? `<a href="#" data-goto="${esc(sup.id)}">${esc(sup.no)} ${esc(sup.title)}</a>` : 'المالك'}</td></tr>
      <tr><th>يشرف على</th><td>${(e.supervises || []).length ? `${e.supervises.length} موظف` : '—'}</td></tr>
      <tr><th>الشفت · النموذج</th><td>${esc(e.shift)} · ${esc(e.model)}</td></tr>
      <tr><th>الحالة الحين</th><td>${a.state ? `${STATE_LABEL[a.state] || esc(a.state)} ${a.task ? '· ' + esc(a.task) : ''} ${a.at ? `<span class="muted">(${esc(a.at)})</span>` : ''}` : '<span class="muted">ما سجّل حالة بعد</span>'}</td></tr>
      <tr><th>التقييم</th><td>${typeof a.score === 'number' ? `${a.score}/10 ${a.score >= 9 ? '🔥 شغل نار' : ''}` : '—'} ${promoted ? '⭐ مترقي' : ''}</td></tr>
      <tr><th>العهدة الشهرية</th><td>${allowance} د.ك ${typeof spent === 'number' ? `· صرف ${spent} · باقي ${(allowance - spent).toFixed(3)}` : '<span class="muted">(ما فيه صرف مسجل)</span>'}</td></tr>
    </table>
    <div class="links"><a target="_blank" rel="noopener" href="${data.GH_BLOB}.claude/agents/${esc(e.id)}.md">📄 تعليماته</a>
      <a target="_blank" rel="noopener" href="${data.GH_TREE}${esc(workDir)}">🗂️ شاشة شغله</a>
      ${e.dept ? `<a target="_blank" rel="noopener" href="${data.GH_TREE}company/meetings/departments/${esc(e.dept)}">🗣️ محاضر قسمه</a>` : ''}
      <a href="#" data-summon="${esc(e.id)}">📣 استدعه لقاعة اجتماعات</a></div>
    ${isBM ? prioritiesHTML(state) : ''}
    <div class="chat" id="chat"><h3>💬 كلّمه</h3><div class="log" id="chat-log"></div>
      <form id="chat-form"><input id="chat-in" autocomplete="off" placeholder="${isBM ? 'مثلاً: رتّب لي شغل اليوم' : 'اكتب له…'}"><button>أرسل</button></form></div>`);
  wirePanelLinks();
  if (isBM) $('#btn-arrange')?.addEventListener('click', () => sendChat(e, 'رتّب لي أولويات اليوم من الملخص والمهام المفتوحة، بنقاط مرقمة وقصيرة.'));
  renderChat(e.id);
  $('#chat-form').onsubmit = (ev) => { ev.preventDefault(); const v = $('#chat-in').value.trim(); if (v) { $('#chat-in').value = ''; sendChat(e, v); } };
}

function wirePanelLinks() {
  document.querySelectorAll('[data-goto]').forEach(a => a.onclick = (ev) => { ev.preventDefault(); closePanel(); ctx.onGoTo(a.dataset.goto); });
  document.querySelectorAll('[data-summon]').forEach(a => a.onclick = (ev) => { ev.preventDefault(); closePanel(); ctx.onSummon(null, [a.dataset.summon]); });
}

function renderChat(id) {
  const log = $('#chat-log'); if (!log) return;
  log.innerHTML = (chats.get(id) || []).map(m => `<div class="msg ${m.role}">${esc(m.content).replace(/\n/g, '<br>')}</div>`).join('') || '<div class="muted small">ابدأ الكلام… الرد يجي من الإيجنت نفسه بتعليماته.</div>';
  log.scrollTop = log.scrollHeight;
}

async function sendChat(e, text) {
  const hist = chats.get(e.id) || [];
  hist.push({ role: 'user', content: text }); chats.set(e.id, hist); renderChat(e.id);
  if (!(await data.chatAvailable())) {
    hist.push({ role: 'assistant', content: 'الدردشة الحية تحتاج تشغيل المكتب من server.js مع مفتاح Claude API (شوف SETUP_GUIDE.md).\nأو الصق هذا في Claude Code على فرع الشركة:' });
    renderChat(e.id);
    copyBox(`استخدم الإيجنت ${e.id} وقل له: ${text}`);
    return;
  }
  const typing = { role: 'assistant', content: '… يكتب' }; hist.push(typing); renderChat(e.id);
  try { typing.content = await data.chat(e.id, hist.filter(m => m !== typing)); }
  catch (err) { typing.content = `⚠️ ${err.message}`; }
  renderChat(e.id);
  ctx.onSay(e.id, typing.content);
}

function copyBox(txt) {
  const log = $('#chat-log');
  const box = document.createElement('div'); box.className = 'copy';
  box.innerHTML = `<code>${esc(txt)}</code><button>نسخ</button>`;
  box.querySelector('button').onclick = () => { navigator.clipboard?.writeText(txt).then(() => toast('انسخ ✓'), () => toast('ما قدرت أنسخ: حدد النص وانسخه')); };
  log.appendChild(box); log.scrollTop = log.scrollHeight;
}

// ── priorities (business manager) ──
function prioritiesHTML(state) {
  const brief = state.status.brief || [];
  const j = state.status.joy || {}, f = state.status.finance || {};
  const auto = [
    `أهم إنجاز: ${brief[0] || 'ما فيه ملخص صباحي بعد'}`,
    `مؤشر الفرحة: الديوانية ${pct(j.diwaniya)} · سين جيم ${pct(j.seenjeem)} · مخمخ ${pct(j.makhmakh)}`,
    `التارقت: ${f.achieved ?? '—'} من ${f.target ?? 200} ${f.currency || 'د.ك'}`
  ];
  const items = brief.length >= 3 ? brief.slice(0, 3) : auto;
  return `<div class="prio"><h3>📋 الملخص التنفيذي السريع</h3><ol>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    <h3>المهام المفتوحة (${state.open.length})</h3><ul>${state.open.slice(0, 8).map(t => `<li><b>${esc(t.id)}</b> ${esc(t.task)} <span class="muted">${esc(t.owner)} · ${esc(t.state)}</span></li>`).join('') || '<li class="muted">ما فيه</li>'}</ul>
    <button id="btn-arrange" class="primary">رتّب لي شغلي</button></div>`;
}
export function openPriorities(state) {
  const bm = ctx.byId['ceo-business-manager'];
  if (bm) openAgent(bm, state);
}

// ── meeting room panel ──
const meetings = new Map(); // room id → { attendees:[], transcript:'' }
export function meetingOf(roomId) { if (!meetings.has(roomId)) meetings.set(roomId, { attendees: [], log: [] }); return meetings.get(roomId); }

export function openRoom(room, state) {
  const m = meetingOf(room.id);
  const locked = state.status.crisis?.active;
  openPanel(`
    <div class="agent-head"><h2>${esc(room.label)}</h2>${locked ? '<div class="crisis-tag">🚨 مقفلة: اجتماع طوارئ لكارثة الفرحة</div>' : ''}</div>
    <div class="row">
      <button class="primary" id="summon-leaders">👔 استدعاء قادة المجالات</button>
      <form id="summon-one"><input id="summon-name" list="people" placeholder="استدعاء موظف بالاسم أو الرقم"><button>استدعِ</button></form>
    </div>
    <div class="chips">${m.attendees.map(id => `<span class="chip">${esc(ctx.byId[id]?.no)} ${esc(ctx.byId[id]?.title)}</span>`).join('') || '<span class="muted small">القاعة فاضية</span>'}</div>
    <div class="chat"><h3>🗣️ الاجتماع</h3><div class="log" id="meet-log"></div>
      <form id="meet-form"><textarea id="meet-in" rows="2" placeholder="اكتب للحضور: سؤال، طلب تقرير، أو رؤيتك…"></textarea><button>أرسل للكل</button></form></div>
    ${m.attendees.length && !locked ? '<button id="end-meeting">إنهاء الاجتماع وترجيعهم لمكاتبهم</button>' : ''}`);
  $('#summon-leaders').onclick = () => { ctx.onSummon(room.id, LEADERS.filter(id => ctx.byId[id])); openRoom(room, state); };
  $('#summon-one').onsubmit = (ev) => {
    ev.preventDefault();
    const v = $('#summon-name').value.trim().split(' ')[0];
    const e = ctx.org.find(x => x.no === v || x.id === v);
    if (e) { ctx.onSummon(room.id, [e.id]); openRoom(room, state); } else toast('ما لقيت هالموظف');
  };
  $('#end-meeting')?.addEventListener('click', () => { ctx.onEndMeeting(room.id); m.attendees = []; closePanel(); });
  renderMeeting(room.id);
  $('#meet-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const text = $('#meet-in').value.trim(); if (!text) return;
    if (!m.attendees.length) return toast('استدعِ أحد للقاعة أول');
    $('#meet-in').value = '';
    m.log.push({ who: 'أنت', text }); renderMeeting(room.id);
    if (!(await data.chatAvailable())) {
      m.log.push({ who: 'النظام', text: 'الاجتماع الحي يحتاج server.js مع مفتاح Claude API. أو الصق هذا في Claude Code:' });
      renderMeeting(room.id);
      const box = document.createElement('div'); box.className = 'copy';
      const cmd = `سوّ اجتماع حسب company/MEETING.md مع: ${m.attendees.join('، ')}. الموضوع: ${text}`;
      box.innerHTML = `<code>${esc(cmd)}</code><button>نسخ</button>`;
      box.querySelector('button').onclick = () => { navigator.clipboard?.writeText(cmd).then(() => toast('انسخ ✓'), () => toast('ما قدرت أنسخ: حدد النص وانسخه')); };
      $('#meet-log').appendChild(box);
      return;
    }
    m.log.push({ who: '…', text: `${m.attendees.length} يفكرون` }); renderMeeting(room.id);
    const transcript = m.log.slice(0, -1).map(x => `${x.who}: ${x.text}`).join('\n');
    try {
      const replies = await data.meeting(m.attendees, text, transcript);
      m.log.pop();
      for (const r of replies) { m.log.push({ who: ctx.byId[r.id]?.title || r.id, text: r.text || `⚠️ ${r.error}` }); if (r.text) ctx.onSay(r.id, r.text); }
    } catch (err) { m.log.pop(); m.log.push({ who: 'النظام', text: `⚠️ ${err.message}` }); }
    renderMeeting(room.id);
  };
}
function renderMeeting(roomId) {
  const log = $('#meet-log'); if (!log) return;
  log.innerHTML = meetingOf(roomId).log.map(x => `<div class="msg ${x.who === 'أنت' ? 'user' : 'assistant'}"><b>${esc(x.who)}:</b> ${esc(x.text).replace(/\n/g, '<br>')}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}
