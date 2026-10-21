import { db } from './db.js';
import { normalize, money, teamSummary, nextBid, bidBlocker, pool, category } from './engine.js';
import { placeBid, myCaptainTeam } from './actions.js';
import { $, $$, esc, toast, param, getSession, setSession, mountHeader, pageUrl } from './ui.js';
import { playerCard, bidBox, teamsStrip, feed, squads, startTimers, teamName } from './views.js';

const aid = (param('a') || '').toUpperCase();
const screen = param('screen') === '1';
let session = getSession(aid);
let role = screen ? 'screen' : session.role || 'audience';
let myTeam = ['captain', 'member'].includes(role) ? session.team : null;
let A = null;
let below = 'squads';
let lastResultKey = null;

if (screen) {
  document.body.classList.add('screen');
  $('#tabs').classList.add('hidden');
}
mountHeader(screen ? '' : `<a class="btn btn-sm" href="${pageUrl('results.html', { a: aid })}">Results</a>
  <a class="btn btn-sm" href="${pageUrl('index.html', { a: aid })}">Change role</a>`);

async function boot() {
  if (role === 'captain') {
    const team = await myCaptainTeam(aid);
    if (!team) {
      toast('This device is not signed in as a captain - watching as audience', 'error');
      role = 'audience';
      myTeam = null;
      setSession(aid, { role });
    } else myTeam = team;
  }
  db.on(`auctions/${aid}`, (v) => {
    A = normalize(v);
    if (!A) { $('main').innerHTML = '<div class="card"><h2>Auction not found</h2><p><a href="index.html">Back to home</a></p></div>'; return; }
    render();
  });
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => {
    below = b.dataset.tab;
    $$('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    renderBelow();
  }));
  $('#bid-btn').addEventListener('click', async () => {
    const btn = $('#bid-btn');
    btn.disabled = true;
    try {
      const amt = await placeBid(aid, A, myTeam);
      toast(`You bid ${money(amt, A.rules)}`, 'ok');
    } catch (e) {
      toast(e.message || 'Bid rejected', 'error');
      render();
    }
  });
  startTimers(db.now);
}

function render() {
  const { meta, live, rules } = A;
  document.title = `${meta.name} - AuctionXI`;
  $('#title').textContent = meta.name;
  $('#subtitle').textContent = [meta.tournament, meta.venue, meta.date].filter(Boolean).join(' · ');
  $('#status').textContent = meta.status === 'live' ? `LIVE · round ${meta.round || 1}` : meta.status;
  $('#status').className = `pill ${meta.status === 'live' ? 'pill-red' : ''}`;
  const roleLabel = { audience: 'Audience', member: 'Team member', captain: 'Captain', screen: 'Big screen' }[role] || role;
  $('#role').innerHTML = myTeam && A.teams[myTeam] ? `${roleLabel} · ${teamName(A, myTeam)}` : roleLabel;

  $('#player').innerHTML = meta.status === 'setup'
    ? '<h2>The auction has not started yet</h2><p class="muted">Stay on this page - it updates live.</p>'
    : playerCard(A, live?.playerId);
  $('#bid').innerHTML = bidBox(A);
  $('#teams').innerHTML = teamsStrip(A, { mine: myTeam });
  renderCaptain();
  renderBelow();
  showBanner();
}

function renderCaptain() {
  const box = $('#captain-bid');
  const info = $('#captain-info');
  if (role !== 'captain' || !myTeam || !A.teams[myTeam]) { box.classList.add('hidden'); info.classList.add('hidden'); return; }
  const { rules, live } = A;
  const s = teamSummary(A, myTeam);
  info.className = 'notice notice-info';
  info.innerHTML = `<b>${esc(A.teams[myTeam].name)}</b> · Purse left <b>${money(s.remaining, rules)}</b> · Max bid <b>${money(s.maxBid, rules)}</b> · Squad ${s.count}/${rules.maxSquad} (min ${rules.minSquad})`;
  box.classList.remove('hidden');
  const btn = $('#bid-btn');
  if (!rules.captainBidding) {
    btn.disabled = true;
    btn.textContent = 'Bidding by auctioneer';
    $('#bid-why').textContent = 'Raise your paddle - the auctioneer enters bids for this auction.';
    return;
  }
  const amt = nextBid(live, rules);
  const why = bidBlocker(A, myTeam, amt);
  btn.disabled = !!why;
  btn.textContent = live?.status === 'bidding' ? `BID ${money(amt, rules)}` : 'Waiting for next player';
  $('#bid-why').textContent = live?.status === 'bidding' ? why || '' : '';
}

function renderBelow() {
  const el = $('#below');
  if (screen) { el.innerHTML = `<div class="card"><h3>Recent</h3>${feed(A, 6)}</div>`; return; }
  if (below === 'feed') el.innerHTML = `<div class="card">${feed(A, 100)}</div>`;
  else if (below === 'pool') {
    const list = pool(A);
    el.innerHTML = `<div class="card"><div class="table-wrap"><table><thead><tr><th>Player</th><th>Role</th><th>Category</th><th>Locality</th></tr></thead><tbody>
      ${list.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.role || '')}</td><td>${esc(category(A.rules, p.category)?.label || p.category || '')}</td><td>${esc(p.locality || '')}</td></tr>`).join('')
        || '<tr><td colspan="4" class="muted">No players left in this round</td></tr>'}</tbody></table></div></div>`;
  } else el.innerHTML = squads(A, { mine: myTeam });
}

// Short SOLD / UNSOLD overlay when a result comes in.
function showBanner() {
  const live = A.live;
  const isResult = live && ['sold', 'unsold'].includes(live.status);
  const key = isResult ? `${live.playerId}:${live.status}:${live.startedAt}` : '';
  const firstRender = lastResultKey === null;
  if (firstRender || key === lastResultKey || !isResult) { lastResultKey = key; return; } // no replay on page load
  lastResultKey = key;
  const p = A.players[live.playerId];
  const sold = live.status === 'sold';
  $('#banner').innerHTML = `<div class="sold-banner ${sold ? '' : 'unsold'}"><div>
    <div class="big">${sold ? 'SOLD!' : 'UNSOLD'}</div>
    <h2>${esc(p?.name || '')}</h2>
    ${sold ? `<p style="font-size:1.4rem">${teamName(A, live.bid.team)} · <b>${money(live.bid.amount, A.rules)}</b></p>` : ''}
  </div></div>`;
  setTimeout(() => { $('#banner').innerHTML = ''; }, 3500);
}

if (!aid) location.href = 'index.html';
else boot();
