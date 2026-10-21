import { db, isLocal } from './db.js';
import {
  normalize, money, teamSummary, nextBid, bidBlocker, bidLimit, pickNext, pool, capsUpdate, basePrice, withDefaults,
  ROLES, roleId, PICK_ORDERS, BID_MODES, randomCode, slug, isReserve, category,
} from './engine.js';
import {
  isAdmin, claimCoadmin, placeBid, undoLastBid, recordRoomSale, startPlayer, sell, markUnsold, undoLastSale,
  startAuction, nextRound, finishAuction, exportSnapshot,
} from './actions.js';
import {
  parseCSV, importPlayers, importTeams, playerTemplate, teamTemplate, playersToCSV, toCSV, setupToCSV, importSetup,
  HOUSE_RULE_QUESTIONS, TEAM_COLORS, num,
} from './csv.js';
import { $, $$, esc, toast, param, download, readFile, mountHeader, pageUrl, setSession, rememberAuction } from './ui.js';
import { teamBadge, badge, startCountdowns } from './ds.js';
import { cardFor, livePanel, purses, feed } from './views.js';

const aid = (param('a') || '').toUpperCase();
const P = `auctions/${aid}`;
let A = null;
let secrets = { teamCodes: {} };
let captains = {};
let coadmins = {};
let tab = localStorage.getItem('auctionxi:admintab') || 'setup';
let pendingRender = false;

mountHeader(`<a class="btn btn-sm" target="_blank" href="${pageUrl('live.html', { a: aid })}">Open live view</a>
  <a class="btn btn-sm" target="_blank" href="${pageUrl('live.html', { a: aid, screen: 1 })}">Open stage screen</a>`);

const run = (fn) => async (...args) => {
  try { await fn(...args); } catch (e) { console.error(e); toast(e.message || String(e), 'error'); }
};

async function boot() {
  const meta = await db.get(`${P}/meta`);
  if (!meta) {
    $('main').innerHTML = '<div class="card"><h2>Auction not found</h2><p><a href="index.html">Back to home</a></p></div>';
    return;
  }
  if (!(await isAdmin(aid, meta))) {
    $('#gate').classList.remove('hidden');
    $('#gate-form').addEventListener('submit', run(async (e) => {
      e.preventDefault();
      await claimCoadmin(aid, $('#gate-code').value.trim().toUpperCase(), $('#gate-name').value.trim());
      location.reload();
    }));
    return;
  }
  setSession(aid, { role: 'admin' });
  rememberAuction(aid, meta.name, 'admin');
  $('#app').classList.remove('hidden');
  $('#aid').textContent = aid;

  if (param('created')) {
    toast('Auction created. Next: fill in the setup.', 'ok');
    history.replaceState(null, '', pageUrl('admin.html', { a: aid }));
  }

  db.on(`secrets/${aid}`, (v) => { secrets = v || { teamCodes: {} }; secrets.teamCodes ||= {}; render(); });
  db.on(`captains/${aid}`, (v) => { captains = v || {}; render(); });
  db.on(`coadmins/${aid}`, (v) => { coadmins = v || {}; render(); });
  db.on(P, (v) => {
    A = normalize(v);
    if (!A) return;
    $('#title').textContent = A.meta.name;
    const st = A.meta.status;
    $('#status').innerHTML = badge(st === 'live' ? 'live' : st === 'completed' ? 'sold' : 'upcoming', { text: st === 'live' ? 'Live' : st === 'completed' ? 'Completed' : 'Setup' });
    render();
  });

  $$('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; localStorage.setItem('auctionxi:admintab', tab); render(true); }));
  $('#panel').addEventListener('focusout', () => setTimeout(() => pendingRender && render(), 0));
  document.addEventListener('keydown', onKey);
  startCountdowns(db.now);
}

// Re-render the active tab. Forms are not re-rendered while the user is typing in them.
function render(force = false) {
  if (!A) return;
  const panel = $('#panel');
  const typing = panel.contains(document.activeElement) && document.activeElement.matches('input, select, textarea');
  if (!force && typing) { pendingRender = true; return; }
  pendingRender = false;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const views = { setup, teams, players, access, control, results };
  panel.onclick = panel.onchange = null;
  (views[tab] || setup)(panel);
}

/* ---------------- 1. Setup & rules ---------------- */

const field = (label, input, hint = '') => `<div><label>${label}</label>${input}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
const numIn = (id, v) => `<input id="${id}" inputmode="numeric" value="${esc(v ?? '')}">`;

function setup(el) {
  const { meta, rules } = A;
  const house = Object.fromEntries(rules.houseRules.map((h) => [h.key, h.a]));
  el.innerHTML = `
    <div class="card" style="margin-bottom:var(--space-4)">
      <div class="section-title"><h2>Fill the setup from a questionnaire</h2></div>
      <p>Every tournament is different. Download the questionnaire (it already has this auction's current answers), fill in the
        <b>answer</b> column in Excel or Google Sheets with the organising committee, and upload it. It covers the format, purse,
        squad and reserves, categories, role minimums, bid increments, bidding mode and house rules.</p>
      <div class="row">
        <button class="btn-primary" id="q-download">Download setup questionnaire</button>
        <label class="btn" style="margin:0;text-transform:none;letter-spacing:0;font-size:15px;color:var(--ink)">Upload filled questionnaire<input type="file" accept=".csv,text/csv" id="q-upload" hidden></label>
        <a class="btn btn-ghost" href="templates/sample_tournament_setup.csv" download>Example: filled sample</a>
      </div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h2>Tournament</h2>
        ${field('Auction name', `<input id="s-name" value="${esc(meta.name)}">`)}
        ${field('Tournament', `<input id="s-tournament" value="${esc(meta.tournament || '')}">`)}
        <div class="grid grid-2" style="gap:var(--space-3)">
          ${field('Venue', `<input id="s-venue" value="${esc(meta.venue || '')}">`)}
          ${field('Date', `<input id="s-date" type="date" value="${esc(meta.date || '')}">`)}
          ${field('Players per side', numIn('r-side', rules.playersPerSide))}
          ${field('Overs', numIn('r-overs', rules.overs))}
        </div>
        ${field('Organiser', `<input id="s-organiser" value="${esc(meta.organiser || '')}">`)}
      </div>
      <div class="card">
        <h2>Purse and squad</h2>
        <div class="grid grid-2" style="gap:var(--space-3)">
          ${field('Currency', `<input id="r-currency" value="${esc(rules.currency)}">`, '₹ = virtual rupees in L / Cr. Or pts.')}
          ${field('Purse per team', numIn('r-purse', rules.purse), `= ${money(rules.purse, rules)}. You can type 1Cr or 50L.`)}
          ${field('Minimum squad', numIn('r-min', rules.minSquad), 'Not counting reserves')}
          ${field('Maximum squad', numIn('r-max', rules.maxSquad), 'Not counting reserves')}
          ${field('Reserves per team', numIn('r-res', rules.reservesPerTeam), 'Players with pool = reserve')}
          ${field('Reserve base price', numIn('r-resbase', rules.reserveBasePrice || ''), 'Blank = category base')}
          ${field('Price cap per player', numIn('r-cap', rules.maxPlayerPrice || ''), 'Blank = no cap')}
          ${field('Default retained price', numIn('r-retain', rules.retainedPriceDefault || ''), 'When the CSV leaves it blank')}
        </div>
      </div>
      <div class="card wide">
        <h2>Categories and base prices</h2>
        <div class="table-wrap"><table class="grid-table"><thead><tr><th>ID</th><th>Name</th><th>Base price</th><th>Min / team</th><th>Max / team</th><th></th></tr></thead>
          <tbody id="cats">${rules.categories.map(catRow).join('')}</tbody></table></div>
        <p style="margin-top:var(--space-2)"><button class="btn-sm" id="add-cat">Add category</button></p>
        <span class="hint">Categories come up in this order. Min / max per team enforce rules like "at least 1 junior" or "at most 2 icon players".</span>
      </div>
      <div class="card">
        <h2>Role minimums</h2>
        <div class="grid grid-2" style="gap:var(--space-3)">
          ${Object.entries(ROLES).map(([k, r]) => field(`At least ${r.name.toLowerCase()}s`, numIn(`role-${k}`, rules.roleMin[k] || ''))).join('')}
        </div>
        <span class="hint">A team cannot spend its last squad slots on other roles while it still needs these.</span>
        <h2 style="margin-top:var(--space-5)">Bid increments</h2>
        <div class="table-wrap"><table class="grid-table"><thead><tr><th>While bid is below</th><th>Raise by</th><th></th></tr></thead>
          <tbody id="incs">${rules.increments.map(incRow).join('')}</tbody></table></div>
        <p style="margin-top:var(--space-2)"><button class="btn-sm" id="add-inc">Add slab</button></p>
        <span class="hint">Leave "below" empty on the last slab to mean "and above".</span>
      </div>
      <div class="card">
        <h2>Bidding</h2>
        ${field('How do captains bid?', `<select id="r-mode">${Object.entries(BID_MODES).map(([k, v]) => `<option value="${k}" ${k === rules.bidMode ? 'selected' : ''}>${v}</option>`).join('')}</select>`,
          'You can switch during the auction from the control room. In either mode you can enter just the final amount from the paddles.')}
        <div class="grid grid-2" style="gap:var(--space-3)">
          ${field('Timer after each bid (seconds)', numIn('r-timer', rules.bidTimer), '0 = off')}
          ${field('Unsold re-auction rounds', numIn('r-rounds', rules.unsoldRounds))}
        </div>
        ${field('Order players come up', `<select id="r-order">${Object.entries(PICK_ORDERS).map(([k, v]) => `<option value="${k}" ${k === rules.pickOrder ? 'selected' : ''}>${v}</option>`).join('')}</select>`, 'Reserve players always come up last.')}
      </div>
      <div class="card">
        <h2>House rules</h2>
        <p class="muted">Shown to everyone on the live page under Rules. Leave blank what doesn't apply.</p>
        ${HOUSE_RULE_QUESTIONS.map(([key, q, help]) => field(esc(key.startsWith('hr_other') ? 'Other rule' : q), `<textarea data-house="${key}" rows="2" placeholder="${esc(help)}">${esc(house[key] || '')}</textarea>`)).join('')}
      </div>
    </div>
    ${A.meta.status !== 'setup' ? '<p class="notice notice-warn" style="margin-top:var(--space-4)">The auction has started. Changing purse or squad rules now affects every team immediately.</p>' : ''}
    <p class="row" style="margin-top:var(--space-4)"><button class="btn-primary btn-lg" id="save-setup">Save setup</button></p>`;

  $('#add-cat').onclick = () => $('#cats').insertAdjacentHTML('beforeend', catRow({ id: '', label: '', base: '', min: '', max: '' }));
  $('#add-inc').onclick = () => $('#incs').insertAdjacentHTML('beforeend', incRow({ upto: '', step: '' }));
  el.onclick = (e) => { if (e.target.matches('[data-del-row]')) e.target.closest('tr').remove(); };
  $('#save-setup').onclick = run(saveSetup);
  $('#q-download').onclick = () => download(`${slug(meta.name) || aid}_setup.csv`, setupToCSV(meta, rules));
  $('#q-upload').onchange = run(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const res = importSetup(parseCSV(await readFile(file)), A.meta, A.rules);
    if (res.warnings.length && !confirm(`Check these before applying:\n\n${res.warnings.join('\n')}\n\nApply the questionnaire anyway?`)) return;
    await saveRules(res.meta, res.rules);
    toast('Setup imported from the questionnaire', 'ok');
    render(true);
  });
}

const catRow = (c) => `<tr><td><input class="c-id" value="${esc(c.id)}" style="width:60px;min-width:60px"></td><td><input class="c-label" value="${esc(c.label)}"></td>
  <td><input class="c-base" inputmode="numeric" value="${esc(c.base)}"></td><td><input class="c-min" inputmode="numeric" value="${esc(c.min || '')}" style="width:70px"></td>
  <td><input class="c-max" inputmode="numeric" value="${esc(c.max || '')}" style="width:70px"></td><td><button class="btn-sm btn-ghost" data-del-row aria-label="Remove">Remove</button></td></tr>`;
const incRow = (s) => `<tr><td><input class="i-upto" inputmode="numeric" value="${esc(s.upto || '')}"></td><td><input class="i-step" inputmode="numeric" value="${esc(s.step)}"></td>
  <td><button class="btn-sm btn-ghost" data-del-row>Remove</button></td></tr>`;

const n = (sel) => num($(sel).value) ?? 0;

async function saveSetup() {
  const categories = $$('#cats tr').map((tr) => ({
    id: $('.c-id', tr).value.trim().replace(/[.#$/[\]\s]/g, ''), label: $('.c-label', tr).value.trim(),
    base: num($('.c-base', tr).value) || 0, min: num($('.c-min', tr).value) || 0, max: num($('.c-max', tr).value) || 0,
  })).filter((c) => c.id);
  if (!categories.length) throw new Error('Add at least one category');
  if (new Set(categories.map((c) => c.id)).size !== categories.length) throw new Error('Category IDs must be unique');
  categories.forEach((c) => { c.label ||= c.id; });
  const increments = $$('#incs tr').map((tr) => ({ upto: num($('.i-upto', tr).value) || 0, step: num($('.i-step', tr).value) || 0 }))
    .filter((s) => s.step > 0).sort((x, y) => (x.upto || Infinity) - (y.upto || Infinity));
  if (!increments.length) throw new Error('Add at least one bid increment');
  const rules = {
    ...A.rules,
    currency: $('#r-currency').value.trim() || '₹',
    purse: n('#r-purse'),
    minSquad: n('#r-min'),
    maxSquad: n('#r-max') || 1,
    reservesPerTeam: n('#r-res'),
    reserveBasePrice: n('#r-resbase'),
    maxPlayerPrice: n('#r-cap'),
    retainedPriceDefault: n('#r-retain'),
    playersPerSide: n('#r-side') || null,
    overs: n('#r-overs') || null,
    bidTimer: n('#r-timer'),
    unsoldRounds: n('#r-rounds'),
    pickOrder: $('#r-order').value,
    bidMode: $('#r-mode').value,
    roleMin: Object.fromEntries(Object.keys(ROLES).map((k) => [k, n(`#role-${k}`)])),
    categories,
    increments,
    houseRules: $$('[data-house]').filter((t) => t.value.trim()).map((t) => {
      const q = HOUSE_RULE_QUESTIONS.find(([k]) => k === t.dataset.house);
      return { key: t.dataset.house, q: t.dataset.house.startsWith('hr_other') ? '' : q[1], a: t.value.trim() };
    }),
  };
  if (rules.minSquad > rules.maxSquad) throw new Error('Minimum squad cannot be larger than the maximum');
  await saveRules({
    ...A.meta,
    name: $('#s-name').value.trim() || A.meta.name,
    tournament: $('#s-tournament').value.trim() || null,
    venue: $('#s-venue').value.trim() || null,
    date: $('#s-date').value || null,
    organiser: $('#s-organiser').value.trim() || null,
  }, rules);
  toast('Setup saved', 'ok');
  render(true);
}

async function saveRules(meta, rules) {
  delete rules.captainBidding;
  await db.update(P, {
    'meta/name': meta.name || A.meta.name,
    'meta/tournament': meta.tournament || null,
    'meta/venue': meta.venue || null,
    'meta/date': meta.date || null,
    'meta/organiser': meta.organiser || null,
    rules,
    ...capsUpdate({ ...A, rules: withDefaults(rules) }),
  });
}

/* ---------------- 2. Teams ---------------- */

function teams(el) {
  const entries = Object.entries(A.teams);
  el.innerHTML = `
    <div class="card">
      <div class="section-title">
        <h2>Teams (${entries.length})</h2><span class="spacer"></span>
        <button class="btn-sm" id="t-template">Download teams template</button>
        <label class="btn btn-sm" style="margin:0;text-transform:none;letter-spacing:0;color:var(--ink)">Upload teams CSV<input type="file" accept=".csv,text/csv" id="t-upload" hidden></label>
        <button class="btn-sm btn-primary" id="t-add">Add team</button>
      </div>
      <div class="table-wrap">
        <table class="grid-table"><thead><tr><th>ID</th><th>Name</th><th>Code</th><th>Colour</th><th>Owner</th><th>Captain</th><th>Players</th><th></th></tr></thead>
        <tbody>${entries.map(([id, t]) => `
          <tr data-id="${esc(id)}">
            <td><code>${esc(id)}</code></td>
            <td><input data-f="name" value="${esc(t.name)}"></td>
            <td><input data-f="short" value="${esc(t.short || '')}" maxlength="4" style="width:70px;min-width:70px"></td>
            <td><input data-f="color" type="color" value="${esc(t.color || '#888888')}"></td>
            <td><input data-f="owner" value="${esc(t.owner || '')}"></td>
            <td><input data-f="captain" value="${esc(t.captain || '')}"></td>
            <td>${teamSummary(A, id).count}</td>
            <td><button class="btn-sm btn-ghost" data-del>Remove</button></td>
          </tr>`).join('') || '<tr><td colspan="8" class="muted">No teams yet. Add teams or upload the CSV.</td></tr>'}</tbody></table>
      </div>
      <span class="hint">Three-letter codes appear on the stage and phones. Each team gets a secret captain code under Access and sharing.</span>
    </div>`;

  $('#t-template').onclick = () => download('teams_template.csv', teamTemplate());
  $('#t-add').onclick = run(async () => {
    let i = entries.length + 1;
    while (A.teams['T' + i]) i++;
    await addTeams({ ['T' + i]: { name: `Team ${i}`, short: `T${i}`, color: TEAM_COLORS[(i - 1) % TEAM_COLORS.length] } });
  });
  $('#t-upload').onchange = run(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const { teams: parsed, warnings } = importTeams(parseCSV(await readFile(file)));
    e.target.value = '';
    if (!Object.keys(parsed).length) throw new Error('No teams found in the file');
    const replace = Object.keys(A.teams).length && confirm('Replace existing teams?\nOK = replace, Cancel = add to existing');
    if (replace && Object.keys(A.sales).length) throw new Error('Teams cannot be replaced after players have been sold');
    if (replace) await db.update(P, Object.fromEntries(Object.keys(A.teams).map((id) => [`teams/${id}`, null])));
    await addTeams(parsed);
    toast(`Imported ${Object.keys(parsed).length} teams${warnings.length ? ` with ${warnings.length} warnings` : ''}`, 'ok');
    if (warnings.length) alert(warnings.join('\n'));
  });
  el.onchange = run(async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || !e.target.dataset.f) return;
    let v = e.target.value.trim() || null;
    if (e.target.dataset.f === 'short' && v) v = v.toUpperCase();
    await db.set(`${P}/teams/${tr.dataset.id}/${e.target.dataset.f}`, v);
  });
  el.onclick = run(async (e) => {
    if (!e.target.matches('[data-del]')) return;
    const id = e.target.closest('tr').dataset.id;
    if (teamSummary(A, id).count) throw new Error('This team already has players');
    if (!confirm(`Remove team ${A.teams[id].name}?`)) return;
    await db.update(P, { [`teams/${id}`]: null });
    await db.set(`secrets/${aid}/teamCodes/${id}`, null);
  });
}

async function addTeams(map) {
  const upd = {};
  const codes = {};
  for (const [id, t] of Object.entries(map)) {
    upd[`teams/${id}`] = t;
    if (!secrets.teamCodes[id]) codes[`teamCodes/${id}`] = randomCode(6);
  }
  await db.update(P, upd);
  if (Object.keys(codes).length) await db.update(`secrets/${aid}`, codes);
  await db.update(P, capsUpdate(normalize(await db.get(P))));
}

/* ---------------- 3. Players ---------------- */

function players(el) {
  const locked = !!A.meta.locked;
  const list = Object.entries(A.players).sort(([x], [y]) => x.localeCompare(y, undefined, { numeric: true }));
  const catOpts = (v) => A.rules.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === v ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
  const roleOpts = (v) => Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === roleId(v) ? 'selected' : ''}>${r.code} · ${r.name}</option>`).join('');
  const poolOpts = (v) => `<option value="main" ${v !== 'reserve' ? 'selected' : ''}>Main</option><option value="reserve" ${v === 'reserve' ? 'selected' : ''}>Reserve</option>`;
  const teamOpts = (v) => `<option value="">—</option>${Object.entries(A.teams).map(([id, t]) => `<option value="${esc(id)}" ${id === v ? 'selected' : ''}>${esc(t.short || t.name)}</option>`).join('')}`;
  const dis = locked ? 'disabled' : '';
  const reserves = list.filter(([, p]) => isReserve(p)).length;
  const counts = [...A.rules.categories.map((c) => `${c.label} ${list.filter(([, p]) => p.category === c.id && !isReserve(p)).length}`), reserves ? `Reserve ${reserves}` : ''].filter(Boolean).join(' · ');

  el.innerHTML = `
    ${locked
      ? `<div class="notice notice-ok"><b>Player list locked</b> for this auction. ${A.meta.status === 'setup' ? '<button class="btn-sm" id="p-unlock">Unlock to edit</button>' : 'It can no longer change because the auction has started.'}</div>`
      : '<div class="notice notice-info">Upload players, check and fix anything below, then lock the list. A new auction starts with a fresh upload.</div>'}
    <div class="card">
      <div class="section-title">
        <h2>Players (${list.length})</h2><small>${esc(counts)}</small><span class="spacer"></span>
        <button class="btn-sm" id="p-template">Download players template</button>
        <button class="btn-sm" id="p-export">Export current list</button>
        ${locked ? '' : `
          <label class="btn btn-sm" style="margin:0;text-transform:none;letter-spacing:0;color:var(--ink)">Upload players CSV<input type="file" accept=".csv,text/csv" id="p-upload" hidden></label>
          <button class="btn-sm" id="p-sample">Load sample data</button>
          <button class="btn-sm" id="p-add">Add player</button>
          <button class="btn-sm btn-primary" id="p-lock">Lock player list</button>`}
      </div>
      <div class="table-wrap">
        <table class="grid-table"><thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Category</th><th>Pool</th><th>Base</th><th>Locality</th><th>Photo URL</th><th>Retained by</th><th>Ret. price</th><th></th></tr></thead>
        <tbody>${list.map(([id, p]) => `
          <tr data-id="${esc(id)}">
            <td><code>${esc(id)}</code></td>
            <td><input data-f="name" value="${esc(p.name)}" ${dis} style="min-width:150px"></td>
            <td><select data-f="role" ${dis}>${roleOpts(p.role)}</select></td>
            <td><select data-f="category" ${dis}>${catOpts(p.category)}</select></td>
            <td><select data-f="pool" ${dis}>${poolOpts(p.pool)}</select></td>
            <td><input data-f="basePrice" inputmode="numeric" value="${p.basePrice ?? ''}" placeholder="${esc(money(basePrice(p, A.rules), A.rules))}" ${dis} style="width:100px"></td>
            <td><input data-f="locality" value="${esc(p.locality || '')}" ${dis}></td>
            <td><input data-f="photoUrl" value="${esc(p.photoUrl || '')}" ${dis}></td>
            <td><select data-f="retainedBy" ${dis}>${teamOpts(p.retainedBy)}</select></td>
            <td><input data-f="retainedPrice" inputmode="numeric" value="${p.retainedPrice ?? ''}" ${dis} style="width:90px"></td>
            <td>${locked ? '' : '<button class="btn-sm btn-ghost" data-del>Remove</button>'}</td>
          </tr>`).join('') || '<tr><td colspan="11" class="muted">No players yet. Download the template, fill it in and upload it.</td></tr>'}</tbody></table>
      </div>
      <span class="hint">Base blank = category base. Pool "Reserve" = auctioned after everyone else, into each team's reserve slots.
        "Retained by" puts a player (for example the captain) in a team at the retained price when the auction starts.
        To change many players, export, edit in a spreadsheet and upload again.</span>
    </div>`;

  $('#p-template').onclick = () => download('players_template.csv', playerTemplate());
  $('#p-export').onclick = () => download(`${aid}_players.csv`, playersToCSV(A.players));
  if (locked) {
    $('#p-unlock') && ($('#p-unlock').onclick = run(() => db.set(`${P}/meta/locked`, false)));
    return;
  }
  $('#p-lock').onclick = run(async () => {
    if (!list.length) throw new Error('Add players first');
    if (!confirm(`Lock ${list.length} players for this auction?`)) return;
    await db.set(`${P}/meta/locked`, true);
    toast('Player list locked', 'ok');
  });
  $('#p-add').onclick = run(async () => {
    let i = list.length + 1;
    while (A.players['P' + String(i).padStart(3, '0')]) i++;
    await db.set(`${P}/players/P${String(i).padStart(3, '0')}`, { name: 'New player', role: 'ar', category: A.rules.categories.at(-1).id, pool: 'main' });
  });
  $('#p-upload').onchange = run(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const rows = parseCSV(await readFile(file));
    e.target.value = '';
    await importPlayerRows(rows);
  });
  $('#p-sample').onclick = run(async () => {
    const [st, pt, tt] = await Promise.all(['sample_tournament_setup', 'sample_players', 'sample_teams'].map((f) => fetch(`templates/${f}.csv`).then((r) => r.text())));
    if (!confirm('Load the sample tournament setup, 4 teams and 52 players (8 of them reserves)?')) return;
    const s = importSetup(parseCSV(st), A.meta, A.rules);
    await saveRules({ ...A.meta, name: A.meta.name }, s.rules);
    A = normalize(await db.get(P));
    if (!Object.keys(A.teams).length) await addTeams(importTeams(parseCSV(tt)).teams);
    await importPlayerRows(parseCSV(pt), true);
  });
  el.onchange = run(async (e) => {
    const tr = e.target.closest('tr[data-id]');
    const f = e.target.dataset.f;
    if (!tr || !f) return;
    let v = e.target.value.trim();
    if (['basePrice', 'retainedPrice'].includes(f)) {
      if (v !== '' && num(v) == null) throw new Error(`"${v}" is not an amount. Try 500000 or 5L.`);
      v = v === '' ? null : num(v);
    }
    if (f === 'name' && !v) throw new Error('Name is required');
    await db.set(`${P}/players/${tr.dataset.id}/${f}`, v === '' ? null : v);
  });
  el.onclick = run(async (e) => {
    if (!e.target.matches('[data-del]')) return;
    const id = e.target.closest('tr').dataset.id;
    if (!confirm(`Remove ${A.players[id].name}?`)) return;
    await db.set(`${P}/players/${id}`, null);
  });
}

async function importPlayerRows(rows, replaceAll = false) {
  const existing = Object.keys(A.players);
  const replace = replaceAll || (existing.length && confirm(`Replace the ${existing.length} existing players?\nOK = replace all, Cancel = add to the list`));
  const { players: parsed, warnings } = importPlayers(rows, A.rules, replace ? [] : existing);
  const count = Object.keys(parsed).length;
  if (!count) throw new Error('No players found in the file. Keep the template header row.');
  if (replace) await db.set(`${P}/players`, parsed);
  else await db.update(`${P}/players`, parsed);
  toast(`Imported ${count} players${warnings.length ? ` with ${warnings.length} warnings` : ''}`, 'ok');
  if (warnings.length) alert(`Imported with warnings:\n\n${warnings.join('\n')}`);
}

/* ---------------- 4. Access & sharing ---------------- */

function access(el) {
  const joinUrl = pageUrl('index.html', { a: aid });
  const liveUrl = pageUrl('live.html', { a: aid });
  const screenUrl = pageUrl('live.html', { a: aid, screen: 1 });
  const caps = Object.entries(captains);
  el.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h2>Share with everyone</h2>
        <p>Auction code <span class="secret">${aid}</span></p>
        <div class="row" style="align-items:flex-start">
          <div class="qr" id="qr"></div>
          <div style="flex:1;min-width:200px">
            ${field('Join link (captains, team members, audience)', `<input readonly value="${esc(joinUrl)}" onclick="this.select()">`)}
            ${field('Watch-only link', `<input readonly value="${esc(liveUrl)}" onclick="this.select()">`)}
            ${field('Stage screen (projector)', `<input readonly value="${esc(screenUrl)}" onclick="this.select()">`)}
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Admin code</h2>
        <p>Give this only to co-organisers and the auctioneer. It opens this console on any device, and is your backup if you change phones.</p>
        <p><span class="secret">${esc(secrets.adminCode || '')}</span></p>
        <h3>Co-admins</h3>
        <ul>${Object.entries(coadmins).map(([uid, c]) => `<li>${esc(c.name)} <button class="btn-sm btn-ghost" data-kick-admin="${esc(uid)}">Remove</button></li>`).join('') || '<li class="muted">None</li>'}</ul>
      </div>
      <div class="card" style="grid-column:1/-1">
        <h2>Captain codes</h2>
        <p>Send each captain only their own code. They open the join link, choose Captain and their team, and enter the code.</p>
        <div class="table-wrap"><table class="grid-table"><thead><tr><th>Team</th><th>Code</th><th>Signed in</th><th></th></tr></thead><tbody>
        ${Object.entries(A.teams).map(([id, t]) => `
          <tr><td>${teamBadge(t, { showName: true })}</td><td><span class="secret">${esc(secrets.teamCodes[id] || '—')}</span></td>
          <td>${caps.filter(([, c]) => c.team === id).map(([uid, c]) => `${esc(c.name)} <button class="btn-sm btn-ghost" data-kick="${esc(uid)}">Sign out</button>`).join('<br>') || '<span class="muted">Not yet</span>'}</td>
          <td class="row"><button class="btn-sm" data-copy="${esc(id)}">Copy WhatsApp message</button>
              <button class="btn-sm btn-ghost" data-regen="${esc(id)}">New code</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Add teams first.</td></tr>'}
        </tbody></table></div>
        ${isLocal ? '<p class="notice notice-warn" style="margin-top:var(--space-3)">Demo mode: only tabs in this browser can join. Connect Firebase (docs/SETUP.md) so phones can join.</p>' : ''}
      </div>
    </div>`;

  if (window.QRCode) new window.QRCode($('#qr'), { text: joinUrl, width: 150, height: 150 });
  el.onclick = run(async (e) => {
    const d = e.target.dataset;
    if (d.kick) await db.set(`captains/${aid}/${d.kick}`, null);
    if (d.kickAdmin) await db.set(`coadmins/${aid}/${d.kickAdmin}`, null);
    if (d.regen) {
      if (!confirm('Make a new code? The old code stops working and this team\'s signed-in phones are signed out.')) return;
      await db.set(`secrets/${aid}/teamCodes/${d.regen}`, randomCode(6));
      for (const [uid, c] of caps) if (c.team === d.regen) await db.set(`captains/${aid}/${uid}`, null);
    }
    if (d.copy) {
      const msg = `${A.meta.name}\nYou are the captain of ${A.teams[d.copy].name}.\n1. Open ${joinUrl}\n2. Choose Captain and team ${A.teams[d.copy].name}\n3. Enter code ${secrets.teamCodes[d.copy]}\nKeep this code private.`;
      await navigator.clipboard.writeText(msg);
      toast('Copied. Paste it in WhatsApp.', 'ok');
    }
  });
}

/* ---------------- 5. Control room ---------------- */

function control(el) {
  const { meta, live, rules } = A;
  if (meta.status === 'setup') return controlStart(el);

  const bidding = live?.status === 'bidding';
  const remaining = pool(A);
  const unsoldNow = Object.keys(A.unsold).filter((pid) => !A.sales[pid]);
  const round = Number(meta.round) || 1;
  const canNewRound = !remaining.length && unsoldNow.length && round <= Number(rules.unsoldRounds);
  const next = nextBid(live, rules);
  const teamIds = Object.keys(A.teams);
  const leader = bidding && live.bid?.team ? A.teams[live.bid.team] : null;
  const player = live && A.players[live.playerId];

  el.innerHTML = `
    ${meta.status === 'completed' ? '<div class="notice notice-ok">Auction completed. Export and archive the results from the Results tab.</div>' : ''}
    <div class="row" style="margin-bottom:var(--space-4)">
      <button class="btn-primary btn-lg" id="c-next" ${bidding || !remaining.length || rules.pickOrder === 'manual' || meta.status !== 'live' ? 'disabled' : ''}>Next player <kbd>N</kbd></button>
      <select id="c-pick" style="width:auto;max-width:280px" ${bidding || meta.status !== 'live' ? 'disabled' : ''}>
        <option value="">Pick a player…</option>
        ${remaining.map((p) => `<option value="${esc(p.id)}">${esc(p.id)} · ${esc(p.name)} (${esc(category(rules, p.category)?.label || p.category)}${isReserve(p) ? ', reserve' : ''})</option>`).join('')}
      </select>
      <span class="spacer"></span>
      <span class="muted">Bid mode</span>
      <div class="ax-seg" role="group" aria-label="Bid mode">
        <button type="button" data-mode="both" aria-pressed="${rules.bidMode !== 'room'}">Phones + room</button>
        <button type="button" data-mode="room" aria-pressed="${rules.bidMode === 'room'}">Room only</button>
      </div>
    </div>
    <div class="live-grid">
      <div>${player ? cardFor(A, live.playerId) : '<div class="card"><h2>No player on the block</h2><p class="muted">Press Next player or pick one.</p></div>'}</div>
      <div>${player ? livePanel(A) : ''}</div>
    </div>
    <div class="card" style="margin-top:var(--space-4)">
      <div class="closeout">
        <button class="btn-sold btn-lg" id="c-sold" ${leader ? '' : 'disabled'}>Mark sold${leader ? ` to ${esc(leader.short || leader.name)} · ${esc(money(live.bid.amount, rules))}` : ''} <kbd>S</kbd></button>
        <button class="btn-lg" id="c-unsold" ${bidding ? '' : 'disabled'}>Unsold <kbd>U</kbd></button>
        <button class="btn-ghost" id="c-undobid" ${bidding && live.bid?.team ? '' : 'disabled'}>Undo last bid <kbd>Z</kbd></button>
        <span class="spacer"></span>
        <button class="btn-sm btn-ghost" id="c-undo">Reverse last sale</button>
      </div>
      <h3 style="margin-top:var(--space-5)">Record a room bid ${bidding ? `<span class="muted">· next bid ${esc(money(next, rules))}</span>` : ''}</h3>
      <div class="room-bids">${teamIds.map((id, i) => {
        const t = A.teams[id];
        const why = bidding ? bidBlocker(A, id, next) : 'No player on the block';
        const lim = player && !A.sales[live.playerId] ? bidLimit(A, id, player).max : teamSummary(A, id).maxBid;
        return `<button class="room-bid" data-bid="${esc(id)}" ${why ? 'disabled' : ''} title="${esc(why || '')}">
          ${teamBadge(t, { showName: true })}<small class="muted">Max ${esc(money(lim, rules))}${i < 8 ? ` · <kbd>${i + 1}</kbd>` : ''}</small></button>`;
      }).join('')}</div>
      <h3 style="margin-top:var(--space-5)">Paddle auction: enter the final amount</h3>
      <p class="muted">If captains bid with paddles in the room, run the bidding out loud and enter only the winning team and amount here.</p>
      <div class="row">
        <select id="r-team" style="width:auto" ${bidding ? '' : 'disabled'}><option value="">Winning team…</option>${teamIds.map((id) => `<option value="${esc(id)}">${esc(A.teams[id].name)}</option>`).join('')}</select>
        <input id="r-amount" inputmode="numeric" placeholder="Final amount, e.g. 12L" style="width:200px" ${bidding ? '' : 'disabled'}>
        <button class="btn-sold" id="r-sell" ${bidding ? '' : 'disabled'}>Record sale</button>
      </div>
      <div class="row" style="margin-top:var(--space-4)">
        <small>Round ${round} · ${remaining.length} players left this round · ${Object.values(A.sales).filter((s) => !s.retained).length} sold · ${unsoldNow.length} unsold</small>
        <span class="spacer"></span>
        ${canNewRound ? `<button class="btn-sm btn-primary" id="c-round">Start round ${round + 1}: re-auction ${unsoldNow.length} unsold</button>` : ''}
        ${meta.status === 'live' ? '<button class="btn-sm btn-danger" id="c-finish">End auction</button>' : ''}
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:var(--space-4)">
      <div class="card"><h2>Purses</h2><div class="stack">${purses(A)}</div></div>
      <div class="card"><h2>Activity</h2>${feed(A)}</div>
    </div>`;

  $('#c-next').onclick = run(doNext);
  $('#c-pick').onchange = run(async (e) => { const id = e.target.value; e.target.blur(); if (id) await startPlayer(aid, A, id); });
  $('#c-sold').onclick = run(() => sell(aid, A));
  $('#c-unsold').onclick = run(() => markUnsold(aid, A));
  $('#c-undobid').onclick = run(() => undoLastBid(aid, A));
  $('#c-undo').onclick = run(async () => { if (confirm('Reverse the most recent sale? The player goes back to the pool.')) await undoLastSale(aid, A); });
  $('#c-round') && ($('#c-round').onclick = run(() => nextRound(aid, A)));
  $('#c-finish') && ($('#c-finish').onclick = run(async () => {
    const short = teamIds.filter((id) => teamSummary(A, id).count < rules.minSquad);
    const warn = short.length ? `\n\n${short.length} team(s) are below the minimum squad.` : '';
    if (confirm(`End the auction?${warn}`)) await finishAuction(aid);
  }));
  $$('[data-bid]', el).forEach((b) => (b.onclick = run(() => placeBid(aid, A, b.dataset.bid, 'room'))));
  $$('[data-mode]', el).forEach((b) => (b.onclick = run(() => db.set(`${P}/rules/bidMode`, b.dataset.mode))));
  $('#r-sell').onclick = run(async () => {
    const team = $('#r-team').value;
    const amount = num($('#r-amount').value);
    if (amount == null) throw new Error('Enter the final amount, for example 1200000 or 12L');
    const warning = await recordRoomSale(aid, A, team, amount);
    if (warning && confirm(`${warning}\n\nRecord the sale anyway?`)) await recordRoomSale(aid, A, team, amount, true);
  });
}

function controlStart(el) {
  const { meta, rules } = A;
  const teamN = Object.keys(A.teams).length;
  const main = Object.values(A.players).filter((p) => !isReserve(p)).length;
  const check = (ok, text) => `<li style="margin:var(--space-2) 0">${badge(ok ? 'sold' : 'upcoming', { text: ok ? 'Done' : 'To do' })} ${text}</li>`;
  el.innerHTML = `
    <div class="card" style="max-width:720px">
      <h2>Ready to start?</h2>
      <ul style="list-style:none;padding:0">
        ${check(teamN >= 2, `At least 2 teams (${teamN})`)}
        ${check(main > 0, `Players uploaded (${main} main, ${Object.keys(A.players).length - main} reserve)`)}
        ${check(main >= teamN * rules.minSquad, `Enough main players for every team's minimum squad (${teamN} × ${rules.minSquad} = ${teamN * rules.minSquad})`)}
        ${check(meta.locked, 'Player list locked')}
        ${check(Object.keys(captains).length > 0 || rules.bidMode === 'room', `Captains signed in (${Object.keys(captains).length}). Optional: you can record bids for them`)}
      </ul>
      <p>Starting locks the player list, puts retained players in their teams, and opens bidding.</p>
      <button class="btn-primary btn-lg" id="c-start" ${teamN >= 2 && main ? '' : 'disabled'}>Start auction</button>
    </div>`;
  $('#c-start').onclick = run(async () => {
    if (!confirm('Start the auction now?')) return;
    await startAuction(aid, A);
  });
}

async function doNext() {
  const p = pickNext(A);
  if (!p) throw new Error(pool(A).length ? 'Pick a player from the list' : 'No players left in this round');
  await startPlayer(aid, A, p.id);
}

function onKey(e) {
  if (tab !== 'control' || !A || e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const bidding = A.live?.status === 'bidding';
  if (k === 'n' && !bidding && A.meta.status === 'live') run(doNext)();
  else if (k === 's' && bidding && A.live.bid?.team) run(() => sell(aid, A))();
  else if (k === 'u' && bidding) run(() => markUnsold(aid, A))();
  else if (k === 'z' && bidding) run(() => undoLastBid(aid, A))();
  else if (/^[1-8]$/.test(k) && bidding) {
    const id = Object.keys(A.teams)[Number(k) - 1];
    if (id) run(() => placeBid(aid, A, id, 'room'))();
  }
}

/* ---------------- 6. Results ---------------- */

function results(el) {
  const sold = Object.values(A.sales).filter((s) => !s.retained).length;
  el.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h2>Results</h2>
        <p>${sold} players sold. <a href="${pageUrl('results.html', { a: aid })}" target="_blank">Open the results page</a></p>
        <div class="row">
          <button id="r-csv">Download squads CSV</button>
          <button id="r-json">Download full auction JSON</button>
        </div>
      </div>
      <div class="card">
        <h2>Keep results online permanently</h2>
        <ol>
          <li>Download the full auction JSON.</li>
          <li>In GitHub, add it as <code>archive/${esc(slug(A.meta.name))}/auction.json</code>.</li>
          <li>Add an entry to <code>archive/index.json</code>.</li>
        </ol>
        <p>GitHub Pages then serves it at <code>results.html?archive=${esc(slug(A.meta.name))}</code>, even if the live database is cleaned up.</p>
      </div>
    </div>`;
  $('#r-csv').onclick = () => {
    const rows = Object.entries(A.sales).map(([pid, s]) => {
      const p = A.players[pid] || {};
      return [A.teams[s.team]?.name || s.team, pid, p.name, ROLES[roleId(p.role)].name, p.category, isReserve(p) ? 'reserve' : 'main', s.price, s.retained ? 'retained' : `round ${s.round} (${s.source || 'phone'})`];
    }).sort((x, y) => String(x[0]).localeCompare(y[0]) || y[6] - x[6]);
    const unsold = Object.keys(A.players).filter((pid) => !A.sales[pid]).map((pid) => {
      const p = A.players[pid];
      return ['UNSOLD', pid, p.name, ROLES[roleId(p.role)].name, p.category, isReserve(p) ? 'reserve' : 'main', '', ''];
    });
    download(`${aid}_results.csv`, toCSV(['team', 'player_id', 'name', 'role', 'category', 'pool', 'price', 'how'], [...rows, ...unsold]));
  };
  $('#r-json').onclick = () => download(`${slug(A.meta.name) || aid}.auction.json`, JSON.stringify(exportSnapshot(A), null, 2), 'application/json');
}

boot();
