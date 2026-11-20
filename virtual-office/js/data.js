// Loads the live company state: from the local server (the QD checkout) or, when opened elsewhere, from GitHub (the repo is public).
export const REPO = 'jasskwty/QD', BRANCH = 'claude/multi-agent-company-9dst9p';
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
export const GH_BLOB = `https://github.com/${REPO}/blob/${BRANCH}/`;
export const GH_TREE = `https://github.com/${REPO}/tree/${BRANCH}/`;

let base = null;
export const source = () => (base === '../' ? 'محلي' : base === './' ? 'نسخة منشورة' : base ? 'GitHub' : '—');

async function json(path, fallback) {
  try {
    const r = await fetch(base + path + (base === RAW ? `?t=${Date.now()}` : ''), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch { return fallback; }
}
export async function text(path) {
  try { const r = await fetch(base + path, { cache: 'no-store' }); return r.ok ? await r.text() : ''; } catch { return ''; }
}

export async function init() {
  for (const b of ['../', RAW, './']) {  // local server, GitHub, or a copy published beside the page
    try { const r = await fetch(b + 'company/org.json', { cache: 'no-store' }); if (r.ok) { base = b; return await r.json(); } } catch { /* next */ }
  }
  throw new Error('ما قدرت أقرا company/org.json محلياً ولا من GitHub');
}

export async function loadState() {
  const [status, agents, roster, allowance, backlog, departments] = await Promise.all([
    json('company/office/status.json', {}), json('company/office/agents-status.json', {}),
    json('company/hr/roster.json', {}), json('company/hr/allowance.json', {}), text('company/backlog.md'),
    json('company/departments.json', [])
  ]);
  const open = backlog.split('\n').filter(l => /^\|\s*T-\d+/.test(l) && /⏳|🔄/.test(l))
    .map(l => l.split('|').map(s => s.trim())).map(c => ({ id: c[1], task: c[2], owner: c[4], due: c[5], state: c[6] }));
  return { status, agents, roster, allowance, open, departments, loadedAt: new Date() };
}

let server = null;
export async function chatAvailable() {
  if (server !== null) return server;
  try { const r = await fetch('/api/health'); server = r.ok && (await r.json()).chat === true; } catch { server = false; }
  return server;
}
export async function chat(agent, messages) {
  const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent, messages }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.status);
  return j.reply;
}
export async function meeting(attendees, message, transcript) {
  const r = await fetch('/api/meeting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attendees, message, transcript }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.status);
  return j.replies;
}
