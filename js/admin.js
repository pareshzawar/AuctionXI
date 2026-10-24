import { db, isLocal } from './db.js';
import { qrSvg } from './qr.js';
import { historyFromRecord, seasonsOf } from './history.js';
import {
  normalize, money, teamSummary, nextBid, bidBlocker, bidLimit, pickNext, pool, poolCounts, searchPool, searchPlayers, capsUpdate, basePrice, withDefaults,
  ROLES, roleId, PICK_ORDERS, BID_MODES, LEADERS, BIDDERS, PURSE_VISIBILITY, randomCode, slug, category,
  leadersOf, hasVC, vcCanBid, isAllotted, leaderLabel, allottedPrice, miniBudget, minBase, linkLeaders, leaderNamesUpdate,
  BOWLING_TYPES, battingHandOf, bowlingArmOf, bowlingTypeOf, VISIBILITY, visibilityOf, isWaiting, isCancelled, inAuction,
  STAGES, stageOf,
} from './engine.js';
import {
  isAdmin, claimCoadmin, placeBid, undoLastBid, recordRoomSale, startPlayer, sell, markUnsold, undoLastSale,
  startAuction, nextRound, finishAuction, exportSnapshot, createMiniAuction, createMockAuction, resetAuction, deleteAuction,
  setVisibility, syncDirectory, directoryEntry, rememberOnAccount, undoSale, editSale, setTimer, lockDetails, unlockDetails,
} from './actions.js';
import {
  parseCSV, importPlayers, importTeams, playerTemplate, teamTemplate, playersToCSV, toCSV, setupToCSV, importSetup,
  HOUSE_RULE_QUESTIONS, TEAM_COLORS, num,
} from './csv.js';
import { $, $$, esc, toast, param, download, readFile, mountHeader, pageUrl, shareUrl, watchConnection, setSession, rememberAuction, deviceCommLang, setDeviceCommLang } from './ui.js';
import { teamBadge, badge, price, startCountdowns } from './ds.js';
import { cardFor, livePanel, purses, feed, maxBidExplainer, profileGroups } from './views.js';
import { createCommentator, createVoice, LANGUAGES } from './commentary.js';
import { downloadTracker, preloadExcel } from './tracker.js';
import { aiReady, aiSettingsCard, aiCommentLine, askAI, parseJSON, playerFacts } from './ai.js';
import { downloadDeck } from './deck.js';
import { watchMedia, applyMedia, setPlayerPhoto, setBrand, setTeamBanner, resizeImage, matchPhotoFiles, PHOTO, LOGO, BANNER } from './media.js';

const aid = (param('a') || '').toUpperCase();
const P = `auctions/${aid}`;
let A = null;
let secrets = { teamCodes: {}, vcCodes: {} };
let captains = {};
let coadmins = {};
let media = {}; // uploaded player photos, league logo and banner
let tab = param('tab') || localStorage.getItem('auctionxi:admintab') || 'setup';
let pendingRender = false;
// Next-player panel: 'random' draw (optionally from one pool / role) or 'chit' (search by name).
let drawMode = localStorage.getItem('auctionxi:drawmode') || null;
let drawPool = '';
let drawRole = '';
let miniKeep = null;
const voice = createVoice();
const commLang = () => deviceCommLang() || A?.rules.commentaryLang || 'en';
const makeCommentator = () => createCommentator({ lang: commLang, onLog: aiOnEvent, onLine: (line) => { voice.say(line); if (tab === 'control') renderCommentary(); } });

// AI commentary: this laptop writes a line for each player up / sold / unsold with its own AI key,
// and saves it in the auction so every screen shows (and can read out) the same line.
// If the AI fails (quota or rate limit used up, key refused, service down or too slow), AI commentary
// pauses by itself: 1, then 5, then 15 minutes (30 for a refused key), then it tries again. While it
// is paused meta/aiStatus tells every screen to read the built-in lines at once.
let aiBusy = false;
let aiNext = null;
let aiFails = 0;
let aiPausedUntil = 0;
const AI_PAUSE = [60e3, 5 * 60e3, 15 * 60e3];
const AI_WHY = { limit: 'the AI key\'s limit is used up', key: 'the AI key was refused', down: 'the AI service is not answering', other: 'the AI gave an error' };
function aiOnEvent(e) {
  if (!A?.meta.aiCommentary || !aiReady() || !['up', 'sold', 'unsold'].includes(e.type)) return;
  if (Date.now() < aiPausedUntil) return; // paused: the built-in line is used
  aiNext = e;
  if (!aiBusy) aiRun();
}
async function aiFailed(err) {
  aiFails++;
  const wait = err.kind === 'key' ? 30 * 60e3 : AI_PAUSE[Math.min(aiFails - 1, AI_PAUSE.length - 1)];
  aiPausedUntil = Date.now() + wait;
  await db.set(`${P}/meta/aiStatus`, { down: true, until: db.now() + wait, why: err.kind || 'other' }).catch(() => {});
  toast(`${AI_WHY[err.kind] || AI_WHY.other}: switched to the built-in commentary for ${Math.round(wait / 60e3)} min, then AI is tried again. (${err.message})`, 'error');
}
async function aiRecovered() {
  if (!aiFails && !A.meta.aiStatus) return;
  aiFails = 0;
  aiPausedUntil = 0;
  await db.set(`${P}/meta/aiStatus`, null).catch(() => {});
  toast('AI commentary is back', 'ok');
}
async function aiRun() {
  const e = aiNext;
  aiNext = null;
  if (!e) return;
  aiBusy = true;
  try {
    const lang = A.rules.commentaryLang || 'en';
    const text = await aiCommentLine(A, e, lang, money);
    if (text) await db.push(`${P}/aicomm`, { text: text.slice(0, 400), lang, kind: e.type, event: e.at, at: db.now() });
    await aiRecovered();
  } catch (err) {
    await aiFailed(err);
  } finally {
    aiBusy = false;
    if (aiNext) aiRun();
  }
}
let commentator = makeCommentator();
// Arriving from "Create → Mini" on the home page: open the mini-auction builder pre-filled.
const miniPreset = param('mini') ? { name: param('mname') || '', season: param('season') || '' } : null;
if (miniPreset) tab = 'results'; // mini auction builder: { teamId: Set(playerId) } the admin is ticking

mountHeader(`<a class="btn btn-sm" href="index.html#create" title="Set up another auction. Each has its own code, so several can run side by side">New auction</a>
  <button class="btn-sm" id="h-pack" title="Excel tracker filled in with everything so far, plus a backup file: to carry on by hand if anything goes wrong">Download offline pack</button>
  <a class="btn btn-sm" target="_blank" href="${pageUrl('live.html', { a: aid })}">Open live view</a>
  <a class="btn btn-sm" target="_blank" href="${pageUrl('live.html', { a: aid, screen: 1 })}">Open stage screen</a>`);
$('#h-pack').onclick = () => downloadPack();

// Every error message offers the offline pack, so the auction so far is never lost.
const packAction = { label: 'Download offline pack', onClick: () => downloadPack() };
const run = (fn) => async (...args) => {
  try { await fn(...args); } catch (e) {
    console.error(e);
    const msg = /permission/i.test(e.message || '') ? 'Not allowed: creating auctions (mock, mini) needs an approved organiser signed in with Google on the home page; changing this one needs its admin.' : (e.message || String(e));
    toast(msg, 'error', A?.meta?.status === 'live' || A?.meta?.status === 'completed' ? { action: packAction } : {}); }
};
// Anything unexpected on this page: same offer.
addEventListener('error', (e) => { if (A) toast(`Something went wrong: ${e.message || 'unknown error'}`, 'error', { action: packAction }); });
addEventListener('unhandledrejection', (e) => { if (A) toast(`Something went wrong: ${e.reason?.message || e.reason || 'unknown error'}`, 'error', { action: packAction }); });

async function boot() {
  const meta = await db.get(`${P}/meta`);
  if (!meta) {
    $('main').innerHTML = '<div class="card"><h2>Auction not found</h2><p><a href="index.html">Back to home</a></p></div>';
    return;
  }
  if (!(await isAdmin(aid, meta))) {
    $('#gate').classList.remove('hidden');
    // On a new laptop: the Google account that created the auction is enough; otherwise the admin code.
    if (!isLocal && !db.email()) {
      const b = document.createElement('p');
      b.innerHTML = '<button type="button" class="btn-sm" id="gate-google">Sign in with Google</button> <small class="muted">if this auction was made with your Google account</small>';
      $('#gate-form').before(b);
      $('#gate-google').onclick = run(async () => { await db.signInGoogle(); location.reload(); });
    }
    $('#gate-form').addEventListener('submit', run(async (e) => {
      e.preventDefault();
      await claimCoadmin(aid, $('#gate-code').value.trim().toUpperCase(), $('#gate-name').value.trim());
      location.reload();
    }));
    return;
  }
  setSession(aid, { role: 'admin' });
  rememberAuction(aid, meta.name, 'admin');
  rememberOnAccount(aid, meta, meta.ownerUid === db.uid() ? 'owner' : 'admin');
  $('#app').classList.remove('hidden');
  $('#aid').textContent = aid;

  if (param('created')) {
    toast('Auction created. Next: fill in the setup.', 'ok');
    history.replaceState(null, '', pageUrl('admin.html', { a: aid }));
  }

  db.on(`secrets/${aid}`, (v) => { secrets = v || {}; secrets.teamCodes ||= {}; secrets.vcCodes ||= {}; render(); });
  db.on(`captains/${aid}`, (v) => { captains = v || {}; render(); });
  db.on(`coadmins/${aid}`, (v) => { coadmins = v || {}; render(); });
  watchMedia(aid, (m) => { media = m; if (A) { applyMedia(A, media); render(); } });
  watchConnection(db, {
    text: 'The database can\'t be reached. Everything you change is kept in this tab and sent when the connection is back, so <b>don\'t close or reload this tab</b>. Phones can\'t bid meanwhile: take paddle bids and record them here, or carry on with the slides and the Excel tracker.',
    extra: ' <button class="btn-sm" data-offline-action="backup">Download offline pack</button>',
  });
  document.addEventListener('offline-action', (e) => { if (e.detail === 'backup') downloadPack(); });
  db.on(P, (v) => {
    A = applyMedia(normalize(v), media);
    if (!A) return;
    keepBackup();
    if (A.meta.status === 'live') preloadExcel().catch(() => {});
    commentator.update(A);
    $('#title').textContent = A.meta.name;
    const st = STAGES[stageOf(A.meta)];
    $('#status').innerHTML = badge(st.badge, { text: st.text })
      + ` ${badge(A.meta.kind === 'mini' ? 'retained' : 'upcoming', { text: A.meta.kind === 'mini' ? 'Mini auction' : 'Major auction' })}`
      + (A.meta.mock ? ` ${badge('unsold', { text: 'Mock' })}` : '')
      + (visibilityOf(A.meta) === 'private' ? ` ${badge('unsold', { text: 'Private' })}` : '')
      + ` <small>${esc([A.meta.tournament, A.meta.season && `season ${A.meta.season}`, A.meta.kind === 'mini' && `based on ${A.meta.parentName || A.meta.parent}`].filter(Boolean).join(' · '))}</small>`;
    mockBar();
    keepDirectory();
    render();
  });

  $$('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; localStorage.setItem('auctionxi:admintab', tab); render(true); }));
  // Catch up after typing, but not while moving from the jump box to a team button (the click
  // would land on a redrawn button and be lost).
  $('#panel').addEventListener('focusout', (e) => setTimeout(() => pendingRender && !e.relatedTarget?.closest?.('[data-bid]') && render(), 0));
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
  const ready = stageOf(meta) === 'ready';
  el.innerHTML = `${detailsCard()}${brandingCard()}${pastSeasonsCard()}<div class="card" id="ai-card" style="margin-bottom:var(--space-4)"></div>
    <div class="card" style="margin-bottom:var(--space-4)">
      <div class="section-title"><h2>Fill the setup from a questionnaire</h2></div>
      <p>Every tournament is different. Download the questionnaire (it already has this auction's current answers), fill in the
        <b>answer</b> column in Excel or Google Sheets with the organising committee, and upload it. It covers the format, purse,
        squad size, captain and vice-captain prices, who bids, who sees purses, base price, bid increments, bidding mode and house rules.</p>
      <div class="row">
        <button class="btn-primary" id="q-download">Download setup questionnaire</button>
        ${ready ? '' : '<label class="btn" style="margin:0;text-transform:none;letter-spacing:0;font-size:15px;color:var(--ink)">Upload filled questionnaire<input type="file" accept=".csv,text/csv" id="q-upload" hidden></label>'}
        <a class="btn btn-ghost" href="templates/sample_tournament_setup.csv" download>Example: filled sample</a>
      </div>
    </div>
    <fieldset class="lockset" ${ready ? 'disabled' : ''}>
    <div class="grid grid-2">
      <div class="card">
        <h2>Tournament</h2>
        ${field('Auction name', `<input id="s-name" value="${esc(meta.name)}">`)}
        ${field('Tournament', `<input id="s-tournament" value="${esc(meta.tournament || '')}">`)}
        <div class="grid grid-2" style="gap:var(--space-3)">
          ${field('Venue', `<input id="s-venue" value="${esc(meta.venue || '')}">`)}
          ${field('Date', `<input id="s-date" type="date" value="${esc(meta.date || '')}">`)}
          ${field('Season', `<input id="s-season" value="${esc(meta.season || '')}" placeholder="e.g. 2026 or 3">`)}
          ${field('Time', `<input id="s-time" value="${esc(meta.time || '')}" placeholder="e.g. 6 PM - 9 PM">`)}
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
          ${field('Squad size', numIn('r-squad', rules.squadSize), `Every team must own exactly this many, captain${hasVC(rules) ? ' and VC' : ''} included. ${Math.max(0, rules.squadSize - rules.playersPerSide)} reserve(s) for ${rules.playersPerSide}-a-side.`)}
          ${field('Price cap per player', numIn('r-cap', rules.maxPlayerPrice || ''), 'Blank = no cap')}
        </div>
      </div>
      <div class="card">
        <h2>Captain and vice-captain</h2>
        ${field('Allotted to each team before the auction', `<select id="r-leaders">${Object.entries(LEADERS).map(([k, v]) => `<option value="${k}" ${k === rules.leaders ? 'selected' : ''}>${v}</option>`).join('')}</select>`, 'Mark them in the players list: Allotted to + As C / VC.')}
        <div class="grid grid-2" style="gap:var(--space-3)">
          ${field('Captain value', numIn('r-cprice', rules.captainPrice), 'Not taken from the purse')}
          ${field('Vice-captain value', numIn('r-vcprice', rules.vcPrice), 'Not taken from the purse. Ignored with captain only')}
        </div>
        <span class="hint">The value is recorded for next season's mini auction: if the captain or vice-captain is unavailable, it is added to the team's budget along with its remaining purse.</span>
        ${field('Who bids for the team', `<select id="r-bidders">${Object.entries(BIDDERS).map(([k, v]) => `<option value="${k}" ${k === rules.bidders ? 'selected' : ''}>${v}</option>`).join('')}</select>`, 'Vice-captains get their own code under Access and sharing.')}
        ${field('Who sees each team\'s remaining budget', `<select id="r-visibility">${Object.entries(PURSE_VISIBILITY).map(([k, v]) => `<option value="${k}" ${k === rules.purseVisibility ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${field('Who sees each team\'s max bid', `<select id="r-maxvis"><option value="" ${!rules.maxBidVisibility ? 'selected' : ''}>Same as the budget</option>${Object.entries(PURSE_VISIBILITY).map(([k, v]) => `<option value="${k}" ${k === rules.maxBidVisibility ? 'selected' : ''}>${v}</option>`).join('')}</select>`, 'A captain always sees their own team\'s max bid on their phone.')}
        <label class="check" style="margin-top:var(--space-2)"><input type="checkbox" id="r-showbid" ${rules.showCurrentBid === false ? '' : 'checked'}> Show the current bid on the stage and audience phones</label>
        <span class="hint">Off: the room hears the bids, the screens show who is up and then SOLD with the price. Admins and bidding captains always see the bid.</span>
        <p class="notice notice-info" style="margin:var(--space-4) 0 0">${esc(maxBidExplainer(rules).rule)}<br>${esc(maxBidExplainer(rules).example)}</p>
      </div>
      <div class="card wide">
        <h2>Pools and base prices</h2>
        <div class="table-wrap"><table class="grid-table"><thead><tr><th>ID</th><th>Name</th><th>Base price</th><th>Min / team</th><th>Max / team</th><th></th></tr></thead>
          <tbody id="cats">${rules.categories.map(catRow).join('')}</tbody></table></div>
        <p style="margin-top:var(--space-2)"><button class="btn-sm" id="add-cat">Add pool</button></p>
        <span class="hint">Pool A = the strongest players, then B, C… The admin puts each player in a pool (Players tab or the pool column of the CSV). Random draws go pool by pool in this order. Min / max per team enforce rules like "at least 1 Pool A player" or "at most 3 Pool A players".</span>
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
        ${field('Order players come up', `<select id="r-order">${Object.entries(PICK_ORDERS).map(([k, v]) => `<option value="${k}" ${k === rules.pickOrder ? 'selected' : ''}>${v}</option>`).join('')}</select>`, 'Allotted captains and vice-captains are never auctioned.')}
        <label class="check" style="margin-top:var(--space-3)"><input type="checkbox" id="r-comm" ${rules.commentary === false ? '' : 'checked'}> Live commentary on the stage, phones and here</label>
        ${field('Commentary language', `<select id="r-commlang">${Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}" ${k === rules.commentaryLang ? 'selected' : ''}>${v}</option>`).join('')}</select>`, 'The default for this tournament. Every phone can switch for itself.')}
        ${field('Commentary humour', `<select id="r-humour"><option value="high" ${rules.humour !== 'normal' ? 'selected' : ''}>High: punchlines and jokes</option><option value="normal" ${rules.humour === 'normal' ? 'selected' : ''}>Normal: just the facts</option></select>`, 'Jokes are about the auction and the money, never about a person.')}
      </div>
      <div class="card">
        <h2>House rules</h2>
        <p class="muted">Shown to everyone on the live page under Rules. Leave blank what doesn't apply.</p>
        ${HOUSE_RULE_QUESTIONS.map(([key, q, help]) => field(esc(key.startsWith('hr_other') ? 'Other rule' : q), `<textarea data-house="${key}" rows="2" placeholder="${esc(help)}">${esc(house[key] || '')}</textarea>`)).join('')}
      </div>
    </div>
    ${A.meta.status !== 'setup' ? '<p class="notice notice-warn" style="margin-top:var(--space-4)">The auction has started. Changing purse or squad rules now affects every team immediately.</p>' : ''}
    ${ready ? '' : `<p class="row" style="margin-top:var(--space-4)"><button class="btn-lg" id="save-setup">${A.meta.status === 'setup' ? 'Save as draft' : 'Save setup'}</button>${A.meta.status === 'setup' ? '<button class="btn-primary btn-lg" id="save-lock">Save and lock details</button><small class="muted">Draft: save as often as you like. Lock when the setup, teams and players are final.</small>' : ''}</p>`}
    </fieldset>`;

  wireBranding(el);
  wirePastSeasons(el);
  aiSettingsCard($('#ai-card', el));
  wireDetailsCard(el);
  $('#q-download').onclick = () => download(`${slug(meta.name) || aid}_setup.csv`, setupToCSV(meta, rules));
  if (ready) return;
  $('#add-cat').onclick = () => $('#cats').insertAdjacentHTML('beforeend', catRow({ id: '', label: '', base: '', min: '', max: '' }));
  $('#add-inc').onclick = () => $('#incs').insertAdjacentHTML('beforeend', incRow({ upto: '', step: '' }));
  el.onclick = (e) => { if (e.target.matches('[data-del-row]')) e.target.closest('tr').remove(); };
  $('#save-setup').onclick = run(saveSetup);
  if ($('#save-lock')) $('#save-lock').onclick = run(async () => { await saveSetup({ quiet: true }); await lockAll(); });
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

// Draft or Ready, on top of the Setup tab. Ready = the setup, teams and players are saved and locked:
// nothing that changes who is in the auction or the money can be edited by accident. Photos,
// banners, past seasons, the AI key and small player fixes still work.
function detailsCard() {
  const s = stageOf(A.meta);
  if (s === 'live' || s === 'completed') return '';
  const teamN = Object.keys(A.teams).length;
  const playerN = Object.keys(A.players).length;
  return s === 'ready'
    ? `<div class="notice notice-ok" style="margin-bottom:var(--space-4)">${badge('retained', { text: 'Ready' })} <b>Details saved and locked.</b> The setup, teams (${teamN}) and players (${playerN}) are final${A.meta.detailsLockedAt ? ` since ${esc(new Date(A.meta.detailsLockedAt).toLocaleString())}` : ''}. Photos, banners, past seasons and small player fixes (<b>Edit</b> in Players) still work.
        <button class="btn-sm" id="d-unlock">Unlock (back to draft)</button></div>`
    : `<div class="notice notice-info" style="margin-bottom:var(--space-4)">${badge('upcoming', { text: 'Draft' })} <b>This auction is a draft.</b> Fill in the setup, teams (${teamN}) and players (${playerN}) at your own pace: every save is kept. When it is all final, <b>Save and lock details</b> to mark it Ready.
        <button class="btn-sm btn-primary" id="d-lock">Save and lock details</button></div>`;
}
function wireDetailsCard(el) {
  if ($('#d-unlock', el)) $('#d-unlock', el).onclick = run(async () => {
    if (!confirm('Unlock the details? The setup, teams and players can be changed again until you lock them or start the auction.')) return;
    await unlockDetails(aid, A);
    toast('Back to draft: details can be changed', 'ok');
  });
  if ($('#d-lock', el)) $('#d-lock', el).onclick = run(async () => {
    if (tab === 'setup' && $('#save-setup')) await saveSetup({ quiet: true });
    await lockAll();
  });
}
async function lockAll() {
  if (Object.keys(A.teams).length < 2) throw new Error('Add at least 2 teams before locking the details');
  if (!Object.keys(A.players).length) throw new Error('Add the players before locking the details');
  if (!confirm('Save and lock the details? The setup, teams and player list become final (Ready). You can unlock them again before the auction starts.')) { toast('Draft saved', 'ok'); render(true); return; }
  await lockDetails(aid, A);
  toast('Details saved and locked: Ready', 'ok');
  render(true);
}

async function saveSetup({ quiet = false } = {}) {
  const categories = $$('#cats tr').map((tr) => ({
    id: $('.c-id', tr).value.trim().replace(/[.#$/[\]\s]/g, ''), label: $('.c-label', tr).value.trim(),
    base: num($('.c-base', tr).value) || 0, min: num($('.c-min', tr).value) || 0, max: num($('.c-max', tr).value) || 0,
  })).filter((c) => c.id);
  if (!categories.length) throw new Error('Add at least one pool');
  if (new Set(categories.map((c) => c.id)).size !== categories.length) throw new Error('Pool IDs must be unique');
  categories.forEach((c) => { c.label ||= c.id; });
  const increments = $$('#incs tr').map((tr) => ({ upto: num($('.i-upto', tr).value) || 0, step: num($('.i-step', tr).value) || 0 }))
    .filter((s) => s.step > 0).sort((x, y) => (x.upto || Infinity) - (y.upto || Infinity));
  if (!increments.length) throw new Error('Add at least one bid increment');
  const rules = {
    ...A.rules,
    currency: $('#r-currency').value.trim() || '₹',
    purse: n('#r-purse'),
    squadSize: n('#r-squad') || 1,
    maxPlayerPrice: n('#r-cap'),
    leaders: $('#r-leaders').value,
    captainPrice: n('#r-cprice'),
    vcPrice: n('#r-vcprice'),
    bidders: $('#r-bidders').value,
    purseVisibility: $('#r-visibility').value,
    maxBidVisibility: $('#r-maxvis').value,
    showCurrentBid: $('#r-showbid').checked,
    playersPerSide: n('#r-side') || null,
    overs: n('#r-overs') || null,
    bidTimer: n('#r-timer'),
    unsoldRounds: n('#r-rounds'),
    pickOrder: $('#r-order').value,
    commentary: $('#r-comm').checked,
    commentaryLang: $('#r-commlang').value,
    humour: $('#r-humour').value,
    bidMode: $('#r-mode').value,
    roleMin: Object.fromEntries(Object.keys(ROLES).map((k) => [k, n(`#role-${k}`)])),
    categories,
    increments,
    houseRules: $$('[data-house]').filter((t) => t.value.trim()).map((t) => {
      const q = HOUSE_RULE_QUESTIONS.find(([k]) => k === t.dataset.house);
      return { key: t.dataset.house, q: t.dataset.house.startsWith('hr_other') ? '' : q[1], a: t.value.trim() };
    }),
  };
  if (rules.playersPerSide && rules.squadSize < rules.playersPerSide) throw new Error('Squad size cannot be smaller than players per side');
  await saveRules({
    ...A.meta,
    name: $('#s-name').value.trim() || A.meta.name,
    tournament: $('#s-tournament').value.trim() || null,
    venue: $('#s-venue').value.trim() || null,
    date: $('#s-date').value || null,
    season: $('#s-season').value.trim() || null,
    time: $('#s-time').value.trim() || null,
    organiser: $('#s-organiser').value.trim() || null,
  }, rules);
  if (!quiet) { toast(A.meta.status === 'setup' ? 'Draft saved' : 'Setup saved', 'ok'); render(true); }
}

async function saveRules(meta, rules) {
  for (const k of ['captainBidding', 'reservesPerTeam', 'reserveBasePrice', 'retainedPriceDefault', 'minSquad', 'maxSquad']) delete rules[k];
  await db.update(P, {
    'meta/name': meta.name || A.meta.name,
    'meta/tournament': meta.tournament || null,
    'meta/venue': meta.venue || null,
    'meta/date': meta.date || null,
    'meta/season': meta.season || null,
    'meta/time': meta.time || null,
    'meta/organiser': meta.organiser || null,
    rules,
    ...capsUpdate({ ...A, rules: withDefaults(rules) }),
  });
}

/* ---------------- 2. Teams ---------------- */

function teams(el) {
  const entries = Object.entries(A.teams);
  const ready = stageOf(A.meta) === 'ready';
  el.innerHTML = `
    ${ready ? `<div class="notice notice-ok" style="margin-bottom:var(--space-4)">${badge('retained', { text: 'Ready' })} Teams are locked with the other details. Banners can still be changed below. <button class="btn-sm" id="d-unlock">Unlock (back to draft)</button></div>` : ''}
    <div class="card">
      <div class="section-title">
        <h2>Teams (${entries.length})</h2><span class="spacer"></span>
        <button class="btn-sm" id="t-template">Download teams template</button>
        ${ready ? '' : `<label class="btn btn-sm" style="margin:0;text-transform:none;letter-spacing:0;color:var(--ink)">Upload teams CSV<input type="file" accept=".csv,text/csv" id="t-upload" hidden></label>
        <button class="btn-sm btn-primary" id="t-add">Add team</button>`}
      </div>
      <fieldset class="lockset" ${ready ? 'disabled' : ''}>
      <div class="table-wrap">
        <table class="grid-table"><thead><tr><th>ID</th><th>Name</th><th>Code</th><th>Colour</th><th>Captain</th>${hasVC(A.rules) ? '<th>Vice-captain</th>' : ''}<th>Owner</th><th>Sponsor</th><th>Budget</th><th>Players</th><th></th></tr></thead>
        <tbody>${entries.map(([id, t]) => `
          <tr data-id="${esc(id)}">
            <td><code>${esc(id)}</code></td>
            <td><input data-f="name" value="${esc(t.name)}"></td>
            <td><input data-f="short" value="${esc(t.short || '')}" maxlength="4" style="width:70px;min-width:70px"></td>
            <td><input data-f="color" type="color" value="${esc(t.color || '#888888')}"></td>
            <td><input data-f="captainName" value="${esc(leadersOf(A, id).C?.name || t.captainName || '')}" placeholder="Optional" list="player-names"></td>
            ${hasVC(A.rules) ? `<td><input data-f="vcName" value="${esc(leadersOf(A, id).VC?.name || t.vcName || '')}" placeholder="Optional" list="player-names"></td>` : ''}
            <td><input data-f="owner" value="${esc(t.owner || '')}" placeholder="Optional"></td>
            <td><input data-f="sponsor" value="${esc(t.sponsor || '')}" placeholder="Optional"></td>
            <td><input data-f="purse" inputmode="numeric" value="${esc(t.purse ?? '')}" placeholder="${esc(money(A.rules.purse, A.rules))}" style="width:100px" title="Blank = the standard purse. A mini auction fills in each team's carried-over budget"></td>
            <td>${teamSummary(A, id).count}</td>
            <td><button class="btn-sm btn-ghost" data-del>Remove</button></td>
          </tr>`).join('') || '<tr><td colspan="10" class="muted">No teams yet. Add teams or upload the CSV.</td></tr>'}</tbody></table>
      </div>
      </fieldset>
      <datalist id="player-names">${Object.values(A.players).map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>
      <span class="hint">Only the name is required. Three-letter codes appear on the stage and phones. Type the captain${hasVC(A.rules) ? ' and vice-captain' : ''} here or in the teams CSV:
        they are matched to the player list, and anyone not in it yet is added, allotted to the team and never auctioned. Each team gets secret codes under Access and sharing.</span>
    </div>
    ${entries.length ? teamBannersCard(entries) : ''}`;
  wireTeamBanners(el);
  wireDetailsCard(el);

  $('#t-template').onclick = () => download('teams_template.csv', teamTemplate());
  if (ready) return;
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
    if (A.meta.locked && Object.values(parsed).some((t) => t.captainName || t.vcName)) throw new Error('The player list is locked. Unlock it (Players tab) before uploading teams with captains.');
    if (replace) await db.update(P, Object.fromEntries(Object.keys(A.teams).map((id) => [`teams/${id}`, null])));
    await addTeams(parsed);
    warnings.push(...await syncLeaders());
    toast(`Imported ${Object.keys(parsed).length} teams${warnings.length ? ` with ${warnings.length} notes` : ''}`, 'ok');
    if (warnings.length) alert(warnings.join('\n'));
  });
  el.onchange = run(async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || !e.target.dataset.f) return;
    let v = e.target.value.trim() || null;
    if (e.target.dataset.f === 'short' && v) v = v.toUpperCase();
    if (e.target.dataset.f === 'captainName' || e.target.dataset.f === 'vcName') {
      if (A.meta.locked) { render(true); throw new Error('The player list is locked. Unlock it (Players tab) to change captains or vice-captains.'); }
      await db.set(`${P}/teams/${tr.dataset.id}/${e.target.dataset.f}`, v);
      const notes = await syncLeaders();
      if (notes.length) alert(notes.join('\n'));
      saved(`${A.teams[tr.dataset.id]?.name}: ${FIELD_NAMES[e.target.dataset.f]} saved`);
      return;
    }
    if (e.target.dataset.f === 'purse') {
      if (v != null && num(v) == null) throw new Error(`"${v}" is not an amount`);
      await db.update(P, { [`teams/${tr.dataset.id}/purse`]: v == null ? null : num(v) });
      await db.update(P, capsUpdate(normalize(await db.get(P))));
      saved(`${A.teams[tr.dataset.id]?.name}: budget saved`);
      return;
    }
    await db.set(`${P}/teams/${tr.dataset.id}/${e.target.dataset.f}`, v);
    saved(`${v && e.target.dataset.f === 'name' ? v : A.teams[tr.dataset.id]?.name}: ${FIELD_NAMES[e.target.dataset.f] || 'change'} saved`);
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

// Apply team captain / vice-captain names to the player list (link), then write the names of
// whoever is allotted back onto the teams. Returns notes for the admin.
async function syncLeaders({ link = true } = {}) {
  let a = normalize(await db.get(P));
  const notes = [];
  if (link) {
    const { updates, warnings } = linkLeaders(a);
    notes.push(...warnings);
    if (Object.keys(updates).length) {
      if (a.meta.locked) throw new Error('The player list is locked. Unlock it (Players tab) to change captains or vice-captains.');
      await db.update(P, updates);
      a = normalize(await db.get(P));
    }
  }
  const names = leaderNamesUpdate(a);
  if (Object.keys(names).length) await db.update(P, names);
  await db.update(P, capsUpdate(normalize(await db.get(P))));
  return notes;
}

async function addTeams(map) {
  const upd = {};
  const codes = {};
  for (const [id, t] of Object.entries(map)) {
    upd[`teams/${id}`] = t;
    if (!secrets.teamCodes[id]) codes[`teamCodes/${id}`] = randomCode(6);
    if (!secrets.vcCodes[id]) codes[`vcCodes/${id}`] = randomCode(6);
  }
  await db.update(P, upd);
  if (Object.keys(codes).length) await db.update(`secrets/${aid}`, codes);
  await db.update(P, capsUpdate(normalize(await db.get(P))));
}

/* ---------------- 3. Players ---------------- */

// A short "saved" note after each edit, so it is clear nothing more needs pressing.
const FIELD_NAMES = { name: 'name', role: 'role', category: 'pool', battingHand: 'batting hand', bowlingArm: 'bowling arm', bowlingType: 'bowling type', basePrice: 'base price',
  locality: 'locality', photoUrl: 'photo link', allottedTeam: 'team', allottedAs: 'captain / vice-captain', short: 'code', color: 'colour', captainName: 'captain', vcName: 'vice-captain', owner: 'owner', sponsor: 'sponsor', purse: 'budget' };
const saved = (msg) => toast(`✓ ${msg}`, 'ok');

// Edit one player's details in a dialog with its own Save button. Allowed even when the list is
// locked or the auction is running: these fields never change who is in the auction or the money.
const EDIT_FIELDS = [
  ['name', 'Name', 'text'], ['role', 'Role', 'role'], ['battingHand', 'Bats', 'bat'], ['bowlingArm', 'Bowls', 'arm'], ['bowlingType', 'Bowling type', 'type'],
  ['age', 'Age', 'num'], ['locality', 'Locality / flat wing', 'text'], ['matches', 'Matches', 'num'], ['runs', 'Runs', 'num'], ['wickets', 'Wickets', 'num'],
  ['strikeRate', 'Strike rate', 'dec'], ['highest', 'Highest score', 'text'], ['economy', 'Economy', 'dec'], ['cricheroesUrl', 'CricHeroes link', 'text'],
  ['notes', 'Notes', 'area'], ['scout', 'Scouting note', 'area'],
];
function editPlayer(id) {
  const p = A.players[id];
  if (!p) return;
  const val = (k) => (k === 'battingHand' ? battingHandOf(p) : k === 'bowlingArm' ? bowlingArmOf(p) : k === 'bowlingType' ? bowlingTypeOf(p) : p[k]) ?? '';
  const input = ([k, , kind]) => {
    const v = val(k);
    if (kind === 'role') return `<select data-e="${k}">${Object.entries(ROLES).map(([r, x]) => `<option value="${r}" ${r === roleId(v) ? 'selected' : ''}>${x.name}</option>`).join('')}</select>`;
    if (kind === 'bat' || kind === 'arm') return `<select data-e="${k}"><option value="">${kind === 'arm' ? 'Doesn\'t bowl' : '—'}</option><option value="R" ${v === 'R' ? 'selected' : ''}>Right</option><option value="L" ${v === 'L' ? 'selected' : ''}>Left</option></select>`;
    if (kind === 'type') return `<select data-e="${k}"><option value="">—</option>${[...new Set([...BOWLING_TYPES, v].filter(Boolean))].map((t) => `<option ${t === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    if (kind === 'area') return `<textarea data-e="${k}" rows="2">${esc(v)}</textarea>`;
    return `<input data-e="${k}" value="${esc(v)}" ${kind === 'num' || kind === 'dec' ? 'inputmode="decimal"' : ''}>`;
  };
  const dlg = document.createElement('dialog');
  dlg.className = 'card';
  dlg.style.cssText = 'max-width:720px;width:calc(100% - 32px);max-height:88vh;overflow:auto;color:var(--ink);background:var(--surface);border:1px solid var(--line)';
  dlg.innerHTML = `<h2 style="margin-top:0">${esc(p.name)} <small class="muted">${esc(id)}</small></h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:var(--space-2) var(--space-4)">${EDIT_FIELDS.map((f) => `<label style="margin:0;${f[2] === 'area' ? 'grid-column:1/-1' : ''}">${f[1]}${input(f)}</label>`).join('')}</div>
    <p class="hint">Saved for everyone at once: the stage, phones and slides show the new details. Pool, base price and captain can only change before the list is locked.</p>
    <p class="row"><button class="btn-primary" data-save>Save</button><button class="btn-ghost" data-cancel>Cancel</button></p>`;
  document.body.append(dlg);
  dlg.showModal();
  const close = () => { dlg.close(); dlg.remove(); };
  $('[data-cancel]', dlg).onclick = close;
  $('[data-save]', dlg).onclick = run(async () => {
    const upd = {};
    for (const [k, label, kind] of EDIT_FIELDS) {
      let v = $(`[data-e="${k}"]`, dlg).value.trim();
      if (kind === 'num' || kind === 'dec') {
        if (v !== '' && !Number.isFinite(Number(v))) throw new Error(`${label}: "${v}" is not a number`);
        v = v === '' ? null : Number(v);
      }
      upd[k] = v === '' ? null : v;
    }
    if (!upd.name) throw new Error('Name is required');
    upd.battingStyle = null; upd.bowlingStyle = null; // older free-text styles are replaced by the fields above
    await db.update(`${P}/players/${id}`, upd);
    if (upd.name !== p.name) await syncLeaders({ link: false });
    close();
    saved(`${upd.name}: details saved`);
  });
}

// A copy of the auction on this laptop (no photos), refreshed a few seconds after each change, so
// there is always something to fall back on if the database is out for long. Download backup saves
// it as an AuctionXI record file: it can be added as a record, or used to rebuild the slides / tracker.
const BACKUP_KEY = () => `auctionxi:backup:${aid}`;
let backupTimer = null;
function keepBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    try { localStorage.setItem(BACKUP_KEY(), JSON.stringify({ savedAt: Date.now(), snap: { ...exportSnapshot({ ...A, media: null }), media: null } })); } catch { /* storage full or private mode */ }
  }, 3000);
}
// The offline pack: the Excel tracker filled in with every sale and unsold player so far (purses,
// squads and max bids recalculate from there, so the auction can carry on by hand), and the backup
// record file with everything else. Works without the database: it uses what this laptop has.
async function downloadPack() {
  downloadBackup();
  if (A) {
    toast('Preparing the Excel tracker with the auction so far…');
    try { await downloadTracker(A, `${slug(A.meta.name) || aid}_offline_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.xlsx`); } catch (e) { toast(`Excel tracker: ${e.message}. The backup file has everything.`, 'error'); }
  }
}

function downloadBackup() {
  let snap = null;
  let savedAt = Date.now();
  if (A) snap = { ...exportSnapshot({ ...A, media: null }), media: null };
  else {
    try { const b = JSON.parse(localStorage.getItem(BACKUP_KEY()) || 'null'); snap = b?.snap; savedAt = b?.savedAt || savedAt; } catch { /* nothing kept */ }
  }
  if (!snap) { toast('No backup on this laptop yet', 'error'); return; }
  const stamp = new Date(savedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  download(`${slug(snap.meta?.name || aid)}_backup_${stamp}.json`, JSON.stringify(snap, null, 1), 'application/json');
}

// Every sale, newest first, with Edit and Undo (admins only). Both ask for a manual check first.
function salesCard() {
  const rows = Object.entries(A.sales).filter(([, x]) => !x.allotted && !x.retained).sort((x, y) => (y[1].at || 0) - (x[1].at || 0));
  if (!rows.length) return '';
  const r = A.rules;
  return `<div class="card" style="margin-top:var(--space-4)">
    <div class="section-title"><h2 style="margin:0">All sales</h2><small class="muted">${rows.length} sold · correct any of them: Edit changes the team or price, Undo sends the player back to the pool</small></div>
    <div class="table-wrap" style="max-height:340px;overflow:auto"><table class="grid-table"><thead><tr><th>Player</th><th>Team</th><th>Price</th><th></th></tr></thead><tbody>
    ${rows.map(([pid, x]) => `<tr><td><b>${esc(A.players[pid]?.name || pid)}</b> <small class="muted">${esc(pid)}</small>${x.was ? ' <small class="muted">· corrected</small>' : ''}</td>
      <td>${teamBadge(A.teams[x.team], { showName: true })}</td><td>${esc(money(x.price, r))}</td>
      <td style="white-space:nowrap"><button class="btn-sm" data-sale-edit="${esc(pid)}">Edit</button> <button class="btn-sm btn-ghost" data-sale-undo="${esc(pid)}">Undo</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
}

// A dialog that shows what will change and needs "I've checked this" ticked before it goes ahead.
function checkDialog({ title, body, confirmLabel, danger = false, extra = '' }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'card';
    dlg.style.cssText = 'max-width:620px;width:calc(100% - 32px);color:var(--ink);background:var(--surface);border:1px solid var(--line)';
    dlg.innerHTML = `<h2 style="margin-top:0">${title}</h2>${extra}<div data-body>${body}</div>
      <label class="check" style="margin-top:var(--space-4)"><input type="checkbox" data-ok> I've checked this with the auctioneer and the scorer</label>
      <p class="row" style="margin-top:var(--space-3)"><button class="${danger ? 'btn-danger' : 'btn-primary'}" data-go disabled>${confirmLabel}</button><button class="btn-ghost" data-no>Cancel</button></p>`;
    document.body.append(dlg);
    dlg.showModal();
    const ok = $('[data-ok]', dlg);
    const go = $('[data-go]', dlg);
    ok.onchange = () => { go.disabled = !ok.checked; };
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    $('[data-no]', dlg).onclick = () => done(null);
    dlg.oncancel = () => done(null);
    go.onclick = () => done(dlg);
    dlg.refresh = (html) => { $('[data-body]', dlg).innerHTML = html; };
  });
}

// "Team: 760 left → 600 left, 5 → 6 players" for each team a change touches.
function purseChange(before, after, teams) {
  return `<table class="grid-table" style="margin-top:var(--space-3)"><thead><tr><th>Team</th><th>Budget left</th><th>Squad</th></tr></thead><tbody>${[...new Set(teams)].filter(Boolean).map((id) => {
    const b = teamSummary(before, id); const x = teamSummary(after, id);
    return `<tr><td>${teamBadge(A.teams[id], { showName: true })}</td><td>${esc(money(b.remaining, A.rules))} → <b>${esc(money(x.remaining, A.rules))}</b></td><td>${b.count} → <b>${x.count}</b></td></tr>`;
  }).join('')}</tbody></table>`;
}

function wireSalesCard(el) {
  $$('[data-sale-undo]', el).forEach((b) => (b.onclick = run(async () => {
    const pid = b.dataset.saleUndo;
    const s = A.sales[pid];
    const after = { ...A, sales: Object.fromEntries(Object.entries(A.sales).filter(([k]) => k !== pid)) };
    const ok = await checkDialog({
      title: `Undo the sale of ${esc(A.players[pid]?.name || pid)}?`, danger: true, confirmLabel: 'Undo this sale',
      body: `<p>Sold to <b>${esc(A.teams[s.team]?.name || s.team)}</b> for <b>${esc(money(s.price, A.rules))}</b>. After undoing, the player goes back to the pool and comes up again; the team gets the money back.</p>${purseChange(A, after, [s.team])}`,
    });
    if (!ok) return;
    await undoSale(aid, A, pid);
    saved(`Sale of ${A.players[pid]?.name || pid} undone`);
  })));
  $$('[data-sale-edit]', el).forEach((b) => (b.onclick = run(async () => {
    const pid = b.dataset.saleEdit;
    const s = A.sales[pid];
    const teamSel = `<select data-t>${Object.entries(A.teams).map(([id, t]) => `<option value="${esc(id)}" ${id === s.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
    const preview = (team, price) => {
      const after = { ...A, sales: { ...A.sales, [pid]: { ...s, team, price: Number(price) || 0 } } };
      return `<p>Now: <b>${esc(A.teams[s.team]?.name)}</b>, ${esc(money(s.price, A.rules))} → after: <b>${esc(A.teams[team]?.name)}</b>, <b>${esc(money(Number(price) || 0, A.rules))}</b></p>${purseChange(A, after, [s.team, team])}`;
    };
    const dlgP = checkDialog({
      title: `Edit the sale of ${esc(A.players[pid]?.name || pid)}`, confirmLabel: 'Save the correction',
      extra: `<div class="row"><label style="margin:0">Team ${teamSel}</label><label style="margin:0">Price <input data-p inputmode="numeric" value="${esc(s.price)}" style="width:120px"></label></div>`,
      body: preview(s.team, s.price),
    });
    const dlg = document.querySelector('dialog[open]');
    const upd = () => dlg.refresh(preview($('[data-t]', dlg).value, num($('[data-p]', dlg).value)));
    $('[data-t]', dlg).onchange = upd; $('[data-p]', dlg).oninput = upd;
    const ok = await dlgP;
    if (!ok) return;
    const team = $('[data-t]', ok).value;
    const price = num($('[data-p]', ok).value);
    if (price == null) throw new Error('Enter the price');
    let warning = await editSale(aid, A, pid, { team, price });
    if (warning) {
      if (!confirm(`${warning}\n\nSave it anyway?`)) return;
      warning = await editSale(aid, A, pid, { team, price }, true);
    }
    saved(`${A.players[pid]?.name || pid}: sale corrected`);
  })));
}

function players(el) {
  const locked = !!A.meta.locked;
  const list = Object.entries(A.players).sort(([x], [y]) => x.localeCompare(y, undefined, { numeric: true }));
  const catOpts = (v) => A.rules.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === v ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
  const roleOpts = (v) => Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${k === roleId(v) ? 'selected' : ''}>${r.code} · ${r.name}</option>`).join('');
  const asOpts = (v) => `<option value="">—</option><option value="C" ${v === 'C' ? 'selected' : ''}>Captain</option>${hasVC(A.rules) || v === 'VC' ? `<option value="VC" ${v === 'VC' ? 'selected' : ''}>Vice-captain</option>` : ''}${A.meta.kind === 'mini' || v === 'R' ? `<option value="R" ${v === 'R' ? 'selected' : ''}>Retained</option>` : ''}`;
  const teamOpts = (v) => `<option value="">—</option>${Object.entries(A.teams).map(([id, t]) => `<option value="${esc(id)}" ${id === v ? 'selected' : ''}>${esc(t.short || t.name)}</option>`).join('')}`;
  const dis = locked ? 'disabled' : '';
  const handOpts = (v, right, left, none = '—') => `<option value="">${none}</option><option value="R" ${v === 'R' ? 'selected' : ''}>${right}</option><option value="L" ${v === 'L' ? 'selected' : ''}>${left}</option>`;
  const allotted = list.filter(([, p]) => isAllotted(p)).length;
  const waiting = list.filter(([, p]) => isWaiting(p)).length;
  const cancelled = list.filter(([, p]) => isCancelled(p)).length;
  const counts = [`${list.length - allotted - waiting - cancelled} to auction`, waiting ? `${waiting} on the waiting list` : '', cancelled ? `${cancelled} registration${cancelled === 1 ? '' : 's'} cancelled` : '', `${allotted} captains / vice-captains allotted`].filter(Boolean).join(' · ');

  el.innerHTML = `
    ${locked
      ? `<div class="notice notice-ok"><b>Player list locked</b>: who is in the auction, pools, base prices and captains are fixed${A.meta.status === 'setup' ? '' : ' now that the auction has started'}. Small fixes still work: <b>Edit</b> a player's name, role, stats or notes, change their list (auction / waiting / cancelled) or photo. ${stageOf(A.meta) === 'ready' ? '<button class="btn-sm" id="d-unlock">Unlock all details (back to draft)</button>' : A.meta.status === 'setup' ? '<button class="btn-sm" id="p-unlock">Unlock to edit everything</button>' : ''}</div>`
      : '<div class="notice notice-info">Upload players, check and fix anything below, then lock the list. A new auction starts with a fresh upload.</div>'}
    <div class="card">
      <div class="section-title">
        <h2>Players (${list.length})</h2><small>${esc(counts)}</small><span class="spacer"></span>
        <button class="btn-sm" id="p-template">Download players template</button>
        <button class="btn-sm" id="p-deck" title="PowerPoint to present the auction by hand: rules, bid steps, teams, a clickable players list and one slide per player">Slides (PowerPoint)</button>
        <button class="btn-sm" id="p-ai" title="Write a short scouting note for each player from their stats, with your AI key. You review them before saving">AI scouting notes</button>
        <button class="btn-sm" id="p-tracker" title="Excel workbook to run or follow the auction by hand: teams, captains, purses, players and a tracker that applies the rules">Offline tracker (Excel)</button>
        <button class="btn-sm" id="p-export">Export current list</button>
        ${locked ? '' : `
          <label class="btn btn-sm" style="margin:0;text-transform:none;letter-spacing:0;color:var(--ink)">Upload players CSV<input type="file" accept=".csv,text/csv" id="p-upload" hidden></label>
          <button class="btn-sm" id="p-sample">Load sample data</button>
          <button class="btn-sm" id="p-add">Add player</button>
          <button class="btn-sm btn-primary" id="p-lock">Lock player list</button>`}
      </div>
      <div class="table-wrap">
        <table class="grid-table"><thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Pool</th><th>Bats</th><th>Bowls</th><th>Bowling</th><th>Base</th><th>Locality</th><th>Photo URL</th><th>Allotted to</th><th>As</th><th>List</th><th></th></tr></thead>
        <tbody>${list.map(([id, p]) => `
          <tr data-id="${esc(id)}">
            <td><code>${esc(id)}</code></td>
            <td><input data-f="name" value="${esc(p.name)}" ${dis} style="min-width:150px"></td>
            <td><select data-f="role" ${dis}>${roleOpts(p.role)}</select></td>
            <td><select data-f="category" ${dis}>${catOpts(p.category)}</select></td>
            <td><select data-f="battingHand" ${dis}>${handOpts(battingHandOf(p), 'Right', 'Left')}</select></td>
            <td><select data-f="bowlingArm" ${dis}>${handOpts(bowlingArmOf(p), 'Right-arm', 'Left-arm', 'Doesn\'t bowl')}</select></td>
            <td><select data-f="bowlingType" ${dis}><option value="">—</option>${[...new Set([...BOWLING_TYPES, bowlingTypeOf(p)].filter(Boolean))].map((t) => `<option ${t === bowlingTypeOf(p) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
            <td><input data-f="basePrice" inputmode="numeric" value="${p.basePrice ?? ''}" placeholder="${esc(money(basePrice(p, A.rules), A.rules))}" ${dis} style="width:100px"></td>
            <td><input data-f="locality" value="${esc(p.locality || '')}" ${dis}></td>
            <td><input data-f="photoUrl" value="${esc(p.photoUrl || '')}" ${dis}></td>
            <td><select data-f="allottedTeam" ${dis}>${teamOpts(p.allottedTeam)}</select></td>
            <td><select data-f="allottedAs" ${dis}>${asOpts(p.allottedAs)}</select>${isAllotted(p) ? `<span class="hint">${esc(money(allottedPrice(p, A.rules), A.rules))}</span>` : ''}</td>
            <td>${isAllotted(p) ? '' : A.sales[id] ? '<small class="muted">Sold</small>' : `<select data-list="${esc(id)}" title="In the auction, on the waiting list, or registration cancelled (can be changed at any time)"><option value="">Auction</option><option value="waiting" ${isWaiting(p) ? 'selected' : ''}>Waiting list</option><option value="cancelled" ${isCancelled(p) ? 'selected' : ''}>Registration cancelled</option></select>`}</td>
            <td style="white-space:nowrap"><button class="btn-sm" data-edit="${esc(id)}" title="Name, role, stats, notes and more. Works even after locking">Edit</button>${locked ? '' : '<button class="btn-sm btn-ghost" data-del>Remove</button>'}</td>
          </tr>`).join('') || '<tr><td colspan="14" class="muted">No players yet. Download the template, fill it in and upload it.</td></tr>'}</tbody></table>
      </div>
      <span class="hint">Base blank = the pool's base price. "Allotted to" + "As" make a player that team's captain or vice-captain:
        they join the team at the captain / vice-captain price when the auction starts and are never auctioned.
        To change many players, export, edit in a spreadsheet and upload again.</span>
    </div>
    ${list.length ? photosCard(list) : ''}`;
  wirePhotos(el);

  $('#p-template').onclick = () => download('players_template.csv', playerTemplate());
  $('#p-export').onclick = () => download(`${aid}_players.csv`, playersToCSV(A.players));
  $('#p-tracker').onclick = run(saveTracker);
  // Auction / waiting list: allowed even after locking, e.g. to bring in a replacement mid-auction.
  $$('[data-list]', el).forEach((s) => (s.onchange = run(async (e) => {
    e.stopPropagation();
    const id = s.dataset.list;
    if (A.live?.playerId === id && A.live.status === 'bidding') { render(true); throw new Error('This player is up for bidding now'); }
    await db.set(`${P}/players/${id}/list`, s.value || null);
    toast(`${A.players[id].name}: ${{ waiting: 'moved to the waiting list', cancelled: 'registration cancelled' }[s.value] || 'in the auction'}`, 'ok');
  })));
  $('#p-deck').onclick = run(saveDeck);
  $('#p-ai').onclick = run(aiScouting);
  $$('[data-edit]', el).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); editPlayer(b.dataset.edit); }));
  if (locked) {
    wireDetailsCard(el);
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
    await db.set(`${P}/players/P${String(i).padStart(3, '0')}`, { name: 'New player', role: 'ar', category: A.rules.categories.at(-1).id });
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
    if (!confirm('Load the sample tournament setup (8-a-side, squads of 10), 4 teams and 44 players with captains and vice-captains?')) return;
    const s = importSetup(parseCSV(st), A.meta, A.rules);
    await saveRules({ ...A.meta, name: A.meta.name }, s.rules);
    A = applyMedia(normalize(await db.get(P)), media);
    if (!Object.keys(A.teams).length) await addTeams(importTeams(parseCSV(tt)).teams);
    await importPlayerRows(parseCSV(pt), true);
  });
  el.onchange = run(async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || !e.target.dataset.f) return;
    await savePlayerField(e, tr);
    saved(`${A.players[tr.dataset.id]?.name || tr.dataset.id}: ${e.target.closest('td') && FIELD_NAMES[e.target.dataset.f] || 'change'} saved`);
  });
  async function savePlayerField(e, tr) {
    const f = e.target.dataset.f;
    let v = e.target.value.trim();
    if (f === 'basePrice') {
      if (v !== '' && num(v) == null) throw new Error(`"${v}" is not an amount. Try 500000 or 5L.`);
      v = v === '' ? null : num(v);
    }
    if (f === 'name' && !v) throw new Error('Name is required');
    if (f === 'allottedTeam' && v) {
      const as = A.players[tr.dataset.id].allottedAs || (leadersOf(A, v).C ? 'VC' : 'C');
      const taken = leadersOf(A, v)[as];
      if (taken && taken.id !== tr.dataset.id) throw new Error(`${A.teams[v].name} already has a ${leaderLabel(as).toLowerCase()}: ${taken.name}`);
      await db.update(`${P}/players/${tr.dataset.id}`, { allottedTeam: v, allottedAs: as });
      await syncLeaders({ link: false });
      return;
    }
    if (f === 'allottedTeam' && !v) { await db.update(`${P}/players/${tr.dataset.id}`, { allottedTeam: null, allottedAs: null }); await syncLeaders({ link: false }); return; }
    if (f === 'allottedAs' && v) {
      const team = A.players[tr.dataset.id].allottedTeam;
      if (!team) throw new Error('Choose the team first');
      const taken = leadersOf(A, team)[v];
      if (taken && taken.id !== tr.dataset.id) throw new Error(`${A.teams[team].name} already has a ${leaderLabel(v).toLowerCase()}: ${taken.name}`);
    }
    if (['battingHand', 'bowlingArm', 'bowlingType'].includes(f)) {
      // Move older free-text styles into the new fields so nothing is lost.
      const p = A.players[tr.dataset.id];
      await db.update(`${P}/players/${tr.dataset.id}`, {
        battingHand: battingHandOf(p) || null, bowlingArm: bowlingArmOf(p) || null, bowlingType: bowlingTypeOf(p) || null,
        battingStyle: null, bowlingStyle: null, [f]: v || null,
      });
      return;
    }
    await db.set(`${P}/players/${tr.dataset.id}/${f}`, v === '' ? null : v);
    if (f === 'allottedAs' || f === 'name') await syncLeaders({ link: false });
  }
  el.onclick = run(async (e) => {
    if (!e.target.matches('[data-del]')) return;
    const id = e.target.closest('tr').dataset.id;
    if (!confirm(`Remove ${A.players[id].name}?`)) return;
    await db.set(`${P}/players/${id}`, null);
    await syncLeaders({ link: false });
  });
}

// The offline Excel tracker: this auction's teams, captains, purses and players, with the rules as formulas.
async function saveTracker() {
  toast('Preparing the Excel tracker…');
  await downloadTracker(A, `${slug(A.meta.name) || aid}_tracker.xlsx`);
}

// The offline slides: this auction as a PowerPoint to present by hand (squads too, once sold).
async function saveDeck() {
  toast('Preparing the slides…');
  await downloadDeck(A, `${slug(A.meta.name) || aid}_slides.pptx`);
}

// AI scouting notes: one short note per player from their stats, reviewed before saving (field `scout`).
async function aiScouting() {
  if (!aiReady()) { tab = 'setup'; render(true); throw new Error('Add an AI key first (Setup → AI assistant)'); }
  const all = Object.entries(A.players).filter(([, p]) => p.matches || p.runs || p.wickets || p.notes);
  if (!all.length) throw new Error('No player has stats or notes to write from');
  // Players without a note first; when everyone has one, write them all again.
  const missing = all.filter(([, p]) => !p.scout);
  const list = missing.length ? missing : all;
  if (!confirm(`Write scouting notes for ${list.length} players with your AI key? Their names and stats are sent to the AI provider. You can edit every note before saving.`)) return;
  const drafts = {};
  const batches = [];
  for (let i = 0; i < list.length; i += 12) batches.push(list.slice(i, i + 12));
  for (const [n, batch] of batches.entries()) {
    toast(`Writing notes… ${n * 12 + 1}-${n * 12 + batch.length} of ${list.length}`);
    let text;
    try {
      text = await askAI({
      system: 'You scout players for a friendly society cricket auction. For each player write one scouting note of at most 20 words: their strength and how a captain might use them, from the given stats only. Never invent facts. Plain English, no emoji. Reply with a JSON object mapping each player ID to its note, and nothing else.',
      prompt: batch.map(([id, p]) => `ID ${id}\n${playerFacts(p, A, money)}`).join('\n\n'),
      maxTokens: 1500,
      json: true,
      });
      Object.assign(drafts, parseJSON(text));
    } catch (err) {
      // Keep what was written; the rest can be done later (players with a note are skipped next time).
      if (!Object.keys(drafts).length) throw err;
      toast(`${err.message}. Stopped after ${Object.keys(drafts).length} notes: review and save these, then run it again later for the rest.`, 'error');
      break;
    }
  }
  const dlg = document.createElement('dialog');
  dlg.className = 'card';
  dlg.style.cssText = 'max-width:820px;width:calc(100% - 32px);max-height:85vh;overflow:auto;color:var(--ink);background:var(--surface);border:1px solid var(--line)';
  dlg.innerHTML = `<h2>Scouting notes</h2><p class="muted">Check and edit. Saved notes show on the player cards, phones and slides. Leave a box empty to skip that player.</p>
    <div class="stack" style="gap:var(--space-2)">${list.filter(([id]) => drafts[id]).map(([id, p]) => `<label style="margin:0"><b>${esc(p.name)}</b> <small class="muted">${esc(id)}</small>
      <textarea data-scout="${esc(id)}" rows="2">${esc(String(drafts[id]).slice(0, 300))}</textarea></label>`).join('')}</div>
    <p class="row" style="margin-top:var(--space-4)"><button class="btn-primary" data-save>Save notes</button><button class="btn-ghost" data-cancel>Cancel</button></p>`;
  document.body.append(dlg);
  dlg.showModal();
  dlg.querySelector('[data-cancel]').onclick = () => dlg.remove();
  dlg.querySelector('[data-save]').onclick = run(async () => {
    const upd = {};
    dlg.querySelectorAll('[data-scout]').forEach((t) => { upd[`players/${t.dataset.scout}/scout`] = t.value.trim() || null; });
    await db.update(P, upd);
    dlg.remove();
    toast(`${Object.values(upd).filter(Boolean).length} scouting notes saved`, 'ok');
  });
}

/* Pictures: league logo and banner (Setup tab), player photos (Players tab) */

const fileButton = (label, attrs, multiple = false) => `<label class="btn btn-sm" style="margin:0;text-transform:none;letter-spacing:0;color:var(--ink)">${label}<input type="file" accept="image/*" ${attrs} ${multiple ? 'multiple' : ''} hidden></label>`;

// Past seasons: the record of an earlier season (an AuctionXI record file, optionally with its
// results) is summarised and kept in this auction, for phones and the stage (js/history.js).
function pastSeasonsCard() {
  const seasons = seasonsOf(A);
  return `<div class="card" style="margin-bottom:var(--space-4)">
    <div class="section-title"><h2>Past seasons</h2><small class="muted">optional · team records and top performers</small><span class="spacer"></span>
      <label class="btn btn-sm" style="margin:0;text-transform:none;letter-spacing:0;color:var(--ink)">Add a season's record<input type="file" accept=".json,application/json" id="hs-upload" hidden></label></div>
    ${seasons.length ? `<ul class="stack" style="list-style:none;padding:0;margin:0;gap:var(--space-2)">${seasons.map((h) => `<li class="row"><b>Season ${esc(h.season)}${h.kind === 'mini' ? ' · mini' : ''}</b>
      <small class="muted">${esc([h.champion && `Champion ${h.champion}`, `${h.auction?.teams?.length || 0} teams`, (h.auction?.teams || []).some((t) => t.captain) ? 'captains' : 'no captains yet', `${h.auction?.sold || 0} players sold`, h.standings?.length ? 'standings' : '', h.top?.mvp?.length ? 'top performers' : ''].filter(Boolean).join(' · '))}</small>
      <span class="spacer"></span><button class="btn-sm" data-hs-people="${esc(h.key)}" title="Captain, vice-captain, owner and sponsor of each team that season">Captains and owners</button><button class="btn-sm btn-ghost" data-hs-del="${esc(h.season)}" data-hs-key="${esc(h.key)}">Remove</button></li>`).join('')}</ul>`
      : '<p class="muted" style="margin:0">None yet.</p>'}
    <span class="hint">Add every earlier season you have, one file each: there is no limit. Use the record file of an earlier season (Results → Download JSON, or a past auction you added as a record). Add a <code>results</code> block for the standings, knockouts and top performers; see README. Phones get a Past seasons tab, and the control room can put a season or a team's profile on the stage.</span>
  </div>`;
}

function wirePastSeasons(el) {
  $('#hs-upload', el).onchange = run(async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    let rec;
    try { rec = JSON.parse(await readFile(f)); } catch { throw new Error('That file is not JSON'); }
    const h = historyFromRecord(rec);
    if (!h.season) throw new Error('The record has no season number (meta.season)');
    // One entry per season (a mini auction's record sits beside its season's major one); add as many
    // seasons as you have. The same season again replaces it.
    const key = `s${h.season.replace(/[^A-Za-z0-9]/g, '')}${rec.meta.kind === 'mini' ? 'm' : ''}`;
    if (A.history?.[key] && !confirm(`Season ${h.season}${h.kind === 'mini' ? ' (mini)' : ''} is already here. Replace it with this file?`)) return;
    await db.set(`${P}/history/${key}`, h);
    toast(`Season ${h.season} added${h.standings.length ? ', with standings' : ''}${h.top.mvp.length ? ' and top performers' : ''}`, 'ok');
  });
  $$('[data-hs-people]', el).forEach((b) => (b.onclick = () => seasonPeopleDialog(b.dataset.hsPeople)));
  $$('[data-hs-del]', el).forEach((b) => (b.onclick = run(async () => {
    if (confirm(`Remove season ${b.dataset.hsDel} from this auction?`)) await db.set(`${P}/history/${b.dataset.hsKey}`, null);
  })));
}

// Each past season keeps its own captains, vice-captains, owners and sponsors: type them in here
// when the record file didn't have them.
function seasonPeopleDialog(key) {
  const h = A.history?.[key];
  const list = h?.auction?.teams || [];
  if (!list.length) { toast('This season has no teams in its record', 'error'); return; }
  const dlg = document.createElement('dialog');
  dlg.className = 'card';
  dlg.style.cssText = 'max-width:980px;width:calc(100% - 32px);color:var(--ink);background:var(--surface);border:1px solid var(--line)';
  const names = [...new Set(list.flatMap((t) => (t.squad || []).map((p) => p.name)))];
  const cell = (i, f, v, ph) => `<td><input data-i="${i}" data-pf="${f}" value="${esc(v || '')}" placeholder="${ph}" list="hs-names"></td>`;
  dlg.innerHTML = `<h2 style="margin-top:0">Season ${esc(h.season)}: captains and owners</h2>
    <p class="muted">Who led and backed each team that season. Shown in the team profiles, the phones' Past seasons tab and on the stage. Leave blank what you don't know.</p>
    <div class="table-wrap"><table class="grid-table"><thead><tr><th>Team</th><th>Captain</th><th>Vice-captain</th><th>Owner</th><th>Sponsor</th></tr></thead><tbody>
    ${list.map((t, i) => `<tr><td><b>${esc(t.name)}</b></td>${cell(i, 'captain', t.captain, 'Captain')}${cell(i, 'vc', t.vc, 'Vice-captain')}${cell(i, 'owner', t.owner, 'Owner')}${cell(i, 'sponsor', t.sponsor, 'Sponsor')}</tr>`).join('')}
    </tbody></table></div>
    <datalist id="hs-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <p class="row" style="margin-top:var(--space-4)"><button class="btn-primary" data-go>Save</button><button class="btn-ghost" data-no>Cancel</button></p>`;
  document.body.append(dlg);
  dlg.showModal();
  const close = () => { dlg.close(); dlg.remove(); };
  $('[data-no]', dlg).onclick = close;
  dlg.oncancel = close;
  $('[data-go]', dlg).onclick = run(async () => {
    const upd = {};
    for (const inp of $$('[data-pf]', dlg)) upd[`history/${key}/auction/teams/${inp.dataset.i}/${inp.dataset.pf}`] = inp.value.trim() || null;
    await db.update(P, upd);
    close();
    toast(`Season ${h.season}: captains and owners saved`, 'ok');
  });
}

function brandingCard() {
  const m = A.media || {};
  return `<div class="card" style="margin-bottom:var(--space-4)">
    <div class="section-title"><h2>League logo and banner</h2><small>Shown on the stage screen, phones and results</small></div>
    <div class="grid grid-2">
      <div>
        <label>Logo</label>
        <div class="row" style="align-items:center">
          <div class="brand-preview" style="width:120px;height:120px">${m.logo ? `<img src="${esc(m.logo)}" alt="League logo">` : '<span class="muted">No logo</span>'}</div>
          <div class="stack" style="gap:var(--space-2)">${fileButton(m.logo ? 'Change logo' : 'Upload logo', 'id="b-logo"')}${m.logo ? '<button class="btn-sm btn-ghost" data-brand-del="logo">Remove</button>' : ''}</div>
        </div>
        <span class="hint">Square works best; a PNG with a transparent background looks cleanest. Shrunk to ${LOGO.max} px.</span>
      </div>
      <div>
        <label>Banner</label>
        <div class="brand-preview" style="height:180px;width:100%">${m.banner ? `<img src="${esc(m.banner)}" alt="League banner">` : '<span class="muted">No banner</span>'}</div>
        <p class="row" style="margin:var(--space-2) 0 0">${fileButton(m.banner ? 'Change banner' : 'Upload banner', 'id="b-banner"')}${m.banner ? '<button class="btn-sm btn-ghost" data-brand-del="banner">Remove</button>' : ''}</p>
        <span class="hint">Any shape, never cropped: a wide banner or your auction poster. Shrunk to ${BANNER.max} px on the longest side.</span>
      </div>
    </div>
  </div>`;
}

// A banner per team (the team's poster or logo strip): shown on its squad on phones, on the stage
// when the team is shown, and with its past seasons.
function teamBannersCard(entries) {
  return `<div class="card" style="margin-top:var(--space-4)">
    <div class="section-title"><h2>Team banners</h2><small class="muted">optional · any shape, nothing is cropped</small><span class="spacer"></span>
      ${fileButton('Upload many', 'id="tb-bulk"', true)}</div>
    <div class="grid grid-2">${entries.map(([id, t]) => `
      <div class="row" style="gap:var(--space-3);align-items:center">
        <span class="team-banner-thumb" style="border-left:4px solid ${esc(t.color || '#888')}">${t.bannerData ? `<img src="${esc(t.bannerData)}" alt="">` : '<small class="muted">No banner</small>'}</span>
        <span style="flex:1;min-width:0"><b>${esc(t.name)}</b><br><small class="muted">${esc(t.short || id)}</small></span>
        ${fileButton(t.bannerData ? 'Change' : 'Upload', `data-tbanner="${esc(id)}"`)}${t.bannerData ? `<button class="btn-sm btn-ghost" data-tbanner-del="${esc(id)}">Remove</button>` : ''}
      </div>`).join('')}</div>
    <span class="hint">Upload many at once: name each file by the team's code (RAI.jpg), ID (T5.jpg) or name (Raigad Rakshak.jpg).</span>
  </div>`;
}

function wireTeamBanners(el) {
  $$('[data-tbanner]', el).forEach((inp) => (inp.onchange = run(async (e) => {
    e.stopPropagation();
    const f = inp.files[0]; inp.value = '';
    if (f) { await setTeamBanner(aid, inp.dataset.tbanner, await resizeImage(f, BANNER)); toast(`Banner saved for ${A.teams[inp.dataset.tbanner]?.name}`, 'ok'); }
  })));
  $$('[data-tbanner-del]', el).forEach((b) => (b.onclick = run(async (e) => {
    e.stopPropagation();
    if (confirm(`Remove the banner of ${A.teams[b.dataset.tbannerDel]?.name}?`)) await setTeamBanner(aid, b.dataset.tbannerDel, null);
  })));
  const bulk = $('#tb-bulk', el);
  if (bulk) bulk.onchange = run(async (e) => {
    e.stopPropagation();
    const files = [...bulk.files]; bulk.value = '';
    const key = (s) => String(s || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]/g, '');
    let n = 0; const missed = [];
    for (const f of files) {
      const k = key(f.name);
      const hit = Object.entries(A.teams).find(([id, t]) => [id, t.short, t.name].some((x) => x && key(x) === k));
      if (!hit) { missed.push(f.name); continue; }
      await setTeamBanner(aid, hit[0], await resizeImage(f, BANNER)); n++;
    }
    toast(`${n} team banner${n === 1 ? '' : 's'} saved${missed.length ? `; not matched: ${missed.join(', ')}` : ''}`, missed.length ? 'error' : 'ok');
  });
}

function wireBranding(el) {
  $('#b-logo', el).onchange = run(async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) { await setBrand(aid, 'logo', await resizeImage(f, LOGO)); toast('Logo saved', 'ok'); }
  });
  $('#b-banner', el).onchange = run(async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) { await setBrand(aid, 'banner', await resizeImage(f, BANNER)); toast('Banner saved', 'ok'); }
  });
  $$('[data-brand-del]', el).forEach((b) => (b.onclick = run(async () => {
    if (confirm(`Remove the ${b.dataset.brandDel}?`)) await setBrand(aid, b.dataset.brandDel, null);
  })));
}

function photosCard(list) {
  const have = list.filter(([, p]) => p.photoData || p.photoUrl).length;
  return `<div class="card" style="margin-top:var(--space-4)">
    <div class="section-title"><h2>Player photos</h2><small>${have} of ${list.length} have a photo</small><span class="spacer"></span>
      ${fileButton('Upload many photos', 'id="ph-bulk"', true)}</div>
    <p class="muted">Tap a player to upload their photo from this phone or laptop, or choose many at once named by player ID or name
      (<code>P001.jpg</code>, <code>Rohan Patil.jpg</code>). Photos are cropped to a 3 : 4 portrait and shrunk, and can be changed even after the list is locked.
      A <code>photo_url</code> in the CSV still works; an uploaded photo replaces it.</p>
    <div class="photo-grid">${list.map(([id, p]) => `
      <div class="photo-tile">
        <label class="photo-pick" title="Upload a photo of ${esc(p.name)}">
          <span class="ax-avatar" style="width:72px;height:96px;border-radius:var(--radius-md)">${p.photoData ? `<img src="${esc(p.photoData)}" alt="">` : p.photoUrl ? '<small>URL</small>' : esc((p.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join(''))}</span>
          <input type="file" accept="image/*" data-photo="${esc(id)}" hidden>
        </label>
        <div style="min-width:0"><b>${esc(p.name)}</b><br><small><code>${esc(id)}</code></small>
          ${p.photoData ? `<br><button class="btn-sm btn-ghost" data-photo-del="${esc(id)}">Remove</button>` : ''}</div>
      </div>`).join('')}</div>
  </div>`;
}

function wirePhotos(el) {
  $$('[data-photo]', el).forEach((inp) => (inp.onchange = run(async (e) => {
    e.stopPropagation();
    const f = inp.files[0]; inp.value = '';
    if (f) { await setPlayerPhoto(aid, inp.dataset.photo, await resizeImage(f, PHOTO)); toast(`Photo saved for ${A.players[inp.dataset.photo]?.name}`, 'ok'); }
  })));
  $$('[data-photo-del]', el).forEach((b) => (b.onclick = run(async () => {
    if (confirm(`Remove the photo of ${A.players[b.dataset.photoDel]?.name}?`)) await setPlayerPhoto(aid, b.dataset.photoDel, null);
  })));
  const bulk = $('#ph-bulk', el);
  if (bulk) {
    bulk.onchange = run(async (e) => {
      e.stopPropagation();
      const { matched, unmatched } = matchPhotoFiles(A.players, [...bulk.files]);
      bulk.value = '';
      if (matched.length > 3) toast(`Saving ${matched.length} photos…`);
      for (const { file, pid } of matched) await setPlayerPhoto(aid, pid, await resizeImage(file, PHOTO));
      toast(`${matched.length} photo${matched.length === 1 ? '' : 's'} saved`, 'ok');
      if (unmatched.length) alert(`No player matched these file names (use the player ID or the exact name):\n\n${unmatched.join('\n')}`);
    });
  }
}

async function importPlayerRows(rows, replaceAll = false) {
  const existing = Object.keys(A.players);
  const replace = replaceAll || (existing.length && confirm(`Replace the ${existing.length} existing players?\nOK = replace all, Cancel = add to the list`));
  const { players: parsed, warnings } = importPlayers(rows, A.rules, replace ? [] : existing);
  const count = Object.keys(parsed).length;
  if (!count) throw new Error('No players found in the file. Keep the template header row.');
  if (replace) await db.set(`${P}/players`, parsed);
  else await db.update(`${P}/players`, parsed);
  warnings.push(...await syncLeaders());
  toast(`Imported ${count} players${warnings.length ? ` with ${warnings.length} warnings` : ''}`, 'ok');
  if (warnings.length) alert(`Imported with warnings:\n\n${warnings.join('\n')}`);
}

/* ---------------- 4. Access & sharing ---------------- */

function access(el) {
  const joinUrl = shareUrl('index.html', { a: aid });
  const liveUrl = shareUrl('live.html', { a: aid });
  const screenUrl = shareUrl('live.html', { a: aid, screen: 1 });
  const caps = Object.entries(captains);
  el.innerHTML = `
    <div class="grid grid-2">
      ${visibilityCard()}
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
        <p class="row" style="margin-bottom:0"><a class="btn btn-sm" href="${esc(pageUrl('poster.html', { a: aid }))}" target="_blank" rel="noopener">Print QR poster</a><small class="muted">A4 or A3 for the club house: banner, date, venue and a big QR code to join.</small></p>
      </div>
      <div class="card">
        <h2>Admin code</h2>
        <p>Give this only to co-organisers and the auctioneer. It opens this console on any device, and is your backup if you change phones.</p>
        <p><span class="secret">${esc(secrets.adminCode || '')}</span></p>
        <h3>Co-admins</h3>
        <ul>${Object.entries(coadmins).map(([uid, c]) => `<li>${esc(c.name)} <button class="btn-sm btn-ghost" data-kick-admin="${esc(uid)}">Remove</button></li>`).join('') || '<li class="muted">None</li>'}</ul>
      </div>
      <div class="card" style="grid-column:1/-1">
        <h2>Present on Zoom or Google Meet</h2>
        <p>For captains, players and family who can't be in the hall. Share the stage screen, with its commentary and voice, in your video call. Captains still bid from their phones with the join link, and the call only shows what the stage shows, so purses stay private.</p>
        <div class="grid grid-2">
          <div>
            ${field('Stage link', `<input readonly value="${esc(screenUrl)}" onclick="this.select()">`)}
            <p class="row">${Object.entries(LANGUAGES).map(([k, v]) => `<a class="btn btn-sm" target="_blank" href="${esc(pageUrl('live.html', { a: aid, screen: 1, lang: k }))}">Open stage · ${esc(v)}</a>`).join('')}</p>
          </div>
          <ol class="stack" style="gap:var(--space-2);margin:0;padding-left:1.2em">
            <li>On the laptop in the call, open the stage in its own Chrome or Edge tab (buttons on the left; each sets the commentary language). Press <kbd>F11</kbd> for full screen.</li>
            <li>Click on the stage once, then press <kbd>V</kbd> to read the commentary aloud (<kbd>L</kbd> changes language).</li>
            <li><b>Google Meet:</b> Present now → <i>A tab</i> → the stage tab, with <i>Also share tab audio</i> on.<br>
                <b>Zoom:</b> Share screen → the browser window, and tick <i>Share sound</i> (bottom left) so the call hears the voice.</li>
            <li>Mute your own microphone while the voice speaks, or the hall echoes. Send remote captains the join link and their code as usual.</li>
          </ol>
        </div>
      </div>
      <div class="card" style="grid-column:1/-1">
        <h2>${vcCanBid(A.rules) ? 'Captain and vice-captain codes' : 'Captain codes'}</h2>
        <p>Send each person only their own code. They open the join link, choose ${vcCanBid(A.rules) ? 'Captain or Vice-captain' : 'Captain'} and their team, and enter the code.
          With a code they bid and see ${A.rules.purseVisibility === 'own' ? 'their own team\'s' : 'the'} remaining purse and max bid.</p>
        <div class="table-wrap"><table class="grid-table"><thead><tr><th>Team</th><th>Captain code</th>${vcCanBid(A.rules) ? '<th>Vice-captain code</th>' : ''}<th>Signed in</th><th></th></tr></thead><tbody>
        ${Object.entries(A.teams).map(([id, t]) => `
          <tr><td>${teamBadge(t, { showName: true })}</td>
          <td><span class="secret">${esc(secrets.teamCodes[id] || '—')}</span></td>
          ${vcCanBid(A.rules) ? `<td><span class="secret">${esc(secrets.vcCodes[id] || '—')}</span></td>` : ''}
          <td>${caps.filter(([, c]) => c.team === id).map(([uid, c]) => `${c.as === 'VC' ? 'VC' : 'C'} · ${esc(c.name)} <button class="btn-sm btn-ghost" data-kick="${esc(uid)}">Sign out</button>`).join('<br>') || '<span class="muted">Not yet</span>'}</td>
          <td class="row"><button class="btn-sm" data-copy="${esc(id)}" data-as="C">Copy captain message</button>
              ${vcCanBid(A.rules) ? `<button class="btn-sm" data-copy="${esc(id)}" data-as="VC">Copy VC message</button>` : ''}
              <button class="btn-sm btn-ghost" data-regen="${esc(id)}">New codes</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Add teams first.</td></tr>'}
        </tbody></table></div>
        ${isLocal ? '<p class="notice notice-warn" style="margin-top:var(--space-3)">Demo mode: only tabs in this browser can join. Connect Firebase (docs/SETUP.md) so phones can join.</p>' : ''}
      </div>
    </div>`;

  $('#qr').innerHTML = qrSvg(joinUrl);
  $$('[data-vis]', el).forEach((b) => (b.onclick = run(async () => {
    if (b.dataset.vis === 'listed' && !confirm('List this auction on the AuctionXI home page? Anyone who opens the site can watch it (purses and codes stay private).')) return;
    await setVisibility(aid, A.meta, b.dataset.vis);
    directoryKey = null;
    toast(VISIBILITY[b.dataset.vis], 'ok');
  })));
  el.onclick = run(async (e) => {
    const d = e.target.dataset;
    if (d.kick) await db.set(`captains/${aid}/${d.kick}`, null);
    if (d.kickAdmin) await db.set(`coadmins/${aid}/${d.kickAdmin}`, null);
    if (d.regen) {
      if (!confirm('Make a new code? The old code stops working and this team\'s signed-in phones are signed out.')) return;
      await db.update(`secrets/${aid}`, { [`teamCodes/${d.regen}`]: randomCode(6), [`vcCodes/${d.regen}`]: randomCode(6) });
      for (const [uid, c] of caps) if (c.team === d.regen) await db.set(`captains/${aid}/${uid}`, null);
    }
    if (d.copy) {
      const vc = d.as === 'VC';
      const who = vc ? 'vice-captain' : 'captain';
      const msg = `${A.meta.name}\nYou are the ${who} of ${A.teams[d.copy].name}.\n1. Open ${joinUrl}\n2. Choose ${vc ? 'Vice-captain' : 'Captain'} and team ${A.teams[d.copy].name}\n3. Enter code ${(vc ? secrets.vcCodes : secrets.teamCodes)[d.copy]}\nKeep this code private.`;
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
    ${nextPlayerPanel(bidding, remaining)}
    ${stagePanel(bidding)}
    <div class="live-grid">
      <div>${player ? cardFor(A, live.playerId) : '<div class="card"><h2>No player on the block</h2><p class="muted">Press Next player or pick one.</p></div>'}</div>
      <div>${player ? livePanel(A) : ''}</div>
    </div>
    <div class="card" style="margin-top:var(--space-4)">
      <div class="closeout">
        <button class="btn-sold btn-lg" id="c-sold" ${leader ? '' : 'disabled'}>Mark sold${leader ? ` to ${esc(leader.short || leader.name)} · ${esc(money(live.bid.amount, rules))}` : ''} <kbd>S</kbd></button>
        <button class="btn-lg" id="c-unsold" ${bidding ? '' : 'disabled'}>Unsold <kbd>U</kbd></button>
        <button class="btn-ghost" id="c-undobid" ${bidding && live.bid?.team ? '' : 'disabled'}>Undo last bid <kbd>Z</kbd></button>
        <label class="check" style="margin:0" title="Only shown on screens: the bidding never closes by itself"><input type="checkbox" id="c-timer" ${Number(rules.bidTimer) ? 'checked' : ''}> Countdown after each bid${Number(rules.bidTimer) ? ` (${Number(rules.bidTimer)} s)` : ' (off)'}</label>
        <span class="spacer"></span>
        <button class="btn-sm btn-ghost" id="c-undo">Reverse last sale</button>
      </div>
      <h3 style="margin-top:var(--space-5)">Bids called out in the hall ${bidding ? `<span class="muted">· next bid ${esc(money(next, rules))}</span>` : ''}</h3>
      <p class="hint" style="margin-top:0">As the auctioneer calls each bid, press that team (or its number key): the bid goes up one step and the stage, phones and commentary follow.
        For a jump ("150 from Raigad!"), press <kbd>J</kbd>, type the amount, then press the team; or type <kbd>3 150</kbd> and Enter.</p>
      <div class="row" style="margin-bottom:var(--space-2)">
        <input id="c-jump" inputmode="numeric" placeholder="Jump to… (e.g. 150, or 3 150)" style="width:260px" ${bidding ? '' : 'disabled'} autocomplete="off">
        <small class="muted" id="c-jump-hint"></small>
      </div>
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
        <small>Round ${round} · ${remaining.length} players left this round · ${Object.values(A.sales).filter((s) => !s.allotted && !s.retained).length} sold · ${unsoldNow.length} unsold</small>
        <span class="spacer"></span>
        ${canNewRound ? `<button class="btn-sm btn-primary" id="c-round">Start round ${round + 1}: re-auction ${unsoldNow.length} unsold</button>` : ''}
        ${meta.status === 'live' ? '<button class="btn-sm btn-danger" id="c-finish">End auction</button>' : ''}
      </div>
    </div>
    ${salesCard()}
    <div class="grid grid-2" style="margin-top:var(--space-4)">
      <div class="card"><h2>Purses</h2><div class="stack">${purses(A, { viewer: { role: 'admin' } })}</div></div>
      <div class="stack">
        ${A.rules.commentary === false ? '' : `<div class="card"><div class="section-title"><h2 style="margin:0">Commentary</h2><span class="spacer"></span>
          <select id="c-lang" style="width:auto;min-height:32px" aria-label="Commentary language">${Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}" ${k === commLang() ? 'selected' : ''}>${v}</option>`).join('')}</select>
          ${voice.supported ? `<button class="btn-sm" id="c-voice">${voice.on ? 'Stop reading aloud' : 'Read aloud on this laptop'}</button>` : ''}</div>
          ${voice.on && !voice.hasVoice(commLang()) ? '<p class="hint">This laptop has no Marathi or Hindi voice, so lines are shown but not read. Install one in the system language settings.</p>' : ''}
          <label class="check" style="margin:0 0 var(--space-2)"><input type="checkbox" id="c-sfx" ${A.meta.sfx === false ? '' : 'checked'}> Gavel sound and confetti on SOLD (stage; phones get confetti, and the gavel when reading aloud)</label>
          <label class="check" style="margin:0 0 var(--space-2)"><input type="checkbox" id="c-ai" ${A.meta.aiCommentary ? 'checked' : ''} ${aiReady() ? '' : 'disabled'}> AI commentary${aiReady() ? ' (uses this laptop\'s AI key; every screen shows the lines)' : ': add an AI key in Setup first'}</label>
          ${A.meta.aiCommentary && A.meta.aiStatus?.down && Number(A.meta.aiStatus.until) > Date.now() ? `<p class="notice notice-warn" style="margin:0 0 var(--space-2)">AI paused: ${esc(AI_WHY[A.meta.aiStatus.why] || AI_WHY.other)}. Every screen is using the built-in commentary until ${esc(new Date(A.meta.aiStatus.until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}, then AI is tried again. <button class="btn-sm" id="c-ai-retry">Try AI now</button></p>` : ''}
          <div id="c-comm" class="feed"></div></div>`}
        <div class="card"><h2>Activity</h2>${feed(A)}</div>
      </div>
    </div>`;

  wireNextPlayerPanel(el);
  wireStagePanel(el);
  renderCommentary();
  if ($('#c-voice')) $('#c-voice').onclick = () => { voice.toggle(commLang()); render(true); };
  if ($('#c-sfx')) $('#c-sfx').onchange = run(async (e) => { await db.set(`${P}/meta/sfx`, e.target.checked ? null : false); });
  if ($('#c-ai')) $('#c-ai').onchange = run(async (e) => { aiFails = 0; aiPausedUntil = 0; await db.update(`${P}/meta`, { aiCommentary: e.target.checked || null, aiStatus: null }); });
  if ($('#c-ai-retry')) $('#c-ai-retry').onclick = run(async () => { aiFails = 0; aiPausedUntil = 0; await db.set(`${P}/meta/aiStatus`, null); toast('AI will be tried on the next player', 'ok'); });
  if ($('#c-lang')) $('#c-lang').onchange = (e) => { setDeviceCommLang(e.target.value === A.rules.commentaryLang ? '' : e.target.value); commentator = makeCommentator(); commentator.update(A); e.target.blur(); render(true); };
  $('#c-sold').onclick = run(() => sell(aid, A));
  $('#c-unsold').onclick = run(() => markUnsold(aid, A));
  $('#c-undobid').onclick = run(() => undoLastBid(aid, A));
  if ($('#c-timer')) $('#c-timer').onchange = run(async (e) => { await setTimer(aid, A, e.target.checked); toast(e.target.checked ? 'Countdown on' : 'Countdown off: bidding stays open until you close it', 'ok'); });
  wireSalesCard(el);
  $('#c-undo').onclick = run(async () => {
    const last = Object.entries(A.sales).filter(([, x]) => !x.allotted && !x.retained).sort((x, y) => (y[1].at || 0) - (x[1].at || 0))[0];
    if (!last) throw new Error('No sale to undo');
    document.querySelector(`[data-sale-undo="${CSS.escape(last[0])}"]`)?.click(); // same checked dialog as any other undo
  });
  $('#c-round') && ($('#c-round').onclick = run(() => nextRound(aid, A)));
  $('#c-finish') && ($('#c-finish').onclick = run(async () => {
    const short = teamIds.filter((id) => teamSummary(A, id).count < rules.squadSize);
    const warn = short.length ? `\n\n${short.length} team(s) have fewer than ${rules.squadSize} players.` : '';
    if (confirm(`End the auction?${warn}`)) await finishAuction(aid);
  }));
  // A room bid: one step up, or the amount typed in "Jump to".
  const jumpBox = $('#c-jump', el);
  const roomBid = async (team) => {
    const typed = jumpBox?.value.trim();
    const amount = typed ? num(typed) : null;
    if (typed && amount == null) throw new Error(`"${typed}" is not an amount`);
    await placeBid(aid, A, team, 'room', amount);
    if (jumpBox) jumpBox.value = '';
  };
  $$('[data-bid]', el).forEach((b) => (b.onclick = run(() => roomBid(b.dataset.bid))));
  if (jumpBox) {
    jumpBox.oninput = () => {
      const m = jumpBox.value.trim().match(/^([1-8])\s+(.+)$/);
      const t = m && A.teams[Object.keys(A.teams)[Number(m[1]) - 1]];
      $('#c-jump-hint', el).textContent = t && num(m[2]) != null ? `Enter: ${t.name} bids ${money(num(m[2]), A.rules)}` : jumpBox.value.trim() ? 'Now press the team' : '';
    };
    jumpBox.onkeydown = run(async (e) => {
      if (e.key === 'Escape') { jumpBox.value = ''; jumpBox.blur(); return; }
      if (e.key !== 'Enter') return;
      const m = jumpBox.value.trim().match(/^([1-8])\s+(.+)$/);
      if (!m) throw new Error('Type the team number and the amount, e.g. 3 150, or type the amount and press the team');
      const team = Object.keys(A.teams)[Number(m[1]) - 1];
      if (!team) throw new Error(`No team ${m[1]}`);
      jumpBox.value = m[2];
      await roomBid(team);
      jumpBox.blur();
    });
  }
  $$('[data-mode]', el).forEach((b) => (b.onclick = run(() => db.set(`${P}/rules/bidMode`, b.dataset.mode))));
  $('#r-sell').onclick = run(async () => {
    const team = $('#r-team').value;
    const amount = num($('#r-amount').value);
    if (amount == null) throw new Error('Enter the final amount, for example 1200000 or 12L');
    const warning = await recordRoomSale(aid, A, team, amount);
    if (warning && confirm(`${warning}\n\nRecord the sale anyway?`)) await recordRoomSale(aid, A, team, amount, true);
  });
}

// A listed auction's home-page entry follows its name, date and status.
let directoryKey = null;
function keepDirectory() {
  if (visibilityOf(A.meta) !== 'listed') return;
  const key = JSON.stringify(directoryEntry(A.meta));
  if (key === directoryKey) return;
  directoryKey = key;
  syncDirectory(aid, A.meta).catch((e) => console.warn('directory', e));
}

function visibilityCard() {
  const v = visibilityOf(A.meta);
  return `<div class="card" style="grid-column:1/-1">
    <h2>Who can see this auction</h2>
    <div class="ax-seg" role="group" aria-label="Who can see this auction" style="margin-bottom:var(--space-3)">
      ${Object.entries(VISIBILITY).map(([k, label]) => `<button type="button" data-vis="${k}" aria-pressed="${v === k}">${esc(label)}</button>`).join('')}
    </div>
    <p class="muted" style="margin:0">${v === 'private'
      ? '<b>Private.</b> Only you and co-admins can open it, so you can set it up in peace. Captains, members, the audience and the stage screen on another device see "not open yet". Open it before you share codes.'
      : v === 'link'
        ? '<b>Open to anyone with the link or auction code.</b> It is not listed anywhere: share the link or QR code with the attendees.'
        : '<b>Listed.</b> Anyone opening the AuctionXI site sees it under "Auctions open now" and can watch with one tap. Captains still need their own code to bid.'}
      Purse privacy, captain codes and workbooks stay protected in every setting.</p>
  </div>`;
}

// On a mock auction: a strip above the tabs to reset it, delete it, or go back to the real one.
function mockBar() {
  let bar = $('#mockbar');
  if (!A.meta.mock) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'mockbar'; $('#panel').before(bar); }
  bar.innerHTML = `<div class="notice notice-warn row" style="margin-bottom:var(--space-4)">
    <span style="flex:1;min-width:240px"><b>Mock auction.</b> A practice copy of <b>${esc(A.meta.mockOfName || A.meta.mockOf)}</b>: same rules, teams and players, its own codes.
      Nothing here changes the real auction. Run it with the captains, then reset it and run it again.</span>
    <button class="btn-sm" id="mock-reset">Reset mock</button>
    <button class="btn-sm btn-ghost" id="mock-delete">Delete mock</button>
    ${A.meta.mockOf ? `<a class="btn btn-sm" href="${pageUrl('admin.html', { a: A.meta.mockOf })}">Back to the real auction</a>` : ''}
  </div>`;
  $('#mock-reset').onclick = run(async () => {
    if (!confirm('Reset the mock auction? Every sale and bid is cleared and it goes back to "not started". Captains stay signed in.')) return;
    await resetAuction(aid, A);
    toast('Mock auction reset', 'ok');
  });
  $('#mock-delete').onclick = run(async () => {
    if (!confirm('Delete this mock auction for good?')) return;
    const back = A.meta.mockOf;
    await deleteAuction(aid);
    location.href = back ? pageUrl('admin.html', { a: back }) : 'index.html';
  });
}

function mockCard() {
  if (A.meta.mock) return '';
  return `<div class="card" style="max-width:760px;margin-top:var(--space-4)">
    <h2>Rehearse first: mock auction</h2>
    <p>Make a practice copy with the same rules, teams, players and photos, and run it end to end: captains join with their own mock codes, bid, buy, and you check the stage, phones, commentary and results.
      Nothing in this auction changes, and you can reset the mock and run it again as often as you like.</p>
    <button class="btn" id="c-mock">Create mock auction</button>
  </div>`;
}

async function openMock() {
  const fresh = normalize(await db.get(P));
  const { aid: mid } = await createMockAuction(aid, applyMedia(fresh, media));
  rememberAuction(mid, `${A.meta.name} (mock)`, 'admin');
  location.href = pageUrl('admin.html', { a: mid, created: 1 });
}

function controlStart(el) {
  const { meta, rules } = A;
  const teamIds = Object.keys(A.teams);
  const teamN = teamIds.length;
  const toAuction = Object.values(A.players).filter(inAuction).length;
  // Players each team still has to buy (a mini auction's teams already keep some).
  const toBuyOf = (id) => Math.max(0, rules.squadSize - Object.values(A.players).filter((p) => p.allottedTeam === id && (p.allottedAs !== 'VC' || hasVC(rules))).length);
  const needed = teamIds.reduce((t, id) => t + toBuyOf(id), 0);
  const short = teamIds.filter((id) => toBuyOf(id) * minBase(rules) > teamSummary(A, id).purse);
  const missing = teamIds.filter((id) => { const l = leadersOf(A, id); return !l.C || (hasVC(rules) && !l.VC); });
  const check = (ok, text) => `<li style="margin:var(--space-2) 0">${badge(ok ? 'sold' : 'upcoming', { text: ok ? 'Done' : 'To do' })} ${text}</li>`;
  el.innerHTML = `
    <div class="card" style="max-width:760px">
      <h2>Ready to start?</h2>
      <ul style="list-style:none;padding:0">
        ${check(teamN >= 2, `At least 2 teams (${teamN})`)}
        ${check(!missing.length && teamN > 0, missing.length ? `${hasVC(rules) ? 'Captain and vice-captain' : 'Captain'} missing for ${missing.map((id) => esc(A.teams[id].name)).join(', ')} (set them in Players)` : `Every team has its ${hasVC(rules) ? 'captain and vice-captain' : 'captain'}`)}
        ${check(toAuction >= needed, `Enough players to auction for every team to reach ${rules.squadSize} (teams need ${needed}; you have ${toAuction})`)}
        ${check(!short.length, short.length ? `Budget too small to fill the squad at base price: ${short.map((id) => esc(A.teams[id].name)).join(', ')}` : 'Every budget covers the players still to buy at base price')}
        ${check(meta.detailsLocked, meta.detailsLocked ? 'Details saved and locked (Ready)' : `Details still a draft${meta.locked ? ' (player list locked)' : ''}: Setup → <b>Save and lock details</b> when they are final`)}
        ${check(visibilityOf(meta) !== 'private', visibilityOf(meta) === 'private' ? 'Open the auction to viewers (Access and sharing). It is private now' : 'Open to viewers')}
        ${check(Object.keys(captains).length > 0 || rules.bidMode === 'room', `Bidders signed in (${Object.keys(captains).length}). Optional: you can record bids for them`)}
      </ul>
      <p>Starting locks the player list, puts each captain${hasVC(rules) ? ' and vice-captain' : ''} in their team (value ${esc(money(rules.captainPrice, rules))}${hasVC(rules) ? ` / ${esc(money(rules.vcPrice, rules))}` : ''}, not taken from the purse), and opens bidding.</p>
      <button class="btn-primary btn-lg" id="c-start" ${teamN >= 2 && toAuction ? '' : 'disabled'}>Start ${meta.mock ? 'mock ' : ''}auction</button>
    </div>
    <div style="max-width:760px">${stagePanel(false)}</div>
    ${mockCard()}`;
  wireStagePanel(el);
  if ($('#c-mock')) $('#c-mock').onclick = run(openMock);
  $('#c-start').onclick = run(async () => {
    if (missing.length && !confirm(`${missing.length} team(s) have no ${hasVC(rules) ? 'captain or vice-captain' : 'captain'} set. Start anyway?`)) return;
    if (!missing.length && !confirm('Start the auction now?')) return;
    if (visibilityOf(meta) === 'private') {
      if (!confirm('This auction is private: captains and the audience cannot see it. Open it to anyone with the link and start?')) return;
      await setVisibility(aid, meta, 'link');
    }
    await startAuction(aid, A);
  });
}

function renderCommentary() {
  const box = $('#c-comm');
  if (!box) return;
  const time = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  box.innerHTML = commentator.lines.slice(0, 12).map((l) => `<div>${l.kind === 'ai' ? badge('upcoming', { text: 'AI' }) : ''}<span>${esc(l.text)}</span><time>${time(l.at)}</time></div>`).join('') || '<p class="muted">Lines appear as the auction runs.</p>';
}

// The "Next player" panel: random draw with the built-in logic, or a chit searched by name.
// What the stage shows besides bidding: the players still up for auction, the waiting list, or
// one player's profile. Bringing up the next player switches the stage back to the auction.
function stagePanel(bidding) {
  const { available, waiting } = profileGroups(A);
  const v = A.meta.stageView;
  const now = v?.type === 'list' ? (v.which === 'waiting' ? 'the waiting list' : 'the players up for auction')
    : v?.type === 'player' ? `${A.players[v.id]?.name || 'a player'}'s profile`
    : v?.type === 'history' ? `season ${v.season}` : v?.type === 'team' ? `${A.teams[v.id]?.name || 'a team'}'s profile` : (bidding ? 'the bidding' : 'the auction');
  const seasons = seasonsOf(A);
  return `<div class="card" style="margin-top:var(--space-4)">
    <div class="section-title"><h2 style="margin:0">On the stage</h2><small>Now showing ${esc(now)}</small><span class="spacer"></span>
      ${v ? '<button class="btn-sm btn-primary" id="sv-back">Back to the auction</button>' : ''}</div>
    <p class="row">
      <button class="btn-sm" data-sv="available" ${bidding ? 'disabled title="Finish the player on the block first"' : ''}>Show players up for auction (${available.length})</button>
      <button class="btn-sm" data-sv="waiting" ${bidding || !waiting.length ? 'disabled' : ''}>Show the waiting list (${waiting.length})</button>
      ${seasons.map((h) => `<button class="btn-sm" data-svh="${esc(h.key)}" ${bidding ? 'disabled' : ''}>Season ${esc(h.season)}${h.kind === 'mini' ? ' mini' : ''} record</button>`).join('')}
      <select id="sv-team" style="width:auto" ${bidding ? 'disabled' : ''}><option value="">A team's profile…</option>${Object.entries(A.teams).map(([id, t]) => `<option value="${esc(id)}">${esc(t.name)}</option>`).join('')}</select>
    </p>
    <div style="max-width:560px">
      <input id="sv-search" placeholder="Show a player's profile: type the name, the number, or both" autocomplete="off" ${bidding ? 'disabled' : ''}>
      <div id="sv-results" class="stack" style="gap:var(--space-1);margin-top:var(--space-2)"></div>
    </div>
    <span class="hint">Phones always have these under the Players tab. Bringing up the next player puts the stage back on the auction.</span>
  </div>`;
}

function wireStagePanel(el) {
  const set = run((view) => db.set(`${P}/meta/stageView`, view));
  $$('[data-sv]', el).forEach((b) => (b.onclick = () => set({ type: 'list', which: b.dataset.sv })));
  $$('[data-svh]', el).forEach((b) => (b.onclick = () => set({ type: 'history', season: b.dataset.svh })));
  if ($('#sv-team', el)) $('#sv-team', el).onchange = (e) => { if (e.target.value) set({ type: 'team', id: e.target.value }); };
  const input = $('#sv-search', el);
  if (input) {
    const { available, waiting } = profileGroups(A);
    const wait = new Set(waiting.map((p) => p.id));
    const found = () => searchPlayers([...available, ...waiting], input.value, 6);
    const show = () => {
      const list = found();
      $('#sv-results', el).innerHTML = !input.value.trim() ? '' : list.length ? list.map((p, i) => `
        <div class="row" style="padding:var(--space-2) var(--space-3);border:1px solid ${i ? 'var(--line)' : 'var(--gold)'};border-radius:var(--radius-sm)">
          <code>${esc(p.id)}</code> <b>${esc(p.name)}</b> <small>${esc(ROLES[roleId(p.role)].name)}${wait.has(p.id) ? ' · waiting list' : ''}</small>
          <span class="spacer"></span><button class="btn-sm ${i ? '' : 'btn-primary'}" data-svp="${esc(p.id)}">Show on stage</button>
        </div>`).join('') : '<p class="muted" style="margin:0">No player up for auction or on the waiting list matches.</p>';
      $$('[data-svp]', el).forEach((b) => (b.onclick = () => { input.value = ''; set({ type: 'player', id: b.dataset.svp }); }));
    };
    input.oninput = show;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { const first = found()[0]; if (first) { input.value = ''; input.blur(); set({ type: 'player', id: first.id }); } }
      if (e.key === 'Escape') { input.value = ''; show(); }
    };
  }
  if ($('#sv-back', el)) $('#sv-back', el).onclick = () => set(null);
}

function nextPlayerPanel(bidding, remaining) {
  const { rules, meta } = A;
  drawMode ||= rules.pickOrder === 'manual' ? 'chit' : 'random';
  const closed = bidding || meta.status !== 'live';
  const counts = poolCounts(A);
  const autoLabel = (Number(A.meta.round) || 1) > 1 ? 'Auto: unsold players, in the order they first came up' : rules.pickOrder === 'random' ? 'Auto: any pool' : rules.pickOrder === 'category-sequence' ? `Auto: ${counts.map((c) => c.id).join(' → ')} in ID order` : `Auto: ${counts.map((c) => c.label).join(' → ')}`;
  return `
    <div class="card" style="margin-bottom:var(--space-4)">
      <div class="section-title">
        <h2 style="margin:0">Next player</h2>
        <div class="ax-seg" role="group" aria-label="How to choose the next player">
          <button type="button" data-draw="random" aria-pressed="${drawMode === 'random'}">Random draw</button>
          <button type="button" data-draw="chit" aria-pressed="${drawMode === 'chit'}">Chit (search)</button>
        </div>
        <span class="spacer"></span>
        <span class="muted">Bid mode</span>
        <div class="ax-seg" role="group" aria-label="Bid mode">
          <button type="button" data-mode="both" aria-pressed="${rules.bidMode !== 'room'}">Phones + room</button>
          <button type="button" data-mode="room" aria-pressed="${rules.bidMode === 'room'}">Room only</button>
        </div>
      </div>
      ${drawMode === 'random' ? `
        <div class="row">
          <select id="d-pool" style="width:auto" aria-label="Pool to draw from">
            <option value="">${esc(autoLabel)}</option>
            ${counts.map((c) => `<option value="${esc(c.id)}" ${drawPool === c.id ? 'selected' : ''} ${c.left ? '' : 'disabled'}>${esc(c.label)} only (${c.left} left)</option>`).join('')}
          </select>
          <select id="d-role" style="width:auto" aria-label="Role to draw">
            <option value="">Any role</option>
            ${Object.entries(ROLES).map(([k, r]) => `<option value="${k}" ${drawRole === k ? 'selected' : ''}>${r.name}s only</option>`).join('')}
          </select>
          <button class="btn-primary btn-lg" id="c-next" ${closed || !remaining.length ? 'disabled' : ''}>Draw random player <kbd>N</kbd></button>
        </div>
        <span class="hint">Auto follows the tournament's order: a random player from the strongest pool still in play. Choose a pool or role to draw from just that group.</span>`
      : `
        <div class="row" style="align-items:flex-start">
          <div style="flex:1;min-width:260px;max-width:560px">
            <input id="d-search" placeholder="Type the name or number on the chit" autocomplete="off" ${closed ? 'disabled' : ''}>
            <div id="d-results" class="stack" style="gap:var(--space-1);margin-top:var(--space-2)"></div>
          </div>
        </div>
        <span class="hint">${closed && bidding ? 'Finish the player on the block first. ' : ''}Draw a chit in the hall, type the name (or player number), and press Enter or Bring up. Only players not yet auctioned this round are found.</span>`}
      <p style="margin:var(--space-3) 0 0"><small>Left this round: ${counts.map((c) => `${esc(c.label)} ${c.left}`).join(' · ')}</small></p>
    </div>`;
}

function wireNextPlayerPanel(el) {
  $$('[data-draw]', el).forEach((b) => (b.onclick = () => {
    drawMode = b.dataset.draw;
    localStorage.setItem('auctionxi:drawmode', drawMode);
    render(true);
    if (drawMode === 'chit') $('#d-search')?.focus();
  }));
  if ($('#c-next')) $('#c-next').onclick = run(doNext);
  if ($('#d-pool')) $('#d-pool').onchange = (e) => { drawPool = e.target.value; e.target.blur(); };
  if ($('#d-role')) $('#d-role').onchange = (e) => { drawRole = e.target.value; e.target.blur(); };
  const input = $('#d-search');
  if (!input) return;
  const show = () => {
    const found = searchPool(A, input.value);
    $('#d-results').innerHTML = !input.value.trim() ? ''
      : found.length ? found.map((p, i) => `
        <div class="row" style="padding:var(--space-2) var(--space-3);border:1px solid ${i ? 'var(--line)' : 'var(--gold)'};border-radius:var(--radius-sm)">
          <code>${esc(p.id)}</code> <b>${esc(p.name)}</b>
          <small>${esc([category(A.rules, p.category)?.label, ROLES[roleId(p.role)].name].filter(Boolean).join(' · '))}</small>
          <span class="spacer"></span>
          <button class="btn-sm ${i ? '' : 'btn-primary'}" data-up="${esc(p.id)}">Bring up</button>
        </div>`).join('')
        : '<p class="muted" style="margin:0">No player left in this round matches. Already sold, unsold this round, or a captain / vice-captain?</p>';
    $$('[data-up]', el).forEach((b) => (b.onclick = run(() => bringUp(b.dataset.up))));
  };
  input.oninput = show;
  input.onkeydown = run(async (e) => {
    if (e.key === 'Enter') { const first = searchPool(A, input.value)[0]; if (first) await bringUp(first.id); }
    if (e.key === 'Escape') { input.value = ''; show(); }
  });
}

async function bringUp(pid) {
  $('#d-search') && ($('#d-search').value = '');
  document.activeElement?.blur();
  await startPlayer(aid, A, pid, { drawn: 'chit' });
}

async function doNext() {
  const p = pickNext(A, { pool: drawPool, role: drawRole });
  if (!p) {
    const what = [drawPool && category(A.rules, drawPool)?.label, drawRole && `${ROLES[drawRole].name.toLowerCase()}s`].filter(Boolean).join(', ');
    throw new Error(what ? `No players left to draw (${what}). Change the pool or role.` : 'No players left in this round');
  }
  await startPlayer(aid, A, p.id, { drawn: 'random', pool: drawPool || null });
}

function onKey(e) {
  if (tab !== 'control' || !A || e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const bidding = A.live?.status === 'bidding';
  if (k === 'n' && !bidding && A.meta.status === 'live') { if (drawMode === 'chit') { e.preventDefault(); $('#d-search')?.focus(); } else run(doNext)(); }
  else if (k === 's' && bidding && A.live.bid?.team) run(() => sell(aid, A))();
  else if (k === 'u' && bidding) run(() => markUnsold(aid, A))();
  else if (k === 'z' && bidding) run(() => undoLastBid(aid, A))();
  else if (k === 'j' && bidding) { e.preventDefault(); $('#c-jump')?.focus(); }
  else if (/^[1-8]$/.test(k) && bidding) {
    const id = Object.keys(A.teams)[Number(k) - 1];
    if (id) run(() => placeBid(aid, A, id, 'room'))();
  }
}

/* ---------------- 6. Results ---------------- */

function results(el) {
  const sold = Object.values(A.sales).filter((s) => !s.allotted && !s.retained).length;
  el.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <h2>Results</h2>
        <p>${sold} players sold. <a href="${pageUrl('results.html', { a: aid })}" target="_blank">Open the results page</a></p>
        <div class="row">
          <button id="r-csv">Download squads CSV</button>
          <button id="r-json">Download full auction JSON</button>
          <button id="r-tracker">Offline tracker (Excel)</button>
          <button id="r-deck">Slides with squads (PowerPoint)</button>
        </div>
      </div>
      <div class="card">
        <h2>Keep results online permanently</h2>
        <p>The archive holds any number of auctions: every season, major and mini, side by side.</p>
        <p><button id="r-archive">Download the 2 archive files</button></p>
        <ol>
          <li>In GitHub, add <code>auction.json</code> as <code>archive/${esc(archiveSlug())}/auction.json</code>.</li>
          <li>Replace <code>archive/index.json</code> with the downloaded one: it already lists the archived auctions plus this one.</li>
        </ol>
        <p class="hint">The archive is public. Player photos are not included; leave a tournament out of it if its details should stay private.</p>
        <p>GitHub Pages then serves it at <code>results.html?archive=${esc(archiveSlug())}</code>, even if the live database is cleaned up.</p>
      </div>
    </div>
    ${A.meta.mock ? "" : miniBuilder()}`;
  wireMiniBuilder(el);
  $('#r-csv').onclick = () => {
    const rows = Object.entries(A.sales).map(([pid, s]) => {
      const p = A.players[pid] || {};
      return [A.teams[s.team]?.name || s.team, pid, p.name, ROLES[roleId(p.role)].name, p.category, s.price, s.allotted || s.retained ? leaderLabel(p.allottedAs) : `round ${s.round} (${s.source || 'phone'})`];
    }).sort((x, y) => String(x[0]).localeCompare(y[0]) || y[5] - x[5]);
    const unsold = Object.keys(A.players).filter((pid) => !A.sales[pid] && !isAllotted(A.players[pid])).map((pid) => {
      const p = A.players[pid];
      return ['UNSOLD', pid, p.name, ROLES[roleId(p.role)].name, p.category, '', ''];
    });
    download(`${aid}_results.csv`, toCSV(['team', 'player_id', 'name', 'role', 'category', 'price', 'how'], [...rows, ...unsold]));
  };
  $('#r-tracker').onclick = run(saveTracker);
  $('#r-deck').onclick = run(saveDeck);
  $('#r-json').onclick = () => download(`${slug(A.meta.name) || aid}.auction.json`, JSON.stringify(exportSnapshot(A), null, 2), 'application/json');
  $('#r-archive').onclick = run(downloadArchive);
}

// The folder name in archive/: the auction's name, plus its season when the name doesn't say it.
function archiveSlug() {
  const s = slug(A.meta.name) || aid.toLowerCase();
  const season = slug(String(A.meta.season || ''));
  return season && !s.includes(season) ? `${s}-${season}` : s;
}

// auction.json for the folder, and index.json = the archive's current list with this auction added
// (or updated, if it was archived before), newest first.
async function downloadArchive() {
  const s = archiveSlug();
  let index = { auctions: [] };
  try {
    const res = await fetch('archive/index.json', { cache: 'no-cache' });
    if (res.ok) index = await res.json();
  } catch { /* no archive yet */ }
  const entry = { slug: s, name: A.meta.name, tournament: A.meta.tournament || undefined, season: A.meta.season || undefined, kind: A.meta.kind === 'mini' ? 'mini' : undefined, date: A.meta.date || undefined };
  const list = (index.auctions || []).filter((x) => x.slug !== s);
  list.push(JSON.parse(JSON.stringify(entry)));
  list.sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')) || String(x.name).localeCompare(String(y.name)));
  // Public copy: the league logo and banner, but no player photos or team banners.
  const snap = { ...exportSnapshot(A), media: { logo: A.media?.logo || null, banner: A.media?.banner || null } };
  download('auction.json', JSON.stringify(snap, null, 2), 'application/json');
  setTimeout(() => download('index.json', `${JSON.stringify({ ...index, auctions: list }, null, 2)}\n`, 'application/json'), 400);
  toast(`${list.length} auction${list.length === 1 ? '' : 's'} in the archive list`, 'ok');
}

/* ---------------- Next season's mini auction ---------------- */

function miniBuilder() {
  const teamIds = Object.keys(A.teams);
  if (!teamIds.length || !Object.keys(A.sales).length) {
    return miniPreset ? '<div class="notice notice-warn" style="margin-top:var(--space-4)"><b>Mini auction:</b> this auction has no squads yet, so there is nothing to keep or release. A mini auction follows an auction that has been run.</div>' : '';
  }
  if (!miniKeep) miniKeep = Object.fromEntries(teamIds.map((id) => [id, new Set(teamSummary(A, id).players.map((p) => p.id))]));
  return `
    <div class="card" style="margin-top:var(--space-4)" id="m-anchor">
      <h2>Next season: mini auction</h2>
      <p>Tick the players each team keeps. Everyone unticked is released, and their value goes back into the team's budget:
        <b>budget = remaining purse + value of released players</b> (captain / vice-captain value, or the price paid).
        Kept players join their team before the mini auction and are never auctioned.</p>
      ${A.meta.status !== 'completed' ? '<p class="notice notice-warn">This auction has not been ended yet. Budgets use the purses as they stand now.</p>' : ''}
      <div class="grid grid-2">${teamIds.map((id) => {
        const mb = miniBudget(A, id, miniKeep[id]);
        const rows = teamSummary(A, id).players.sort((x, y) => Number(y.allotted) - Number(x.allotted) || y.price - x.price);
        return `<div class="card" style="background:var(--ground)">
          <div class="section-title">${teamBadge(A.teams[id], { showName: true })}<span class="spacer"></span>
            <span class="ax-kv" style="text-align:right"><span class="ax-k">Mini-auction budget</span>${price(mb.budget, A.rules, { size: 'lg', tone: 'gold' })}</span></div>
          <small>Remaining purse ${esc(money(mb.remaining, A.rules))} + released ${esc(money(mb.releasedValue, A.rules))} · keeps ${mb.kept.length} of ${A.rules.squadSize}, buys ${Math.max(0, A.rules.squadSize - mb.kept.length)}</small>
          <div style="margin-top:var(--space-2)">${rows.map((p) => `
            <label class="check" style="margin:6px 0"><input type="checkbox" data-keep="${esc(id)}" value="${esc(p.id)}" ${miniKeep[id].has(p.id) ? 'checked' : ''}>
              <span style="flex:1">${esc(p.name)} <small>${esc([p.allotted ? leaderLabel(p.as) : null, ROLES[p.role].code].filter(Boolean).join(' · '))}</small></span>
              <span class="ax-price ax-price-sm">${esc(money(p.price, A.rules))}</span></label>`).join('')}</div>
        </div>`;
      }).join('')}</div>
      <div class="grid grid-2" style="margin-top:var(--space-4);align-items:end">
        <div><label for="m-name">Mini auction name</label><input id="m-name" value="${esc(miniPreset?.name || `${A.meta.tournament || A.meta.name} ${Number(A.meta.season) ? Number(A.meta.season) + 1 : new Date().getFullYear() + 1} mini auction`)}"></div>
        <div><label for="m-season">Season</label><input id="m-season" value="${esc(miniPreset?.season || (Number(A.meta.season) ? Number(A.meta.season) + 1 : new Date().getFullYear() + 1))}"></div>
        <label class="check"><input type="checkbox" id="m-pool" checked> Put released and unsold players back into the player pool</label>
      </div>
      <p class="hint">Rules, teams and house rules are copied; new captain / vice-captain codes are made. Add new registrations in the Players tab of the mini auction before locking. If a captain is released, pick a new one there (Players → As).</p>
      <p style="margin-top:var(--space-3)"><button class="btn-primary btn-lg" id="m-create">Create mini auction</button></p>
    </div>`;
}

function wireMiniBuilder(el) {
  $$('[data-keep]', el).forEach((cb) => (cb.onchange = () => {
    const set = miniKeep[cb.dataset.keep];
    if (cb.checked) set.add(cb.value); else set.delete(cb.value);
    const y = scrollY;
    render(true);
    scrollTo(0, y);
  }));
  const btn = $('#m-create', el);
  if (!btn) return;
  if (miniPreset && !miniPreset.shown) { miniPreset.shown = true; setTimeout(() => $('#m-anchor')?.scrollIntoView({ block: 'start' }), 50); }
  btn.onclick = run(async () => {
    const name = $('#m-name').value.trim();
    if (!name) throw new Error('Name the mini auction');
    const lines = Object.keys(A.teams).map((id) => `${A.teams[id].name}: keeps ${miniKeep[id].size}, budget ${money(miniBudget(A, id, miniKeep[id]).budget, A.rules)}`);
    if (!confirm(`Create "${name}"?\n\n${lines.join('\n')}`)) return;
    const { aid: next, adminCode } = await createMiniAuction(aid, A, { name, season: $('#m-season').value.trim(), keep: miniKeep, addToPool: $('#m-pool').checked });
    rememberAuction(next, name, 'admin');
    location.href = pageUrl('admin.html', { a: next, created: adminCode });
  });
}

boot();
