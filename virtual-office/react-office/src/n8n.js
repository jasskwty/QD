// Thin client for the n8n webhooks defined in /n8n-workflows.
const BASE = (import.meta.env.VITE_N8N_BASE || '/n8n/webhook').replace(/\/$/, '');

async function call(path, { method = 'POST', body } = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const hint = res.status === 404 ? ' (is the workflow published?)' : '';
    throw new Error(`${path}: HTTP ${res.status}${hint} ${data.message || ''}`.trim());
  }
  return data;
}

export const api = {
  base: BASE,
  // Workflow 04
  getState: () => call('qd-company-state', { method: 'GET' }),
  updateState: (patch) => call('qd-company-state-update', { body: patch }),
  askCEO: (message, session_id = 'ceo') => call('qd-ceo-assistant', { body: { message, session_id } }),
  meeting: (payload) => call('qd-meeting', { body: payload }),
  // Workflow 01
  runCellPipeline: ({ category, count, shift, cell_id }) =>
    call('qd-cell-pipeline', { body: { category, count: Number(count) || 10, shift, cell_id } }),
  // Workflow 02
  runJoyLab: ({ our_game_spec, max_rounds }) =>
    call('qd-joy-lab', { body: { our_game_spec, max_rounds: Number(max_rounds) || 3 } }),
  // Workflow 03
  runGrowth: ({ monthly_revenue_kwd, performance }) =>
    call('qd-growth-engine', { body: { monthly_revenue_kwd: Number(monthly_revenue_kwd), performance: performance || [] } })
};
