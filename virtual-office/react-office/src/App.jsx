import { useCallback, useEffect, useRef, useState } from 'react';
import PhaserGame from './game/PhaserGame.jsx';
import { bus } from './eventBus.js';
import { api } from './n8n.js';
import { zoneById, LEADS } from './officeLayout.js';

const POLL_MS = Number(import.meta.env.VITE_POLL_MS) || 10000;
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export default function App() {
  const [state, setState] = useState(null);
  const [conn, setConn] = useState('connecting');
  const [connErr, setConnErr] = useState('');
  const [zoneId, setZoneId] = useState(null);
  const [near, setNear] = useState(null);
  const [log, setLog] = useState([]);
  const stateRef = useRef(null);

  const addLog = useCallback((text, kind = 'info') => {
    setLog((l) => [{ at: new Date().toISOString(), text, kind }, ...l].slice(0, 40));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const st = await api.getState();
      stateRef.current = st;
      setState(st);
      setConn('online');
      setConnErr('');
      bus.emit('state', st);
    } catch (e) {
      setConn('offline');
      setConnErr(e.message);
    }
  }, []);

  useEffect(() => {
    const onInteract = (id) => setZoneId(id);
    const onNear = (id) => setNear(id);
    const onReady = () => stateRef.current && bus.emit('state', stateRef.current);
    bus.on('interact', onInteract);
    bus.on('near-zone', onNear);
    bus.on('scene-ready', onReady);
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => {
      clearInterval(t);
      bus.off('interact', onInteract);
      bus.off('near-zone', onNear);
      bus.off('scene-ready', onReady);
    };
  }, [refresh]);

  const zone = zoneId ? zoneById(zoneId) : null;
  const crisis = state?.mode === 'CODE_RED_JOY_CRISIS';

  return (
    <div className={`app ${crisis ? 'crisis' : ''}`}>
      <Hud state={state} conn={conn} connErr={connErr} onRefresh={refresh} />
      <main>
        <section className="map"><PhaserGame /></section>
        <aside>
          {zone
            ? <ZonePanel zone={zone} state={state} onClose={() => setZoneId(null)} addLog={addLog} refresh={refresh} />
            : <Welcome near={near} />}
          <EventsFeed state={state} log={log} />
        </aside>
      </main>
    </div>
  );
}

function Hud({ state, conn, connErr, onRefresh }) {
  const j = state?.joy_meter || {};
  return (
    <header className="hud">
      <strong className="brand">QD المكتب الافتراضي</strong>
      <span className={`pill ${state?.mode === 'CODE_RED_JOY_CRISIS' ? 'red' : 'green'}`}>{state?.mode || '—'}</span>
      <span className="pill">الوردية: {state?.active_shift || '—'}</span>
      <span className="pill">التارقت: {state?.target_kwd ?? '—'} د.ك</span>
      <div className="joy">
        <JoyBar label="لعبتنا" v={j.ours} cls="ours" />
        <JoyBar label="سين جيم" v={j.sinjim} cls="rival" />
        <JoyBar label="مخمخ" v={j.mukhmukh} cls="rival" />
      </div>
      <button className="ghost" onClick={onRefresh} title={connErr || api.base}>
        <span className={`dot ${conn}`} /> {conn === 'online' ? 'متصل بـ n8n' : conn === 'offline' ? 'غير متصل' : '...'}
      </button>
    </header>
  );
}

function JoyBar({ label, v = 0, cls }) {
  return (
    <div className="joybar">
      <span>{label}</span>
      <div className="track"><div className={`fill ${cls}`} style={{ width: `${Math.min(100, Number(v) || 0)}%` }} /></div>
      <span className="num">{Number(v) || 0}%</span>
    </div>
  );
}

function Welcome({ near }) {
  const z = near ? zoneById(near) : null;
  return (
    <div className="panel">
      <h3>أهلاً بالمدير التنفيذي</h3>
      <p>تحرك بالأسهم أو WASD. اقترب من أي قسم واضغط <kbd>E</kbd>، أو اضغط على القسم نفسه.</p>
      <ul className="hints">
        <li>الخلايا 1-10: تشغيل خط إنتاج الأسئلة (Workflow 01)</li>
        <li>مختبر المتعة: اختبار الفرحة ضد المنافسين (Workflow 02)</li>
        <li>الابتكار / HR / التسويق / المدرب: محرك النمو (Workflow 03)</li>
        <li>مدير الأعمال والقاعات: Workflow 04</li>
      </ul>
      {z && <p className="near">أنت بجانب: {z.label}</p>}
    </div>
  );
}

function useRunner(addLog, refresh) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const run = async (label, fn) => {
    setBusy(true);
    setResult(null);
    addLog(`بدأ: ${label}`);
    try {
      const r = await fn();
      setResult({ ok: true, data: r });
      addLog(`تم: ${label}`, 'ok');
      refresh();
      return r;
    } catch (e) {
      setResult({ ok: false, data: e.message });
      addLog(`خطأ: ${label} - ${e.message}`, 'err');
    } finally {
      setBusy(false);
    }
  };
  return { busy, result, run };
}

function ZonePanel({ zone, state, onClose, addLog, refresh }) {
  const props = { zone, state, addLog, refresh };
  const body = {
    cell: <CellPanel {...props} />,
    joy: <JoyPanel {...props} />,
    growth: <GrowthPanel {...props} />,
    room: <RoomPanel {...props} />,
    manager: <ChatPanel {...props} />,
    ceo: <ChatPanel {...props} />,
    board: <BoardPanel {...props} />
  }[zone.kind];
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{zone.label}</h3>
        <button className="ghost" onClick={onClose}>✕</button>
      </div>
      {body}
    </div>
  );
}

function Result({ result }) {
  if (!result) return null;
  const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
  return <pre className={`result ${result.ok ? 'ok' : 'err'}`}>{text.slice(0, 4000)}</pre>;
}

function CellPanel({ zone, state, addLog, refresh }) {
  const [category, setCategory] = useState('معلومات عامة');
  const [count, setCount] = useState(10);
  const { busy, result, run } = useRunner(addLog, refresh);
  const resting = state && state.active_shift !== zone.shift;
  return (
    <>
      <p>الفريق: محلل منافسين ← كاتب أسئلة ← باحث صور ← مدقق حقائق ← مراقب العمليات.</p>
      {resting && <p className="warn">هذه الخلية في استراحة الآن (وردية {zone.shift}). ستعمل استثنائياً لأنك طلبتها بالاسم.</p>}
      <label>الفئة<input value={category} onChange={(e) => setCategory(e.target.value)} /></label>
      <label>عدد الأسئلة (1-20)<input type="number" min="1" max="20" value={count} onChange={(e) => setCount(e.target.value)} /></label>
      <button disabled={busy} onClick={() => run(`خط إنتاج ${zone.id}`, () => api.runCellPipeline({ category, count, shift: zone.shift, cell_id: zone.id }))}>
        {busy ? 'جاري الإنتاج... (قد يستغرق دقائق)' : 'ابدأ الإنتاج'}
      </button>
      <Result result={result} />
    </>
  );
}

function JoyPanel({ addLog, refresh, state }) {
  const [spec, setSpec] = useState('');
  const [rounds, setRounds] = useState(3);
  const { busy, result, run } = useRunner(addLog, refresh);
  return (
    <>
      <p>9 لاعبين و 5 محللي سعادة (محاكاة بالذكاء الاصطناعي) يقارنون لعبتنا بـ سين جيم و مخمخ. إذا تفوق منافس يبدأ CODE_RED وتُقفل القاعات، وكل جولة تنتظر موافقتك عبر Telegram.</p>
      {state?.joy_round ? <p>الجولة الحالية: {state.joy_round}</p> : null}
      <label>وصف لعبتنا (اختياري)<textarea rows="3" value={spec} onChange={(e) => setSpec(e.target.value)} /></label>
      <label>أقصى عدد للجولات (1-5)<input type="number" min="1" max="5" value={rounds} onChange={(e) => setRounds(e.target.value)} /></label>
      <button disabled={busy} onClick={() => run('اختبار الفرحة', () => api.runJoyLab({ our_game_spec: spec || undefined, max_rounds: rounds }))}>ابدأ اختبار الفرحة</button>
      <Result result={result} />
    </>
  );
}

function GrowthPanel({ addLog, refresh, state }) {
  const [revenue, setRevenue] = useState('');
  const { busy, result, run } = useRunner(addLog, refresh);
  return (
    <>
      <p>مختبر الابتكار (11) + HR (4) + التسويق (12) + مدرب المهارات (3). التارقت الحالي: <b>{state?.target_kwd ?? 200} د.ك</b>.</p>
      <label>إيراد الشهر (د.ك)<input type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} /></label>
      <button disabled={busy || revenue === ''} onClick={() => run('محرك النمو', () => api.runGrowth({ monthly_revenue_kwd: revenue }))}>شغّل مراجعة النمو</button>
      <Result result={result} />
    </>
  );
}

function RoomPanel({ zone, state, addLog, refresh }) {
  const [topic, setTopic] = useState('');
  const [attendees, setAttendees] = useState([]);
  const [summoned, setSummoned] = useState('');
  const { busy, result, run } = useRunner(addLog, refresh);
  const room = state?.rooms?.[zone.id];
  const locked = !!state?.meeting_rooms_locked;
  const toggle = (n) => setAttendees((a) => (a.includes(n) ? a.filter((x) => x !== n) : [...a, n]));
  return (
    <>
      {locked && <p className="warn">🔒 القاعات مقفلة بسبب CODE_RED_JOY_CRISIS.</p>}
      {room ? <p>اجتماع جارٍ: <b>{room.topic}</b> — {(room.attendees || []).join('، ')}</p> : <p>القاعة متاحة. الدخول للقادة فقط، أو بالاستدعاء بالاسم.</p>}
      <label>الموضوع<input value={topic} onChange={(e) => setTopic(e.target.value)} /></label>
      <div className="chips">
        {LEADS.map((n) => <button key={n} className={`chip ${attendees.includes(n) ? 'on' : ''}`} onClick={() => toggle(n)}>{n}</button>)}
      </div>
      <label>استدعاء موظفين بالاسم (مفصولة بفاصلة)<input value={summoned} onChange={(e) => setSummoned(e.target.value)} /></label>
      <div className="row">
        <button disabled={busy} onClick={() => run(`اجتماع ${zone.id}`, () => api.meeting({ room: zone.id, action: 'open', topic: topic || undefined, attendees, summoned_names: summoned.split(/[,،]/).map((s) => s.trim()).filter(Boolean) }))}>افتح الاجتماع</button>
        {room && <button className="secondary" disabled={busy} onClick={() => run(`إنهاء ${zone.id}`, () => api.meeting({ room: zone.id, action: 'close' }))}>أنهِ الاجتماع</button>}
      </div>
      <Result result={result} />
    </>
  );
}

function ChatPanel({ addLog }) {
  const [msgs, setMsgs] = useState([{ from: 'مدير الأعمال', text: 'هلا طال عمرك، شلون أقدر أخدمك اليوم؟' }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs]);
  const send = async () => {
    const m = text.trim();
    if (!m || busy) return;
    setText('');
    setMsgs((x) => [...x, { from: 'أنت', text: m, me: true }]);
    setBusy(true);
    try {
      const r = await api.askCEO(m);
      setMsgs((x) => [...x, { from: r.from || 'مدير الأعمال', text: r.reply || JSON.stringify(r) }]);
    } catch (e) {
      setMsgs((x) => [...x, { from: 'النظام', text: e.message, err: true }]);
      addLog(`خطأ في المحادثة: ${e.message}`, 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="chat">
      <div className="msgs">
        {msgs.map((m, i) => <div key={i} className={`msg ${m.me ? 'me' : ''} ${m.err ? 'err' : ''}`}><b>{m.from}</b><p>{m.text}</p></div>)}
        {busy && <div className="msg"><p>...</p></div>}
        <div ref={end} />
      </div>
      <div className="row">
        <input value={text} placeholder="اكتب لمدير أعمالك..." onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button disabled={busy} onClick={send}>إرسال</button>
      </div>
    </div>
  );
}

function BoardPanel({ state }) {
  const ev = [...(state?.events || [])].reverse();
  return ev.length
    ? <ul className="events">{ev.map((e, i) => <li key={i}><span>{e.icon || '•'}</span> {e.title} <small>{e.source} · {fmtTime(e.at)}</small></li>)}</ul>
    : <p>لا توجد تقارير بعد.</p>;
}

function EventsFeed({ state, log }) {
  const ev = [...(state?.events || [])].reverse().slice(0, 8);
  return (
    <div className="panel feed">
      <h4>آخر الأحداث</h4>
      <ul className="events">
        {ev.map((e, i) => <li key={`e${i}`}><span>{e.icon || '•'}</span> {e.title} <small>{fmtTime(e.at)}</small></li>)}
        {!ev.length && <li className="muted">لا شيء بعد</li>}
      </ul>
      <h4>سجل المكتب</h4>
      <ul className="events log">
        {log.map((l, i) => <li key={`l${i}`} className={l.kind}>{l.text} <small>{fmtTime(l.at)}</small></li>)}
      </ul>
    </div>
  );
}
