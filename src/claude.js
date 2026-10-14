import Anthropic from '@anthropic-ai/sdk';
import { CFG, PRICES, WEB_SEARCH_USD } from './config.js';

export class BudgetError extends Error {}
export class RefusalError extends Error {}

// Models that take the server-side refusal fallback (`fallbacks: "default"`), and the web search version each model supports.
const FALLBACK = /^claude-(opus-5|fable-5-1|sonnet-5-5)/;
const WEB_SEARCH = /haiku/.test(CFG.model) ? 'web_search_20250305' : 'web_search_20260209';

export const spend = { usd: 0, calls: 0, inTokens: 0, outTokens: 0, searches: 0 };

function addUsage(u = {}) {
  const p = PRICES[CFG.model] || PRICES['claude-opus-5-5'];
  const inT = u.input_tokens || 0, outT = u.output_tokens || 0;
  const cr = u.cache_read_input_tokens || 0, cw = u.cache_creation_input_tokens || 0;
  const s = u.server_tool_use?.web_search_requests || 0;
  spend.usd += (inT * p.in + outT * p.out + cr * p.cacheRead + cw * p.cacheWrite) / 1e6 + s * WEB_SEARCH_USD;
  spend.calls++; spend.inTokens += inT + cr + cw; spend.outTokens += outT; spend.searches += s;
}

let client;
const api = () => (client ??= new Anthropic({ maxRetries: 6, timeout: 20 * 60 * 1000 }));

/**
 * One model call whose result comes back through `tool` (a client tool used only to carry structured output).
 * `web` > 0 adds web search with that many searches allowed. Handles pause_turn (long searches), refusals,
 * and a reply that forgot the tool or sent invalid input. Returns the tool input.
 */
export async function ask({ system, content, tool, validate, web = 0, effort = CFG.effort }) {
  const tools = [];
  if (web) tools.push({ type: WEB_SEARCH, name: 'web_search', max_uses: web });
  tools.push({ ...tool, eager_input_streaming: true });
  const messages = [{ role: 'user', content }];
  for (let turn = 0; turn < 8; turn++) {
    if (spend.usd >= CFG.maxUsd) throw new BudgetError(`spend cap $${CFG.maxUsd} reached`);
    const params = { model: CFG.model, max_tokens: 64000, system, messages, tools, tool_choice: { type: 'auto' }, output_config: { effort } };
    if (FALLBACK.test(CFG.model)) Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    const msg = await api().beta.messages.stream(params).finalMessage();
    addUsage(msg.usage);
    if (msg.stop_reason === 'refusal') throw new RefusalError(msg.stop_details?.category || 'refusal');
    if (msg.stop_reason === 'max_tokens') throw new Error(`${tool.name}: hit max_tokens`);
    messages.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'pause_turn') continue;
    const call = msg.content.find(b => b.type === 'tool_use' && b.name === tool.name);
    if (!call) { messages.push({ role: 'user', content: `Now call the ${tool.name} tool with your result.` }); continue; }
    const err = validate(call.input);
    if (!err) return call.input;
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, is_error: true,
      content: `Invalid input: ${err}. Call ${tool.name} again with the corrected, complete input.` }] });
  }
  throw new Error(`${tool.name}: no valid result`);
}
