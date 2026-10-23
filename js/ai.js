// Optional AI, with the organiser's (or a captain's) own API key. Google Gemini has a free tier;
// Groq and OpenRouter offer free models; Anthropic (Claude) and any OpenAI-compatible service also
// work. The key is kept only in this browser (localStorage on this device): it is never saved to
// the database or the repo. Every call goes straight from the browser to the provider.
//
// Used for: AI commentary (control room), scouting notes for players (Players tab) and "Ask AI"
// in a captain's private workbook. Everything works without AI.

import { $, esc, toast } from './ui.js';

const KEY = 'auctionxi:ai';

export const PROVIDERS = {
  gemini: {
    name: 'Google Gemini (free tier)', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free key from Google AI Studio. On the free tier Google may use prompts to improve its products.',
  },
  groq: {
    name: 'Groq (free tier)', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys', base: 'https://api.groq.com/openai/v1',
    note: 'Free key from the Groq console, with daily limits.',
  },
  openrouter: {
    name: 'OpenRouter (free models)', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys', base: 'https://openrouter.ai/api/v1',
    note: 'Models ending in ":free" cost nothing, with daily limits.',
  },
  anthropic: {
    name: 'Anthropic (Claude)', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Paid per use. Claude Haiku (claude-haiku-5-5) is the cheapest for short lines.',
  },
  openai: {
    name: 'Other (OpenAI-compatible)', model: '', keyUrl: '', base: 'https://api.openai.com/v1',
    note: 'Any service with an OpenAI-style /chat/completions endpoint. Set its base URL.',
  },
};

export function aiSettings() {
  try { return { provider: 'gemini', key: '', model: '', base: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { provider: 'gemini', key: '', model: '', base: '' }; }
}
function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }
export const aiReady = () => !!aiSettings().key;
const modelOf = (s) => s.model || PROVIDERS[s.provider]?.model || '';
const baseOf = (s) => (s.base || PROVIDERS[s.provider]?.base || '').replace(/\/+$/, '');

// Errors carry a kind, so callers can decide what to do: 'limit' (rate limit or quota used up),
// 'key' (refused), 'down' (no answer, timed out, or the service failed) or 'other'.
function aiError(msg, kind) { const e = new Error(`AI: ${msg}`); e.kind = kind; return e; }

async function failure(res) {
  let msg = `${res.status}`;
  try { const j = await res.json(); msg = j.error?.message || j.error?.type || j.message || msg; } catch { /* not JSON */ }
  if (res.status === 401 || res.status === 403) return aiError(`the key was refused (${msg})`, 'key');
  if (res.status === 429) return aiError(`rate limit or quota reached (${msg})`, 'limit');
  if (res.status >= 500) return aiError(`the AI service is not answering (${msg})`, 'down');
  return aiError(msg, 'other');
}

// fetch with a time limit; a network failure or a timeout counts as 'down'.
async function call(url, opts, timeoutMs) {
  try {
    return await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw aiError(e.name === 'TimeoutError' ? `no answer within ${Math.round(timeoutMs / 1000)} seconds` : 'could not reach the AI service', 'down');
  }
}

// One short completion. Returns the text, or throws with a readable message.
export async function askAI({ system = '', prompt, maxTokens = 600, json = false, timeoutMs = 30000 }) {
  const s = aiSettings();
  if (!s.key) throw new Error('Add an AI key first (AI assistant settings)');
  const model = modelOf(s);
  if (!model) throw new Error('Choose a model in the AI settings');
  if (s.provider === 'gemini') {
    const res = await call(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': s.key },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    }, timeoutMs);
    if (!res.ok) throw await failure(res);
    const j = await res.json();
    return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  }
  if (s.provider === 'anthropic') {
    const res = await call('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': s.key, 'anthropic-version': '2026-10-21',
        'anthropic-dangerous-direct-browser-access': 'true', // the key is the user's own, used from their own browser
      },
      body: JSON.stringify({ model, max_tokens: Math.max(maxTokens, 2000), output_config: { effort: 'low' }, system: system || undefined, messages: [{ role: 'user', content: prompt }] }),
    }, timeoutMs);
    if (!res.ok) throw await failure(res);
    const j = await res.json();
    if (j.stop_reason === 'refusal') throw new Error('AI: the model declined this request');
    return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  }
  const res = await call(`${baseOf(s)}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.key}` },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  }, timeoutMs);
  if (!res.ok) throw await failure(res);
  const j = await res.json();
  return String(j.choices?.[0]?.message?.content || '').trim();
}

// The JSON object in a reply (models sometimes wrap it in ``` fences or add a sentence).
export function parseJSON(text) {
  const t = String(text || '');
  const i = t.indexOf('{');
  const k = t.lastIndexOf('}');
  if (i < 0 || k < i) throw new Error('AI: the reply was not in the expected format');
  return JSON.parse(t.slice(i, k + 1));
}

async function listModels(s) {
  if (s.provider === 'gemini') {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': s.key } });
    if (!res.ok) throw await failure(res);
    return ((await res.json()).models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  }
  if (s.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': s.key, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' } });
    if (!res.ok) throw await failure(res);
    return ((await res.json()).data || []).map((m) => m.id);
  }
  const res = await fetch(`${baseOf(s)}/models`, { headers: { authorization: `Bearer ${s.key}` } });
  if (!res.ok) throw await failure(res);
  return ((await res.json()).data || []).map((m) => m.id).sort();
}

// The settings card: provider, key, model, test. `onChange` runs after save or forget.
export function aiSettingsCard(el, { onChange } = {}) {
  const s = aiSettings();
  const p = PROVIDERS[s.provider] || PROVIDERS.gemini;
  el.innerHTML = `
    <div class="section-title"><h2 style="margin:0">AI assistant (optional)</h2>${s.key ? '<small>Key saved on this device</small>' : '<small>Off</small>'}</div>
    <p class="muted">Use your own AI key for AI commentary, scouting notes and workbook advice. The key stays <b>only in this browser on this device</b>: it is not saved in the auction, the database or GitHub, and nobody else can see it. Player names and stats you ask about are sent to the provider you choose.</p>
    <div class="grid grid-2" style="gap:var(--space-3)">
      <div><label for="ai-provider">Provider</label><select id="ai-provider">${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}" ${k === s.provider ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
        <span class="hint">${esc(p.note)}${p.keyUrl ? ` <a href="${esc(p.keyUrl)}" target="_blank" rel="noopener">Get a key</a>` : ''}</span></div>
      <div><label for="ai-key">API key</label><input id="ai-key" type="password" autocomplete="off" value="${esc(s.key)}" placeholder="Paste your key"></div>
      <div><label for="ai-model">Model</label><input id="ai-model" list="ai-models" value="${esc(s.model)}" placeholder="${esc(p.model || 'model name')}"><datalist id="ai-models"></datalist>
        <span class="hint">Blank = ${esc(p.model || 'set one')}. <button type="button" class="btn-sm btn-ghost" id="ai-list">Show available models</button></span></div>
      ${s.provider === 'openai' ? `<div><label for="ai-base">Base URL</label><input id="ai-base" value="${esc(s.base)}" placeholder="${esc(PROVIDERS.openai.base)}"></div>` : ''}
    </div>
    <p class="row" style="margin-top:var(--space-3)">
      <button type="button" class="btn-sm btn-primary" id="ai-save">Save</button>
      <button type="button" class="btn-sm" id="ai-test">Test</button>
      ${s.key ? '<button type="button" class="btn-sm btn-ghost" id="ai-forget">Forget the key</button>' : ''}
      <span id="ai-out" class="muted"></span>
    </p>`;
  const read = () => ({ provider: $('#ai-provider', el).value, key: $('#ai-key', el).value.trim(), model: $('#ai-model', el).value.trim(), base: $('#ai-base', el)?.value.trim() || '' });
  $('#ai-provider', el).onchange = () => { saveSettings({ ...read(), model: '' }); aiSettingsCard(el, { onChange }); };
  $('#ai-save', el).onclick = () => { saveSettings(read()); toast('AI settings saved on this device', 'ok'); aiSettingsCard(el, { onChange }); onChange?.(); };
  $('#ai-test', el).onclick = async () => {
    saveSettings(read());
    $('#ai-out', el).textContent = 'Asking…';
    try {
      const t = await askAI({ prompt: 'Reply with one short, cheerful sentence welcoming people to a cricket player auction.', maxTokens: 120 });
      $('#ai-out', el).textContent = `Works: "${t.slice(0, 160)}"`;
      onChange?.();
    } catch (e) { $('#ai-out', el).textContent = e.message; }
  };
  $('#ai-list', el).onclick = async () => {
    saveSettings(read());
    $('#ai-out', el).textContent = 'Loading models…';
    try {
      const ids = await listModels(aiSettings());
      $('#ai-models', el).innerHTML = ids.map((m) => `<option value="${esc(m)}">`).join('');
      $('#ai-out', el).textContent = `${ids.length} models: click the Model box to choose`;
    } catch (e) { $('#ai-out', el).textContent = e.message; }
  };
  if ($('#ai-forget', el)) $('#ai-forget', el).onclick = () => { saveSettings({ provider: s.provider, key: '', model: s.model, base: s.base }); aiSettingsCard(el, { onChange }); onChange?.(); };
}

/* ---------------- what the AI is told ---------------- */

export const LANG_NAME = {
  en: 'English',
  hi: 'Hinglish (Hindi and English mixed, written in Roman letters, the way cricket fans in India talk)',
  mr: 'Marathi (in Devanagari script)',
};

// The facts about a player, for a prompt. Only what the auction already shows on screen.
export function playerFacts(p, a, money) {
  const pool = (a.rules.categories || []).length > 1 ? (a.rules.categories.find((c) => c.id === p.category)?.label || '') : '';
  return [
    `Name: ${p.name}`, p.role && `Role: ${p.role}`, pool && `Pool: ${pool}`,
    p.battingHand && `Bats: ${p.battingHand === 'L' ? 'left' : 'right'}-handed`,
    (p.bowlingArm || p.bowlingType) && `Bowls: ${[p.bowlingArm === 'L' ? 'left-arm' : p.bowlingArm === 'R' ? 'right-arm' : '', p.bowlingType || ''].filter(Boolean).join(' ')}`,
    p.matches != null && `Matches: ${p.matches}`, p.runs != null && `Runs: ${p.runs}`, p.strikeRate != null && `Strike rate: ${p.strikeRate}`,
    p.highest && `Highest score: ${p.highest}`, p.wickets != null && `Wickets: ${p.wickets}`, p.economy != null && `Economy: ${p.economy}`,
    p.notes && `Notes: ${p.notes}`,
  ].filter(Boolean).join('\n');
}

// A commentary line for one auction event (a player coming up, sold or unsold). Uses only facts
// the hall can already see; never a team's remaining purse unless purses are shown to everyone.
export async function aiCommentLine(a, e, lang, money) {
  const p = a.players[e.playerId];
  if (!p) return '';
  const r = a.rules;
  const amt = (n) => money(n, r);
  const team = e.team ? a.teams[e.team] : null;
  const sold = Object.values(a.sales || {}).filter((s) => !s.allotted && !s.retained);
  const record = sold.reduce((m, s) => Math.max(m, Number(s.price) || 0), 0);
  const owned = team ? Object.values(a.sales || {}).filter((s) => s.team === e.team).length : 0;
  const facts = [
    `Event: ${e.type === 'up' ? 'this player is now up for auction' : e.type === 'sold' ? `SOLD to ${team?.name} for ${amt(e.amount)}` : 'UNSOLD: no team bid'}`,
    playerFacts(p, a, money),
    `Base price: ${amt(e.type === 'up' ? e.amount : (p.basePrice || r.categories.find((c) => c.id === p.category)?.base || 0))}`,
    e.type === 'up' && e.drawn ? `Brought up by: ${e.drawn === 'chit' ? 'a chit drawn in the hall' : 'random draw'}` : '',
    e.type === 'sold' ? `Squad of ${team?.name} now: ${owned} of ${r.squadSize}` : '',
    e.type === 'sold' && record ? `Highest price so far in this auction: ${amt(record)}${Number(e.amount) >= record ? ' (this sale is the new record)' : ''}` : '',
    `Players sold so far: ${sold.length}`,
    r.purseVisibility === 'everyone' && team ? `${team.name} points left: ${amt(Number(team.purse ?? r.purse) - Number(team.spent || 0))}` : '',
  ].filter(Boolean).join('\n');
  const text = await askAI({
    system: `You are the live commentator at a friendly ${a.meta.tournament || 'cricket'} player auction. Write ONE or TWO short, lively sentences (at most 35 words) in ${LANG_NAME[lang] || LANG_NAME.en}.${r.humour === 'normal' ? '' : ' Be funny: end with a quick, witty punchline about the bidding, the money or the drama, like a cheeky IPL auctioneer. Keep it warm: never mock a player, their looks, age or skill.'} Use only the facts given: never invent stats, nicknames or history. No emoji, no hashtags, no quotes around the line. Amounts exactly as written.`,
    prompt: facts,
    maxTokens: 200,
    timeoutMs: 7000, // a line that arrives later than this is no use: the built-in line is read instead
  });
  return text.replace(/^["'“”]+|["'“”]+$/g, '').trim();
}
