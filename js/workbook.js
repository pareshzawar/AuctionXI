// A private workbook for each captain and vice-captain: favourite players, a max bid and note per
// player, a manual record of what other teams buy, and a scratch pad.
//
// Privacy: the workbook is encrypted on the phone with a PIN the captain chooses (PBKDF2 + AES-GCM)
// before it is saved at notes/{auction}/{team}_{C|VC}. The database rules let only that seat's
// signed-in phone read or write it, and without the PIN the saved text is unreadable, so neither
// the admin nor the owner of the Firebase project can read it. A forgotten PIN cannot be recovered.

import { db } from './db.js';
import { $, $$, esc, toast } from './ui.js';
import { money, category, ROLES, roleId, basePrice, teamSummary, isAllotted, minBase } from './engine.js';
import { roleChip, badge, teamBadge } from './ds.js';
import { keyFor, encryptJSON, decryptJSON, calc } from './vault.js';
import { aiReady, aiSettingsCard, askAI, playerFacts } from './ai.js';

export { calc };

const emptyBook = () => ({ players: {}, ledger: {}, teamNotes: {}, teamPurse: {}, pad: '' });

// The workbook of one seat (`T2_C`, `T2_VC`) in one auction.
export function openWorkbook(aid, seat) {
  const path = `notes/${aid}/${seat}`;
  const pinKey = `auctionxi:wbpin:${aid}:${seat}`;
  let key = null;
  let saveTimer = null;
  const wb = {
    book: null,
    async exists() { return !!(await db.get(path).catch(() => null)); },
    // Unlock with the PIN (or create the workbook with it). Throws on a wrong PIN.
    async unlock(pin, create = false) {
      const k = await keyFor(pin, `auctionxi:${aid}:${seat}`);
      const box = await db.get(path).catch(() => null);
      if (box && !create) {
        try { wb.book = { ...emptyBook(), ...(await decryptJSON(box, k)) }; } catch { throw new Error('Wrong PIN'); }
      } else {
        wb.book = emptyBook();
        key = k;
        await wb.saveNow();
      }
      key = k;
      try { sessionStorage.setItem(pinKey, pin); } catch { /* private mode */ }
      return wb.book;
    },
    // Unlock again after a page reload in the same tab.
    async resume() {
      let pin = null;
      try { pin = sessionStorage.getItem(pinKey); } catch { /* private mode */ }
      if (!pin || !(await wb.exists())) return false;
      try { await wb.unlock(pin); return true; } catch { return false; }
    },
    lock() {
      key = null; wb.book = null;
      try { sessionStorage.removeItem(pinKey); } catch { /* private mode */ }
    },
    async saveNow() {
      clearTimeout(saveTimer);
      if (!key || !wb.book) return;
      await db.set(path, await encryptJSON(wb.book, key));
    },
    save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => wb.saveNow().catch((e) => toast(`Workbook not saved: ${e.message}`, 'error')), 600);
    },
    export() { return JSON.stringify({ format: 'auctionxi-workbook/1', auction: aid, seat, book: wb.book }, null, 2); },
  };
  return wb;
}

/* ---------------- view ---------------- */

const ui = { aiQ: '', aiA: '', view: 'players', q: '', pool: '', role: '', favOnly: false, availOnly: true };

function playerStatus(a, pid) {
  const s = a.sales[pid];
  if (!s && a.players[pid]?.list === 'waiting') return { kind: 'waiting' };
  if (s) return { kind: s.allotted || s.retained ? 'retained' : 'sold', team: s.team, price: s.price };
  if (a.live?.playerId === pid && a.live.status === 'bidding') return { kind: 'live' };
  if (a.unsold[pid]) return { kind: 'unsold' };
  return { kind: 'upcoming' };
}

function playersView(a, book) {
  const r = a.rules;
  const q = ui.q.trim().toLowerCase();
  const rows = Object.entries(a.players)
    .filter(([, p]) => !isAllotted(p))
    .map(([id, p]) => ({ id, p, st: playerStatus(a, id), mine: book.players[id] || {} }))
    .filter((x) => (!q || x.p.name.toLowerCase().includes(q) || x.id.toLowerCase() === q)
      && (!ui.pool || x.p.category === ui.pool) && (!ui.role || roleId(x.p.role) === ui.role)
      && (!ui.favOnly || x.mine.fav) && (!ui.availOnly || ['upcoming', 'live', 'unsold', 'waiting'].includes(x.st.kind)))
    .sort((x, y) => Number(y.st.kind === 'live') - Number(x.st.kind === 'live') || Number(!!y.mine.fav) - Number(!!x.mine.fav)
      || (r.categories.findIndex((c) => c.id === x.p.category) - r.categories.findIndex((c) => c.id === y.p.category)) || x.p.name.localeCompare(y.p.name));
  const favCount = Object.values(book.players).filter((x) => x.fav).length;
  const status = (st) => (st.kind === 'sold' ? `${badge('sold')} ${teamBadge(a.teams[st.team])} ${esc(money(st.price, r))}`
    : st.kind === 'live' ? badge('live', { text: 'Up now' }) : st.kind === 'unsold' ? badge('unsold') : st.kind === 'waiting' ? badge('upcoming', { text: 'Waiting list' }) : '<span class="muted">Available</span>');
  return `
    <div class="row" style="margin-bottom:var(--space-3)">
      <input data-wb="q" value="${esc(ui.q)}" placeholder="Search name or number" style="flex:1;min-width:160px">
      <select data-wb="pool" style="width:auto"><option value="">All pools</option>${r.categories.map((c) => `<option value="${esc(c.id)}" ${ui.pool === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
      <select data-wb="role" style="width:auto"><option value="">All roles</option>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${ui.role === k ? 'selected' : ''}>${v.name}s</option>`).join('')}</select>
      <label class="check" style="margin:0"><input type="checkbox" data-wb="favOnly" ${ui.favOnly ? 'checked' : ''}> My list (${favCount})</label>
      <label class="check" style="margin:0"><input type="checkbox" data-wb="availOnly" ${ui.availOnly ? 'checked' : ''}> Still available</label>
    </div>
    <div class="stack" style="gap:var(--space-2)">
      ${rows.map(({ id, p, st, mine }) => `
        <div class="card" data-pid="${esc(id)}" style="padding:var(--space-3);${st.kind === 'live' ? 'border-color:var(--gold)' : ''}">
          <div class="row">
            <button class="btn-sm ${mine.fav ? 'btn-primary' : ''}" data-fav="${esc(id)}" aria-pressed="${!!mine.fav}" title="Add to my list">${mine.fav ? 'On my list' : 'Add to list'}</button>
            <b>${esc(p.name)}</b> ${roleChip(p.role)} <small>${esc([category(r, p.category)?.label, `base ${money(basePrice(p, r), r)}`, p.runs ? `${p.runs} runs` : '', p.wickets ? `${p.wickets} wkts` : ''].filter(Boolean).join(' · '))}</small>
            <span class="spacer"></span>${status(st)}
          </div>
          <div class="row" style="margin-top:var(--space-2)">
            <label style="margin:0">My max</label>
            <input data-max="${esc(id)}" inputmode="numeric" value="${esc(mine.max ?? '')}" placeholder="—" style="width:100px">
            <input data-note="${esc(id)}" value="${esc(mine.note || '')}" placeholder="Note (form, fitness, plan…)" style="flex:1;min-width:140px">
          </div>
        </div>`).join('') || '<p class="muted">No players match.</p>'}
    </div>`;
}

function teamsView(a, book, myTeam) {
  const r = a.rules;
  const base = minBase(r);
  return `<p class="muted">Your own notes on the other teams. Add each buy as you hear it; the estimate uses the squad size (${r.squadSize}) and the base price (${esc(money(base, r))}). Captains / vice-captains already in their squads are counted.</p>
    <div class="grid grid-2">${Object.entries(a.teams).filter(([id]) => id !== myTeam).map(([id, t]) => {
      const rows = book.ledger[id] || [];
      const start = Number(book.teamPurse[id] ?? (t.purse ?? r.purse)) || 0;
      const spent = rows.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const owned = teamSummary(a, id).players.filter((p) => p.allotted).length + rows.length;
      const toBuy = Math.max(0, r.squadSize - owned);
      const left = start - spent;
      const max = toBuy ? Math.max(0, Math.min(left, left - (toBuy - 1) * base)) : 0;
      return `<div class="card" data-team="${esc(id)}">
        <div class="section-title">${teamBadge(t, { showName: true })}</div>
        <div class="row" style="gap:var(--space-5)">
          <div class="ax-kv"><span class="ax-k">Est. purse left</span><span class="ax-price ax-price-md">${esc(money(left, r))}</span></div>
          <div class="ax-kv"><span class="ax-k">Est. max bid</span><span class="ax-price ax-price-md ax-tone-gold">${esc(money(max, r))}</span></div>
          <div class="ax-kv"><span class="ax-k">To buy</span><span class="ax-price ax-price-md">${toBuy}</span></div>
        </div>
        <label>Starting purse</label><input data-tpurse="${esc(id)}" inputmode="numeric" value="${esc(start)}" style="width:140px">
        <div style="margin-top:var(--space-3)">${rows.map((x, i) => `<div class="row" style="padding:4px 0;border-bottom:1px solid var(--line)"><span style="flex:1">${esc(x.name)}</span><b>${esc(money(x.amount, r))}</b><button class="btn-sm btn-ghost" data-del="${esc(id)}:${i}">Remove</button></div>`).join('') || '<p class="muted" style="margin:0">No buys noted yet.</p>'}</div>
        <div class="row" style="margin-top:var(--space-2)">
          <input data-lname="${esc(id)}" placeholder="Player" style="flex:1;min-width:110px">
          <input data-lamt="${esc(id)}" placeholder="Amount" inputmode="numeric" style="width:100px">
          <button class="btn-sm" data-add="${esc(id)}">Add</button>
        </div>
        <label>Notes on this team</label><textarea data-tnote="${esc(id)}" rows="2" placeholder="Needs a keeper, has 2 bowlers…">${esc(book.teamNotes[id] || '')}</textarea>
      </div>`;
    }).join('')}</div>`;
}

function padView(book) {
  return `<div class="card">
    <label>Quick sum</label>
    <div class="row"><input data-calc placeholder="e.g. 650 - 7*50" style="flex:1"><b data-calc-out style="min-width:80px"></b></div>
    <label>Scratch pad</label>
    <textarea data-pad rows="14" placeholder="Plans, targets, who to push up…">${esc(book.pad || '')}</textarea>
  </div>
  <div class="card" style="margin-top:var(--space-4)">
    <div class="section-title"><h3 style="margin:0">Ask AI</h3><small>optional, with your own AI key on this phone</small></div>
    ${aiReady() ? `<p class="muted" style="margin-top:0">The AI sees your team's points and squad, your list with your max bids and notes, and the players still available. Your notes go to the AI provider you chose; nobody else sees the question or the answer.</p>
      <textarea data-ai-q rows="2" placeholder="e.g. Who should I target next with my points? Which bowlers are still available?">${esc(ui.aiQ)}</textarea>
      <p class="row" style="margin:var(--space-2) 0"><button class="btn-sm btn-primary" data-ai-ask>Ask</button><button class="btn-sm btn-ghost" data-ai-keep ${ui.aiA ? '' : 'hidden'}>Add the answer to my scratch pad</button></p>
      <div data-ai-a class="muted" style="white-space:pre-wrap">${esc(ui.aiA)}</div>` : ''}
    <details ${aiReady() ? '' : 'open'}><summary class="muted">AI settings on this phone</summary><div data-ai-settings style="margin-top:var(--space-3)"></div></details>
  </div>`;
}

// What the captain's AI adviser is told: this team, the captain's own list, and who is left.
function adviserContext(a, book, team) {
  const r = a.rules;
  const t = a.teams[team];
  const s = teamSummary(a, team);
  const toBuy = Math.max(0, r.squadSize - s.count);
  const base = minBase(r);
  const max = toBuy ? Math.max(0, Math.min(s.remaining, s.remaining - (toBuy - 1) * base)) : 0;
  const left = Object.entries(a.players).filter(([id, p]) => !isAllotted(p) && !a.sales[id] && p.list !== 'waiting');
  const mine = Object.entries(book.players).filter(([, x]) => x.fav || x.max != null || x.note);
  return [
    `My team: ${t?.name}. Points left: ${money(s.remaining, r)}. Squad: ${s.count} of ${r.squadSize}, ${toBuy} still to buy. My max bid now: ${money(max, r)}.`,
    `My squad: ${s.players.map((p) => `${p.name} (${p.role}${p.allotted ? '' : `, ${money(p.price, r)}`})`).join('; ') || 'none yet'}.`,
    `Rules: base price ${money(base, r)}; every team must reach ${r.squadSize} players; ${r.playersPerSide}-a-side.`,
    `My list: ${mine.map(([id, x]) => `${a.players[id]?.name || id}${x.max != null ? ` (my max ${x.max})` : ''}${x.note ? ` - ${x.note}` : ''}`).join('; ') || 'empty'}.`,
    'Players still available:',
    ...left.map(([, p]) => playerFacts(p, a, money).replace(/\n/g, ' | ')),
  ].join('\n');
}

// Draw the workbook into `el`. ctx: { a, wb, team, seatLabel, rerender }; `a` may be a getter so redraws see the latest auction.
export function renderWorkbook(el, ctx) {
  const { a, wb } = ctx;
  if (!wb.book) return renderLock(el, ctx);
  const book = wb.book;
  el.innerHTML = `
    <div class="section-title">
      <h2 style="margin:0">My workbook</h2><small>${esc(ctx.seatLabel)} · only you can read it</small><span class="spacer"></span>
      <button class="btn-sm btn-ghost" data-wb-export>Download</button>
      <button class="btn-sm btn-ghost" data-wb-lock>Lock</button>
    </div>
    <div class="ax-seg" role="group" aria-label="Workbook section" style="margin-bottom:var(--space-4)">
      ${[['players', 'Players'], ['teams', 'Other teams'], ['pad', 'Scratch pad']].map(([k, l]) => `<button type="button" data-wb-view="${k}" aria-pressed="${ui.view === k}">${l}</button>`).join('')}
    </div>
    <div data-wb-body>${ui.view === 'teams' ? teamsView(a, book, ctx.team) : ui.view === 'pad' ? padView(book) : playersView(a, book)}</div>`;

  const redraw = () => renderWorkbook(el, ctx);
  const changed = () => wb.save();
  $$('[data-wb-view]', el).forEach((b) => (b.onclick = () => { ui.view = b.dataset.wbView; redraw(); }));
  $('[data-wb-lock]', el).onclick = () => { wb.lock(); redraw(); };
  $('[data-wb-export]', el).onclick = () => {
    const blob = new Blob([wb.export()], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `workbook-${ctx.seatLabel.replace(/\W+/g, '-')}.json`; link.click();
  };
  // Filters
  $$('[data-wb]', el).forEach((inp) => {
    const k = inp.dataset.wb;
    inp[inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => {
      ui[k] = inp.type === 'checkbox' ? inp.checked : inp.value;
      const pos = inp.selectionStart;
      redraw();
      if (k === 'q') { const again = $('[data-wb="q"]', el); again.focus(); again.setSelectionRange(pos, pos); }
    };
  });
  const entry = (pid) => (book.players[pid] ||= {});
  $$('[data-fav]', el).forEach((b) => (b.onclick = () => { const e = entry(b.dataset.fav); e.fav = !e.fav; changed(); redraw(); }));
  $$('[data-max]', el).forEach((inp) => (inp.onchange = () => {
    const v = inp.value.trim();
    const n = v === '' ? null : Number(v.replace(/[₹,\s]/g, ''));
    if (v && !Number.isFinite(n)) { toast('Enter a number', 'error'); return; }
    const e = entry(inp.dataset.max); e.max = n; if (n != null) e.fav = true; changed(); redraw();
  }));
  $$('[data-note]', el).forEach((inp) => (inp.oninput = () => { entry(inp.dataset.note).note = inp.value; changed(); }));
  // Other teams
  $$('[data-add]', el).forEach((b) => (b.onclick = () => {
    const id = b.dataset.add;
    const name = $(`[data-lname="${id}"]`, el).value.trim();
    const amount = Number($(`[data-lamt="${id}"]`, el).value.replace(/[₹,\s]/g, ''));
    if (!name || !Number.isFinite(amount)) { toast('Enter the player and the amount', 'error'); return; }
    (book.ledger[id] ||= []).push({ name, amount }); changed(); redraw();
  }));
  $$('[data-del]', el).forEach((b) => (b.onclick = () => { const [id, i] = b.dataset.del.split(':'); book.ledger[id].splice(Number(i), 1); changed(); redraw(); }));
  $$('[data-tnote]', el).forEach((t) => (t.oninput = () => { book.teamNotes[t.dataset.tnote] = t.value; changed(); }));
  $$('[data-tpurse]', el).forEach((t) => (t.onchange = () => { book.teamPurse[t.dataset.tpurse] = Number(t.value) || 0; changed(); redraw(); }));
  // Ask AI
  if ($('[data-ai-settings]', el)) aiSettingsCard($('[data-ai-settings]', el), { onChange: redraw });
  const ask = $('[data-ai-ask]', el);
  if (ask) {
    ask.onclick = async () => {
      const q = $('[data-ai-q]', el).value.trim();
      if (!q) return;
      ui.aiQ = q;
      const out = $('[data-ai-a]', el);
      out.textContent = 'Thinking…';
      ask.disabled = true;
      try {
        ui.aiA = await askAI({
          system: 'You are a calm, practical adviser to one captain at a friendly society cricket player auction. Answer in at most 150 words, in plain English, using only the facts given. Respect the max-bid rule and the squad size. Never make up statistics.',
          prompt: `${adviserContext(a, book, ctx.team)}\n\nQuestion: ${q}`,
          maxTokens: 500,
        });
      } catch (e) { ui.aiA = e.message; }
      redraw(); // the answer is kept in memory, so live updates don't wipe it
    };
    $('[data-ai-keep]', el).onclick = () => {
      book.pad = `${book.pad ? `${book.pad}\n\n` : ''}AI: ${ui.aiA}`;
      changed();
      redraw();
    };
  }
  // Scratch pad
  const pad = $('[data-pad]', el);
  if (pad) pad.oninput = () => { book.pad = pad.value; changed(); };
  const c = $('[data-calc]', el);
  if (c) c.oninput = () => { const v = calc(c.value); $('[data-calc-out]', el).textContent = v == null ? '' : `= ${money(v, a.rules)}`; };
}

function renderLock(el, ctx, forceNew = false) {
  const { wb } = ctx;
  el.innerHTML = '<p class="muted">Opening your workbook…</p>';
  (forceNew ? Promise.resolve(false) : wb.exists()).then((has) => {
    el.innerHTML = `<div class="card" style="max-width:480px">
      <h2>My workbook</h2>
      <p>Your private list of players, your max bids, notes on other teams and a scratch pad. It is locked with a PIN and encrypted on this phone, so <b>only you can read it</b>: not the admin, not the organisers.</p>
      ${has ? '' : '<p class="notice notice-warn">Choose a PIN you will remember. If you forget it, the workbook cannot be opened again.</p>'}
      <label for="wb-pin">${has ? 'Your workbook PIN' : 'Choose a PIN (4 or more digits)'}</label>
      <input id="wb-pin" class="code-input" type="password" inputmode="numeric" autocomplete="off">
      ${has ? '' : '<label for="wb-pin2">Repeat the PIN</label><input id="wb-pin2" class="code-input" type="password" inputmode="numeric" autocomplete="off">'}
      <p class="row" style="margin-top:var(--space-4)"><button class="btn-primary" id="wb-open">${has ? 'Open workbook' : 'Create workbook'}</button>
        ${has ? '<button class="btn-ghost btn-sm" id="wb-reset">Forgot PIN: start a new one</button>' : ''}</p>
    </div>`;
    const go = async (create) => {
      const pin = $('#wb-pin', el).value.trim();
      if (pin.length < 4) { toast('Use at least 4 characters', 'error'); return; }
      if (create && $('#wb-pin2', el) && $('#wb-pin2', el).value.trim() !== pin) { toast('The two PINs do not match', 'error'); return; }
      try { await wb.unlock(pin, create); renderWorkbook(el, ctx); ctx.rerender?.(); } catch (e) { toast(e.message, 'error'); }
    };
    $('#wb-open', el).onclick = () => go(!has);
    $('#wb-pin', el).onkeydown = (e) => { if (e.key === 'Enter') go(!has); };
    if ($('#wb-reset', el)) {
      $('#wb-reset', el).onclick = () => {
        if (!confirm('Start a new, empty workbook? The old one cannot be read without its PIN and will be replaced.')) return;
        renderLock(el, ctx, true);
      };
    }
  });
}
