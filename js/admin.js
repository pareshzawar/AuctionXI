import { db, isLocal } from './db.js';
import {
  normalize, money, teamSummary, nextBid, bidBlocker, pickNext, pool, capsUpdate, basePrice,
  ROLES, PICK_ORDERS, randomCode, slug,
} from './engine.js';
import {
  isAdmin, claimCoadmin, placeBid, startPlayer, sell, markUnsold, undoLastSale, startAuction,
  nextRound, finishAuction, exportSnapshot,
} from './actions.js';
import { parseCSV, importPlayers, importTeams, playerTemplate, teamTemplate, playersToCSV, toCSV } from './csv.js';
import { $, $$, esc, toast, param, download, readFile, mountHeader, pageUrl, setSession, rememberAuction } from './ui.js';
import { playerCard, bidBox, teamsStrip, feed, teamName, startTimers } from './views.js';

const aid = (param('a') || '').toUpperCase();
const P = `auctions/${aid}`;
let A = null;
let secrets = { teamCodes: {} };
let captains = {};
let coadmins = {};
let tab = localStorage.getItem('auctionxi:admintab') || 'setup';
let pendingRender = false;

mountHeader(`<a class="btn btn-sm" target="_blank" href="${pageUrl('live.html', { a: aid })}">Open live view ↗</a>
  <a class="btn btn-sm" target="_blank" href="${pageUrl('live.html', { a: aid, screen: 1 })}">Big screen ↗</a>`);

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

  const created = param('created');
  if (created) {
    toast('Auction created!', 'ok');
    history.replaceState(null, '', pageUrl('admin.html', { a: aid }));
  }

  db.on(`secrets/${aid}`, (v) => { secrets = v || { teamCodes: {} }; secrets.teamCodes ||= {}; render(); });
  db.on(`captains/${aid}`, (v) => { captains = v || {}; render(); });
  db.on(`coadmins/${aid}`, (v) => { coadmins = v || {}; render(); });
  db.on(P, (v) => {
    A = normalize(v);
    if (!A) return;
    $('#title').textContent = A.meta.name;
    $('#status').textContent = A.meta.status;
    $('#status').className = `pill ${A.meta.status === 'live' ? 'pill-green' : A.meta.status === 'completed' ? 'pill-gold' : ''}`;
    render();
  });

  $$('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; localStorage.setItem('auctionxi:admintab', tab); render(true); }));
  $('#panel').addEventListener('focusout', () => setTimeout(() => pendingRender && render(), 0));
  document.addEventListener('keydown', onKey);
  startTimers(db.now);
}

// Re-render the active tab. Forms are not re-rendered while the user is typing in them.
function render(force = false) {
  if (!A) return;
  const panel = $('#panel');
  const typing = panel.contains(document.activeElement) && document.activeElement.matches('input, select, textarea');
  if (!force && typing && tab !== 'control') { pendingRender = true; return; }
  pendingRender = false;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const views = { setup, teams, players, access, control, results };
  panel.onclick = panel.onchange = null;
  (views[tab] || setup)(panel);
}

/* ---------------- 1. Setup & rules ---------------- */

function setup(el) {
  const { meta, rules } = A;
  el.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h2>Auction details</h2>
        <label>Auction name</label><input id="s-name" value="${esc(meta.name)}">
        <label>Tournament</label><input id="s-tournament" value="${esc(meta.tournament || '')}">
        <div class="grid grid-2" style="gap:10px">
          <div><label>Venue</label><input id="s-venue" value="${esc(meta.venue || '')}"></div>
          <div><label>Date</label><input id="s-date" type="date" value="${esc(meta.date || '')}"></div>
        </div>
        <label>Organiser</label><input id="s-organiser" value="${esc(meta.organiser || '')}">
      </div>
      <div class="card">
        <h2>Purse &amp; squad</h2>
        <div class="grid grid-2" style="gap:10px">
          <div><label>Currency / unit (₹, $, pts, credits)</label><input id="r-currency" value="${esc(rules.currency)}"></div>
          <div><label>Purse per team</label><input id="r-purse" type="number" min="0" value="${rules.purse}"></div>
          <div><label>Minimum squad size</label><input id="r-min" type="number" min="0" value="${rules.minSquad}"></div>
          <div><label>Maximum squad size</label><input id="r-max" type="number" min="1" value="${rules.maxSquad}"></div>
          <div><label>Bid timer (seconds, 0 = off)</label><input id="r-timer" type="number" min="0" value="${rules.bidTimer}"></div>
          <div><label>Re-auction rounds for unsold players</label><input id="r-rounds" type="number" min="0" value="${rules.unsoldRounds}"></div>
        </div>
        <label>Order players come up</label>
        <select id="r-order">${Object.entries(PICK_ORDERS).map(([k, v]) => `<option value="${k}" ${k === rules.pickOrder ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" id="r-capbid" ${rules.captainBidding ? 'checked' : ''}> Captains can bid from their own phones</label>
        <small>Turn this off if captains raise paddles in the room and the auctioneer enters bids.</small>
      </div>
      <div class="card">
        <h2>Player categories &amp; base prices</h2>
        <table><thead><tr><th>ID</th><th>Label</th><th>Base price</th><th></th></tr></thead>
          <tbody id="cats">${rules.categories.map((c) => catRow(c)).join('')}</tbody></table>
        <p><button class="btn-sm" id="add-cat">+ Category</button></p>
        <small>Category order = the order players come up. A player's own base_price in the CSV overrides the category base.</small>
      </div>
      <div class="card">
        <h2>Bid increments</h2>
        <table><thead><tr><th>While bid is below</th><th>Raise by</th><th></th></tr></thead>
          <tbody id="incs">${rules.increments.map((s) => incRow(s)).join('')}</tbody></table>
        <p><button class="btn-sm" id="add-inc">+ Slab</button></p>
        <small>Leave "below" empty (or 0) on the last slab to mean "and above".</small>
      </div>
    </div>
    ${A.meta.status !== 'setup' ? '<p class="notice notice-warn">The auction has started - changing purse or squad rules now affects every team immediately.</p>' : ''}
    <p class="row"><button class="btn-primary btn-lg" id="save-setup">Save setup</button></p>`;

  $('#add-cat').onclick = () => $('#cats').insertAdjacentHTML('beforeend', catRow({ id: '', label: '', base: 100 }));
  $('#add-inc').onclick = () => $('#incs').insertAdjacentHTML('beforeend', incRow({ upto: 0, step: 100 }));
  el.onclick = (e) => { if (e.target.matches('[data-del-row]')) e.target.closest('tr').remove(); };
  $('#save-setup').onclick = run(saveSetup);
}

const catRow = (c) => `<tr><td><input class="c-id" value="${esc(c.id)}" style="width:60px"></td><td><input class="c-label" value="${esc(c.label)}"></td>
  <td><input class="c-base" type="number" min="0" value="${c.base}"></td><td><button class="btn-sm btn-ghost" data-del-row>✕</button></td></tr>`;
const incRow = (s) => `<tr><td><input class="i-upto" type="number" min="0" value="${s.upto || ''}"></td><td><input class="i-step" type="number" min="1" value="${s.step}"></td>
  <td><button class="btn-sm btn-ghost" data-del-row>✕</button></td></tr>`;

async function saveSetup() {
  const categories = $$('#cats tr').map((tr) => ({
    id: $('.c-id', tr).value.trim().replace(/[.#$/[\]]/g, ''), label: $('.c-label', tr).value.trim(), base: Number($('.c-base', tr).value) || 0,
  })).filter((c) => c.id);
  if (!categories.length) throw new Error('Add at least one category');
  if (new Set(categories.map((c) => c.id)).size !== categories.length) throw new Error('Category IDs must be unique');
  categories.forEach((c) => { c.label ||= c.id; });
  const increments = $$('#incs tr').map((tr) => ({ upto: Number($('.i-upto', tr).value) || 0, step: Number($('.i-step', tr).value) || 0 }))
    .filter((s) => s.step > 0).sort((x, y) => (x.upto || Infinity) - (y.upto || Infinity));
  if (!increments.length) throw new Error('Add at least one bid increment');
  const rules = {
    ...A.rules,
    currency: $('#r-currency').value.trim(),
    purse: Number($('#r-purse').value) || 0,
    minSquad: Number($('#r-min').value) || 0,
    maxSquad: Number($('#r-max').value) || 1,
    bidTimer: Number($('#r-timer').value) || 0,
    unsoldRounds: Number($('#r-rounds').value) || 0,
    pickOrder: $('#r-order').value,
    captainBidding: $('#r-capbid').checked,
    categories,
    increments,
  };
  if (rules.minSquad > rules.maxSquad) throw new Error('Minimum squad cannot be larger than maximum');
  await db.update(P, {
    'meta/name': $('#s-name').value.trim() || A.meta.name,
    'meta/tournament': $('#s-tournament').value.trim() || null,
    'meta/venue': $('#s-venue').value.trim() || null,
    'meta/date': $('#s-date').value || null,
    'meta/organiser': $('#s-organiser').value.trim() || null,
    rules,
    ...capsUpdate({ ...A, rules }),
  });
  toast('Setup saved', 'ok');
  render(true);
}

/* ---------------- 2. Teams ---------------- */

function teams(el) {
  const entries = Object.entries(A.teams);
  el.innerHTML = `
    <div class="card">
      <div class="row">
        <h2 style="margin:0">Teams (${entries.length})</h2><span class="spacer"></span>
        <button class="btn-sm" id="t-template">⬇ Teams CSV template</button>
        <label class="btn btn-sm" style="margin:0">⬆ Upload teams CSV<input type="file" accept=".csv,text/csv" id="t-upload" hidden></label>
        <button class="btn-sm btn-primary" id="t-add">+ Add team</button>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table><thead><tr><th>ID</th><th>Name</th><th>Short</th><th>Colour</th><th>Owner</th><th>Captain</th><th>Players</th><th></th></tr></thead>
        <tbody>${entries.map(([id, t]) => `
          <tr data-id="${esc(id)}">
            <td><code>${esc(id)}</code></td>
            <td><input data-f="name" value="${esc(t.name)}"></td>
            <td><input data-f="short" value="${esc(t.short || '')}" style="width:70px"></td>
            <td><input data-f="color" type="color" value="${esc(t.color || '#888888')}" style="width:50px"></td>
            <td><input data-f="owner" value="${esc(t.owner || '')}"></td>
            <td><input data-f="captain" value="${esc(t.captain || '')}"></td>
            <td>${teamSummary(A, id).count}</td>
            <td><button class="btn-sm btn-ghost" data-del>✕</button></td>
          </tr>`).join('') || '<tr><td colspan="8" class="muted">No teams yet. Add teams or upload the CSV.</td></tr>'}</tbody></table>
      </div>
      <small>Each team gets a secret captain code - see <b>Access &amp; sharing</b>.</small>
    </div>`;

  $('#t-template').onclick = () => download('teams_template.csv', teamTemplate());
  $('#t-add').onclick = run(async () => {
    let n = entries.length + 1;
    while (A.teams['T' + n]) n++;
    await addTeams({ ['T' + n]: { name: `Team ${n}`, short: `T${n}`, color: ['#f59e0b', '#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#ec4899'][n % 6] } });
  });
  $('#t-upload').onchange = run(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const { teams: parsed, warnings } = importTeams(parseCSV(await readFile(file)));
    e.target.value = '';
    if (!Object.keys(parsed).length) throw new Error('No teams found in the file');
    const replace = Object.keys(A.teams).length && confirm('Replace existing teams?\nOK = replace, Cancel = add to existing');
    if (replace && Object.keys(A.sales).length) throw new Error('Cannot replace teams after players have been sold');
    if (replace) await db.update(P, Object.fromEntries(Object.keys(A.teams).map((id) => [`teams/${id}`, null])));
    await addTeams(parsed);
    toast(`Imported ${Object.keys(parsed).length} teams${warnings.length ? ` (${warnings.length} warnings)` : ''}`, 'ok');
    if (warnings.length) alert(warnings.join('\n'));
  });
  el.onchange = run(async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || !e.target.dataset.f) return;
    await db.set(`${P}/teams/${tr.dataset.id}/${e.target.dataset.f}`, e.target.value.trim() || null);
  });
  el.onclick = run(async (e) => {
    if (!e.target.matches('[data-del]')) return;
    const id = e.target.closest('tr').dataset.id;
    if (teamSummary(A, id).count) throw new Error('This team already has players');
    if (!confirm(`Delete team ${A.teams[id].name}?`)) return;
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
  const fresh = normalize(await db.get(P));
  await db.update(P, capsUpdate(fresh));
}

/* ---------------- 3. Players ---------------- */

function players(el) {
  const locked = !!A.meta.locked;
  const list = Object.entries(A.players).sort(([x], [y]) => x.localeCompare(y, undefined, { numeric: true }));
  const catOpts = (v) => A.rules.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === v ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
  const roleOpts = (v) => ROLES.map((r) => `<option ${r === v ? 'selected' : ''}>${r}</option>`).join('');
  const teamOpts = (v) => `<option value="">-</option>${Object.entries(A.teams).map(([id, t]) => `<option value="${esc(id)}" ${id === v ? 'selected' : ''}>${esc(t.short || t.name)}</option>`).join('')}`;
  const dis = locked ? 'disabled' : '';
  const counts = A.rules.categories.map((c) => `${esc(c.label)}: ${list.filter(([, p]) => p.category === c.id).length}`).join(' · ');

  el.innerHTML = `
    ${locked
      ? `<div class="notice notice-ok">🔒 <b>Player list is locked</b> for this auction. ${A.meta.status === 'setup' ? '<button class="btn-sm" id="p-unlock">Unlock to edit</button>' : 'It can no longer be changed because the auction has started.'}</div>`
      : '<div class="notice notice-info">Upload players, review and fix anything below, then <b>lock</b> the list. A new auction starts with a fresh upload.</div>'}
    <div class="card">
      <div class="row">
        <h2 style="margin:0">Players (${list.length})</h2><small class="muted">${counts}</small><span class="spacer"></span>
        <button class="btn-sm" id="p-template">⬇ Players CSV template</button>
        <button class="btn-sm" id="p-export">⬇ Export current list</button>
        ${locked ? '' : `
          <label class="btn btn-sm" style="margin:0">⬆ Upload players CSV<input type="file" accept=".csv,text/csv" id="p-upload" hidden></label>
          <button class="btn-sm" id="p-sample">Load sample data</button>
          <button class="btn-sm btn-primary" id="p-add">+ Add player</button>
          <button class="btn-sm btn-gold" id="p-lock">🔒 Lock list</button>`}
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table><thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Category</th><th>Base</th><th>Locality</th><th>Photo URL</th><th>Retained by</th><th>Ret. price</th><th></th></tr></thead>
        <tbody>${list.map(([id, p]) => `
          <tr data-id="${esc(id)}">
            <td><code>${esc(id)}</code></td>
            <td><input data-f="name" value="${esc(p.name)}" ${dis} style="min-width:140px"></td>
            <td><select data-f="role" ${dis}>${roleOpts(p.role)}</select></td>
            <td><select data-f="category" ${dis}>${catOpts(p.category)}</select></td>
            <td><input data-f="basePrice" type="number" min="0" value="${p.basePrice ?? ''}" placeholder="${basePrice(p, A.rules)}" ${dis} style="width:90px"></td>
            <td><input data-f="locality" value="${esc(p.locality || '')}" ${dis}></td>
            <td><input data-f="photoUrl" value="${esc(p.photoUrl || '')}" ${dis}></td>
            <td><select data-f="retainedBy" ${dis}>${teamOpts(p.retainedBy)}</select></td>
            <td><input data-f="retainedPrice" type="number" min="0" value="${p.retainedPrice ?? ''}" ${dis} style="width:80px"></td>
            <td>${locked ? '' : '<button class="btn-sm btn-ghost" data-del>✕</button>'}</td>
          </tr>`).join('') || '<tr><td colspan="10" class="muted">No players yet - download the template, fill it in, and upload it.</td></tr>'}</tbody></table>
      </div>
      <small>Base empty = category base price. "Retained by" pre-assigns a player (e.g. the captain) to a team at the retained price when the auction starts.
        More columns (batting/bowling style, age, stats, notes) come from the CSV - export, edit in a spreadsheet, and re-upload to change them in bulk.</small>
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
    let n = list.length + 1;
    while (A.players['P' + String(n).padStart(3, '0')]) n++;
    await db.set(`${P}/players/P${String(n).padStart(3, '0')}`, { name: 'New player', role: 'All-rounder', category: A.rules.categories.at(-1).id });
  });
  $('#p-upload').onchange = run(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const rows = parseCSV(await readFile(file));
    e.target.value = '';
    await importPlayerRows(rows);
  });
  $('#p-sample').onclick = run(async () => {
    const [pt, tt] = await Promise.all([fetch('templates/sample_players.csv').then((r) => r.text()), fetch('templates/sample_teams.csv').then((r) => r.text())]);
    if (!Object.keys(A.teams).length) await addTeams(importTeams(parseCSV(tt)).teams);
    await importPlayerRows(parseCSV(pt));
  });
  el.onchange = run(async (e) => {
    const tr = e.target.closest('tr[data-id]');
    const f = e.target.dataset.f;
    if (!tr || !f) return;
    let v = e.target.value.trim();
    if (['basePrice', 'retainedPrice'].includes(f)) v = v === '' ? null : Number(v);
    if (f === 'name' && !v) throw new Error('Name is required');
    await db.set(`${P}/players/${tr.dataset.id}/${f}`, v === '' ? null : v);
  });
  el.onclick = run(async (e) => {
    if (!e.target.matches('[data-del]')) return;
    const id = e.target.closest('tr').dataset.id;
    if (!confirm(`Delete ${A.players[id].name}?`)) return;
    await db.set(`${P}/players/${id}`, null);
  });
}

async function importPlayerRows(rows) {
  const existing = Object.keys(A.players);
  const replace = existing.length && confirm(`Replace the ${existing.length} existing players?\nOK = replace all, Cancel = add to the list`);
  const { players: parsed, warnings } = importPlayers(rows, A.rules, replace ? [] : existing);
  const n = Object.keys(parsed).length;
  if (!n) throw new Error('No players found in the file. Use the template header row.');
  if (replace) await db.set(`${P}/players`, parsed);
  else await db.update(`${P}/players`, parsed);
  toast(`Imported ${n} players${warnings.length ? ` (${warnings.length} warnings)` : ''}`, 'ok');
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
        <p>Auction code: <span class="code">${aid}</span></p>
        <div class="row" style="align-items:flex-start">
          <div class="qr" id="qr"></div>
          <div style="flex:1;min-width:200px">
            <label>Join link (captains, team members, audience)</label><input readonly value="${esc(joinUrl)}" onclick="this.select()">
            <label>Watch-only link</label><input readonly value="${esc(liveUrl)}" onclick="this.select()">
            <label>Projector / big screen</label><input readonly value="${esc(screenUrl)}" onclick="this.select()">
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Admin code</h2>
        <p>Give this only to co-organisers / the auctioneer. It unlocks this admin console on any device (also your backup if you change phones).</p>
        <p><span class="code">${esc(secrets.adminCode || '')}</span></p>
        <h3>Co-admins</h3>
        <ul>${Object.entries(coadmins).map(([uid, c]) => `<li>${esc(c.name)} <button class="btn-sm btn-ghost" data-kick-admin="${esc(uid)}">remove</button></li>`).join('') || '<li class="muted">None</li>'}</ul>
      </div>
      <div class="card">
        <h2>Captain codes</h2>
        <p>Send each captain <b>only their own code</b> (WhatsApp is fine). They open the join link, pick "Captain", choose their team and enter the code.</p>
        <table><thead><tr><th>Team</th><th>Code</th><th>Signed in</th><th></th></tr></thead><tbody>
        ${Object.entries(A.teams).map(([id, t]) => `
          <tr><td>${teamName(A, id)}</td><td><span class="code">${esc(secrets.teamCodes[id] || '-')}</span></td>
          <td>${caps.filter(([, c]) => c.team === id).map(([uid, c]) => `${esc(c.name)} <button class="btn-sm btn-ghost" data-kick="${esc(uid)}" title="Sign out this device">✕</button>`).join('<br>') || '<span class="muted">-</span>'}</td>
          <td><button class="btn-sm" data-regen="${esc(id)}" title="New code; signed-in devices are signed out">New code</button>
              <button class="btn-sm" data-copy="${esc(id)}">Copy message</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Add teams first.</td></tr>'}
        </tbody></table>
      </div>
      <div class="card">
        <h2>Roles</h2>
        <ul>
          <li><b>Admin / auctioneer</b> - full control (admin code or the creator's device).</li>
          <li><b>Captain / owner</b> - bids for one team from their phone (team code).</li>
          <li><b>Team member</b> - watches live with their team highlighted (no code).</li>
          <li><b>Audience</b> - watches live, squads and results (no code).</li>
          <li><b>Big screen</b> - full-screen view for a projector or TV.</li>
        </ul>
        ${isLocal ? '<p class="notice notice-warn">Demo mode: only tabs in this browser can join. Configure Firebase (docs/SETUP.md) so phones can join.</p>' : ''}
      </div>
    </div>`;

  if (window.QRCode) new window.QRCode($('#qr'), { text: joinUrl, width: 150, height: 150 });
  el.onclick = run(async (e) => {
    const d = e.target.dataset;
    if (d.kick) await db.set(`captains/${aid}/${d.kick}`, null);
    if (d.kickAdmin) await db.set(`coadmins/${aid}/${d.kickAdmin}`, null);
    if (d.regen) {
      if (!confirm('Generate a new code? The old code stops working and signed-in captains of this team are signed out.')) return;
      await db.set(`secrets/${aid}/teamCodes/${d.regen}`, randomCode(6));
      for (const [uid, c] of caps) if (c.team === d.regen) await db.set(`captains/${aid}/${uid}`, null);
    }
    if (d.copy) {
      const msg = `🏏 ${A.meta.name}\nYou are captain of ${A.teams[d.copy].name}.\n1. Open ${joinUrl}\n2. Choose "Captain", team "${A.teams[d.copy].name}"\n3. Enter code: ${secrets.teamCodes[d.copy]}\nKeep this code private.`;
      await navigator.clipboard.writeText(msg);
      toast('Copied - paste it in WhatsApp', 'ok');
    }
  });
}

/* ---------------- 5. Control room ---------------- */

function control(el) {
  const { meta, live, rules } = A;
  if (meta.status === 'setup') {
    const teamN = Object.keys(A.teams).length;
    const playerN = Object.keys(A.players).length;
    const check = (ok, text) => `<li>${ok ? '✅' : '⬜'} ${text}</li>`;
    el.innerHTML = `
      <div class="card" style="max-width:640px">
        <h2>Ready to start?</h2>
        <ul style="list-style:none;padding:0">
          ${check(teamN >= 2, `At least 2 teams (${teamN})`)}
          ${check(playerN > 0, `Players uploaded (${playerN})`)}
          ${check(playerN >= teamN * rules.minSquad, `Enough players for every team's minimum squad (${teamN} × ${rules.minSquad} = ${teamN * rules.minSquad})`)}
          ${check(meta.locked, 'Player list locked')}
          ${check(Object.keys(captains).length > 0 || !rules.captainBidding, 'Captains signed in (optional - you can bid for them)')}
        </ul>
        <p>Starting will lock the player list, assign retained players, and open bidding.</p>
        <button class="btn-primary btn-lg" id="c-start" ${teamN >= 2 && playerN ? '' : 'disabled'}>🚀 Start auction</button>
      </div>`;
    $('#c-start').onclick = run(async () => {
      if (!confirm('Start the auction now?')) return;
      await startAuction(aid, A);
    });
    return;
  }

  const bidding = live?.status === 'bidding';
  const remaining = pool(A);
  const unsoldNow = Object.keys(A.unsold).filter((pid) => !A.sales[pid]);
  const round = Number(meta.round) || 1;
  const canNewRound = !remaining.length && unsoldNow.length && round <= Number(rules.unsoldRounds);
  const next = nextBid(live, rules);

  el.innerHTML = `
    ${meta.status === 'completed' ? '<div class="notice notice-ok">🏁 Auction completed. See the Results tab to export and archive.</div>' : ''}
    <div class="stage">
      <div class="card">${playerCard(A, live?.playerId)}</div>
      <div class="card">${bidBox(A)}</div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="row">
        <button class="btn-primary btn-lg" id="c-next" ${bidding || !remaining.length || rules.pickOrder === 'manual' || meta.status !== 'live' ? 'disabled' : ''}>Next player ▶ <small>(N)</small></button>
        <select id="c-pick" style="width:auto;max-width:260px" ${bidding || meta.status !== 'live' ? 'disabled' : ''}>
          <option value="">Pick a player…</option>
          ${remaining.map((p) => `<option value="${esc(p.id)}">${esc(p.id)} · ${esc(p.name)} (${esc(p.category)})</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <button class="btn-gold btn-lg" id="c-sold" ${bidding && live.bid?.team ? '' : 'disabled'}>🔨 SOLD <small>(S)</small></button>
        <button class="btn-danger btn-lg" id="c-unsold" ${bidding ? '' : 'disabled'}>Unsold <small>(U)</small></button>
      </div>
      <h3 style="margin-top:16px">Bid for a team ${bidding ? `- next bid <b style="color:var(--gold)">${money(next, rules)}</b>` : ''}</h3>
      <div class="bid-buttons">${Object.entries(A.teams).map(([id, t]) => {
        const why = bidding ? bidBlocker(A, id, next) : 'No player up';
        return `<button class="bid-btn" style="--c:${esc(t.color)}" data-bid="${esc(id)}" ${why ? 'disabled' : ''} title="${esc(why || '')}">
          ${esc(t.name)}<small>max ${money(teamSummary(A, id).maxBid, rules)}</small></button>`;
      }).join('')}</div>
      <div class="row" style="margin-top:14px">
        <small class="muted">Round ${round} · ${remaining.length} players left in this round · ${Object.keys(A.sales).length} sold · ${unsoldNow.length} unsold</small>
        <span class="spacer"></span>
        <button class="btn-sm" id="c-undo">↩ Undo last sale</button>
        ${bidding ? '<button class="btn-sm" id="c-reset">Reset bid to base</button>' : ''}
        ${canNewRound ? `<button class="btn-sm btn-primary" id="c-round">🔁 Start round ${round + 1} (re-auction ${unsoldNow.length} unsold)</button>` : ''}
        ${meta.status === 'live' ? '<button class="btn-sm btn-danger" id="c-finish">Finish auction</button>' : ''}
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>Teams</h3>${teamsStrip(A)}</div>
      <div class="card"><h3>Activity</h3>${feed(A)}</div>
    </div>`;

  $('#c-next').onclick = run(doNext);
  $('#c-pick').onchange = run(async (e) => e.target.value && startPlayer(aid, A, e.target.value));
  $('#c-sold').onclick = run(() => sell(aid, A));
  $('#c-unsold').onclick = run(() => markUnsold(aid, A));
  $('#c-undo').onclick = run(async () => { if (confirm('Undo the most recent sale?')) await undoLastSale(aid, A); });
  $('#c-reset') && ($('#c-reset').onclick = run(() => db.set(`${P}/live/bid`, { amount: basePrice(A.players[live.playerId], rules), team: null, at: db.now() })));
  $('#c-round') && ($('#c-round').onclick = run(() => nextRound(aid, A)));
  $('#c-finish') && ($('#c-finish').onclick = run(async () => {
    const short = Object.keys(A.teams).filter((id) => teamSummary(A, id).count < rules.minSquad);
    const warn = short.length ? `\n\n${short.length} team(s) are below the minimum squad size.` : '';
    if (confirm(`Finish the auction?${warn}`)) await finishAuction(aid);
  }));
  $$('[data-bid]', el).forEach((b) => (b.onclick = run(() => placeBid(aid, A, b.dataset.bid))));
}

async function doNext() {
  const p = pickNext(A);
  if (!p) throw new Error(pool(A).length ? 'Pick a player from the list' : 'No players left in this round');
  await startPlayer(aid, A, p.id);
}

function onKey(e) {
  if (tab !== 'control' || !A || e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  if (k === 'n' && A.live?.status !== 'bidding' && A.meta.status === 'live') run(doNext)();
  if (k === 's' && A.live?.status === 'bidding' && A.live.bid?.team) run(() => sell(aid, A))();
  if (k === 'u' && A.live?.status === 'bidding') run(() => markUnsold(aid, A))();
}

/* ---------------- 6. Results ---------------- */

function results(el) {
  const sold = Object.entries(A.sales).length;
  el.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h2>Results</h2>
        <p>${sold} players sold. <a href="${pageUrl('results.html', { a: aid })}" target="_blank">Open the results page ↗</a></p>
        <div class="row">
          <button id="r-csv">⬇ Squads CSV</button>
          <button id="r-json">⬇ Full auction JSON</button>
        </div>
      </div>
      <div class="card">
        <h2>Keep results online forever</h2>
        <ol>
          <li>Download the <b>full auction JSON</b>.</li>
          <li>In GitHub, add it as <code>archive/${esc(slug(A.meta.name))}/auction.json</code>.</li>
          <li>Add an entry to <code>archive/index.json</code>.</li>
        </ol>
        <p>GitHub Pages then serves it at <code>results.html?archive=${esc(slug(A.meta.name))}</code> - free, permanently, even if the live database is cleaned up.</p>
      </div>
    </div>`;
  $('#r-csv').onclick = () => {
    const rows = Object.entries(A.sales).map(([pid, s]) => {
      const p = A.players[pid] || {};
      return [A.teams[s.team]?.name || s.team, pid, p.name, p.role, p.category, s.price, s.retained ? 'retained' : `round ${s.round}`];
    }).sort((x, y) => String(x[0]).localeCompare(y[0]) || y[5] - x[5]);
    const unsold = Object.keys(A.players).filter((pid) => !A.sales[pid]).map((pid) => ['UNSOLD', pid, A.players[pid].name, A.players[pid].role, A.players[pid].category, '', '']);
    download(`${aid}_results.csv`, toCSV(['team', 'player_id', 'name', 'role', 'category', 'price', 'how'], [...rows, ...unsold]));
  };
  $('#r-json').onclick = () => download(`${slug(A.meta.name) || aid}.auction.json`, JSON.stringify(exportSnapshot(A), null, 2), 'application/json');
}

boot();
