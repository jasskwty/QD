// QD Virtual Office server: serves the game and the company files, and lets the CEO talk to the real agents.
// Run from the QD repo root:  cd virtual-office && npm install && npm start   →  http://localhost:8080/virtual-office/
// Live chat needs ANTHROPIC_API_KEY (or an `ant auth login` profile). Without it the game still runs; chat shows a copy-to-Claude-Code button.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');                 // the QD repo
const AGENTS = path.join(ROOT, '.claude', 'agents');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';

const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
const client = new Anthropic();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function readAgent(id) {
  if (!/^[a-z0-9-]{2,60}$/.test(id)) throw Object.assign(new Error('bad agent id'), { status: 400 });
  const md = await fs.readFile(path.join(AGENTS, `${id}.md`), 'utf8').catch(() => { throw Object.assign(new Error('no such agent'), { status: 404 }); });
  const model = (md.match(/^model:\s*(\w+)/m) || [])[1] || 'sonnet';
  const body = md.replace(/^---[\s\S]*?---\s*/, '');
  return { id, model: MODELS[model] || MODELS.sonnet, body };
}

const OFFICE_NOTE = `أنت الحين داخل المكتب الافتراضي لشركة الديوانية، والمالك (المدير التنفيذي) جا لمكتبك يكلمك أو ناداك لاجتماع.
رد بالعربي بلهجة كويتية خفيفة، مختصر (5 أسطر بالكثير إلا إذا طلب تفصيل)، وبالأرقام الحقيقية اللي تعرفها من ملفاتك بس.
إذا ما تعرف حالة شغلك الحالية بالضبط، قل كذا ولا تخترع. ممكن تطلع روحك الكروية بكلمة، بس الجواب أهم.`;

// One reply from one agent. Sonnet/Opus get the server-side fallback on a policy decline; Haiku has none.
async function ask(agent, messages, extra = '') {
  const params = {
    model: agent.model,
    max_tokens: 2048,
    system: [{ type: 'text', text: agent.body, cache_control: { type: 'ephemeral' } }, { type: 'text', text: OFFICE_NOTE + extra }],
    output_config: { effort: 'low' },
    messages
  };
  const res = agent.model === MODELS.haiku
    ? await client.messages.create(params)
    : await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  if (res.stop_reason === 'refusal') return '(ما قدرت أرد على هذا الطلب)';
  return res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || '…';
}

function cleanMessages(list) {
  return (Array.isArray(list) ? list : []).slice(-20)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

async function readBody(req) {
  let s = '';
  for await (const chunk of req) { s += chunk; if (s.length > 200_000) throw Object.assign(new Error('too big'), { status: 413 }); }
  return JSON.parse(s || '{}');
}

const send = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };

function apiError(e) {
  if (e instanceof Anthropic.AuthenticationError) return [401, 'مفتاح Claude API غلط أو مو موجود'];
  if (e instanceof Anthropic.RateLimitError) return [429, 'وصلنا حد الطلبات، جرّب بعد شوي'];
  if (e instanceof Anthropic.APIConnectionError) return [502, 'ما قدرت أوصل لـ Claude API (تأكد من النت)'];
  if (e instanceof Anthropic.APIError) return [502, `خطأ من Claude API (${e.status})`];
  return [e.status || 500, e.message];
}

async function api(req, res, url) {
  if (url.pathname === '/api/health') return send(res, 200, { chat: hasKey });
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!hasKey) return send(res, 503, { error: 'no-key' });
  const body = await readBody(req);
  if (url.pathname === '/api/chat') {
    const agent = await readAgent(String(body.agent || ''));
    const messages = cleanMessages(body.messages);
    if (!messages.length || messages.at(-1).role !== 'user') return send(res, 400, { error: 'last message must be from the user' });
    return send(res, 200, { reply: await ask(agent, messages) });
  }
  if (url.pathname === '/api/meeting') {
    const ids = [...new Set((body.attendees || []).map(String))].slice(0, 16);
    const message = String(body.message || '').slice(0, 4000);
    const transcript = String(body.transcript || '').slice(-6000);
    if (!ids.length || !message) return send(res, 400, { error: 'attendees and message needed' });
    const agents = await Promise.all(ids.map(readAgent));
    const roster = agents.map(a => a.id).join('، ');
    const replies = await Promise.all(agents.map(async a => {
      try {
        const text = await ask(a, [{ role: 'user', content: (transcript ? `اللي انقال في الاجتماع لين الحين:\n${transcript}\n\n` : '') + `المالك يقول: ${message}` }],
          `\nأنت في اجتماع في قاعة الاجتماعات. الحضور: ${roster}. رد من زاوية مجالك بس، بـ 3 أسطر بالكثير.`);
        return { id: a.id, text };
      } catch (e) { return { id: a.id, error: apiError(e)[1] }; }
    }));
    return send(res, 200, { replies });
  }
  return send(res, 404, { error: 'unknown endpoint' });
}

async function serveFile(res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') { res.writeHead(302, { Location: '/virtual-office/' }); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + rel);
  const inside = file.startsWith(ROOT + path.sep);
  const hidden = path.relative(ROOT, file).split(path.sep).some(p => p.startsWith('.') && p !== '.claude') || file.includes('node_modules' + path.sep + '.');
  if (!inside || hidden || /\.env|service.?account/i.test(file)) { res.writeHead(404); return res.end('not found'); }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}

// Keeps the office live: pulls the agents' latest commits every 5 minutes (turn off with AUTO_PULL=0).
if (process.env.AUTO_PULL !== '0') {
  const pull = () => execFile('git', ['-C', ROOT, 'pull', '--ff-only', '--quiet'], (err) => { if (err) console.log('git pull:', err.message.split('\n')[0]); });
  pull(); setInterval(pull, 5 * 60 * 1000);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return await serveFile(res, url);
  } catch (e) {
    const [status, msg] = apiError(e);
    send(res, status, { error: msg });
  }
}).listen(PORT, HOST, () => {
  console.log(`🏢 مكتب الديوانية الافتراضي: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/virtual-office/`);
  console.log(hasKey ? '💬 الدردشة الحية مع الإيجنتات شغالة' : '💬 الدردشة الحية مقفلة: حط ANTHROPIC_API_KEY (شوف SETUP_GUIDE.md)');
});
