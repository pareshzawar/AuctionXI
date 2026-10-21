// Live view. Roles: audience, member (team highlighted), captain (bids), and
// ?screen=1 for the projector stage (fixed 1920 x 1080 canvas, always night).

import { db } from './db.js';
import { normalize, money, teamSummary, nextBid, bidBlocker, bidLimit, phoneBidding, canSeePurse } from './engine.js';
import { placeBid, myBidderSeat } from './actions.js';
import { $, $$, esc, toast, param, getSession, setSession, mountHeader, pageUrl } from './ui.js';
import { badge, teamPurse, bidButton, soldStamp, startCountdowns, price } from './ds.js';
import { cardFor, livePanel, purses, ticker, feed, squads, poolTable, rulesSummary, lotInfo, maxBidExplainer } from './views.js';

const aid = (param('a') || '').toUpperCase();
const stage = param('screen') === '1';
const session = getSession(aid);
let role = stage ? 'screen' : session.role || 'audience';
let myTeam = ['captain', 'vc', 'member'].includes(role) ? session.team : null;
const isBidder = () => role === 'captain' || role === 'vc';
const viewer = () => ({ role, team: myTeam });
let A = null;
let tab = null; // default: Rules before the auction starts, Squads after
let sending = false;
let lastResult = null;

if (stage) {
  document.documentElement.setAttribute('data-theme', 'night');
  document.body.classList.add('stage-mode');
} else {
  mountHeader(`<a class="btn btn-sm" href="${pageUrl('results.html', { a: aid })}">Results</a>
    <a class="btn btn-sm" href="${pageUrl('index.html', { a: aid })}">Change role</a>`);
}

async function boot() {
  if (isBidder()) {
    const seat = await myBidderSeat(aid);
    if (!seat) {
      toast('This phone is not signed in as a captain or vice-captain. Join again with your code.', 'error');
      role = 'audience';
      myTeam = null;
      setSession(aid, { role });
    } else {
      myTeam = seat.team;
      role = seat.as === 'VC' ? 'vc' : 'captain';
    }
  }
  db.on(`auctions/${aid}`, (v) => {
    A = normalize(v);
    if (!A) { $('#app').innerHTML = '<div class="card"><h2>Auction not found</h2><p><a href="index.html">Back to home</a></p></div>'; return; }
    document.title = `${A.meta.name} - AuctionXI`;
    if (stage) renderStage(); else renderPhone();
    showResult();
  });
  startCountdowns(db.now);
  if (stage) {
    const fit = () => {
      document.documentElement.style.setProperty('--stage-scale', Math.min(innerWidth / 1920, innerHeight / 1080));
    };
    addEventListener('resize', fit);
    fit();
  }
}

/* ---------------- stage ---------------- */

function renderStage() {
  const { meta, live, rules } = A;
  const { lot, total } = lotInfo(A);
  const sold = Object.values(A.sales).filter((s) => !s.allotted && !s.retained);
  const unsold = Object.keys(A.unsold).filter((pid) => !A.sales[pid]).length;
  const spent = sold.reduce((t, s) => t + Number(s.price), 0);
  const hasLot = live && A.players[live.playerId];
  const n = Object.keys(A.teams).length;
  $('#app').innerHTML = `
    <div class="stage-frame"><div class="stage">
      <header class="stage-top">
        <div class="stage-brand">
          <span class="stage-label">AuctionXI${total ? ` · Lot ${lot} of ${total}` : ''}</span>
          <h1 class="stage-title">${esc(meta.name)}</h1>
        </div>
        <div class="stage-tally">
          <div><span class="stage-label">Sold</span><b>${sold.length}</b></div>
          <div><span class="stage-label">Unsold</span><b>${unsold}</b></div>
          <div><span class="stage-label">Spent</span>${price(spent, rules, { size: 'lg' })}</div>
        </div>
      </header>
      <div class="stage-main">
        ${hasLot ? `${cardFor(A, live.playerId, 'stage')}${livePanel(A, 'stage')}`
          : `<div class="stage-wait" style="grid-column:1/-1"><div><h2>${meta.status === 'completed' ? 'Auction complete' : meta.status === 'live' ? 'Next player coming up' : 'Starting soon'}</h2>
             <p>${esc([meta.tournament, meta.venue, meta.date].filter(Boolean).join(' · '))}</p>
             ${meta.status === 'setup' ? stageRules() : ''}</div></div>`}
      </div>
      <section class="stage-teams" style="--n:${Math.min(Math.max(n, 1), 8)}">${purses(A, { size: 'stage', viewer: viewer() })}</section>
      <div class="stage-ticker">${ticker(A, { size: 'stage', scroll: true }) || '<div style="height:64px"></div>'}</div>
    </div></div>`;
}

// Key rules on the stage while the hall waits for the start.
function stageRules() {
  const r = A.rules;
  const mb = maxBidExplainer(r);
  const res = Math.max(0, r.squadSize - r.playersPerSide);
  const lines = [
    `${r.playersPerSide}-a-side · every team buys exactly ${r.squadSize} players${res ? ` (${res} reserve${res === 1 ? '' : 's'})` : ''}`,
    `Purse ${money(r.purse, r)} · captain ${money(r.captainPrice, r)}${r.leaders === 'captain_vc' ? ` · vice-captain ${money(r.vcPrice, r)}` : ''} · base price ${money(r.categories[0]?.base, r)}`,
    mb.rule,
  ];
  return `<div style="margin-top:var(--space-8);text-align:left;max-width:1400px">${lines.map((l) => `<p style="font-size:30px;line-height:40px;color:var(--ink)">${esc(l)}</p>`).join('')}</div>`;
}

/* ---------------- phones ---------------- */

function renderPhone() {
  const { meta, live, rules } = A;
  const hasLot = live && A.players[live.playerId];
  const team = myTeam && A.teams[myTeam];
  const roleLabel = { audience: 'Audience', member: 'Team member', captain: 'Captain', vc: 'Vice-captain' }[role] || role;
  const current = tab || (meta.status === 'setup' ? 'rules' : 'squads');
  const keep = $('#below')?.scrollTop;
  $('#app').innerHTML = `
    <div class="page-head">
      <div>
        <h1 style="margin:0">${esc(meta.name)}</h1>
        <small>${esc([meta.tournament, meta.venue, meta.date].filter(Boolean).join(' · '))}</small>
      </div>
      ${badge(meta.status === 'live' ? 'live' : meta.status === 'completed' ? 'sold' : 'upcoming', { text: meta.status === 'live' ? `Live · Round ${meta.round || 1}` : meta.status === 'completed' ? 'Completed' : 'Not started' })}
      <span class="muted">${esc(roleLabel)}${team ? ` · ${esc(team.name)}` : ''}</span>
    </div>
    ${isBidder() && team ? teamPurse(team, teamSummary(A, myTeam), rules, { variant: 'card', leading: live?.status === 'bidding' && live.bid?.team === myTeam, maxBid: hasLot && live.status === 'bidding' ? bidLimit(A, myTeam, A.players[live.playerId]).max : undefined, hidePurse: !canSeePurse(rules, viewer(), myTeam) }) : ''}
    <div class="live-grid" style="margin-top:var(--space-4)">
      <div>${hasLot ? cardFor(A, live.playerId) : `<div class="card"><h2>${meta.status === 'setup' ? 'The auction has not started yet' : meta.status === 'completed' ? 'Auction complete' : 'Next player coming up'}</h2><p class="muted">This page updates live.</p></div>`}</div>
      <div>${hasLot ? livePanel(A) : ''}</div>
    </div>
    ${isBidder() && team ? `<div class="dock">${captainButton()}</div>` : ''}
    <h2 style="margin-top:var(--space-5)">Teams</h2>
    <div class="purses">${purses(A, { viewer: viewer() })}</div>
    <div style="margin-top:var(--space-4)">${ticker(A) || ''}</div>
    <nav class="tabs" style="margin-top:var(--space-5)">
      ${[['squads', 'Squads'], ['pool', 'Players left'], ['feed', 'Activity'], ['rules', 'Rules']].map(([k, l]) => `<button data-tab="${k}" class="${current === k ? 'active' : ''}">${l}</button>`).join('')}
    </nav>
    <section id="below">${below(current)}</section>`;
  if (keep) $('#below').scrollTop = keep;
  $$('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderPhone(); }));
  const btn = $('[data-bid-button]');
  if (btn) btn.onclick = bid;
}

function captainButton() {
  const { live, rules } = A;
  if (!phoneBidding(rules)) {
    return bidButton({ state: 'closed', rules, reason: 'Room bidding: raise your paddle. The auctioneer records bids.' });
  }
  if (!live || live.status !== 'bidding') return bidButton({ state: 'closed', rules });
  const amount = nextBid(live, rules);
  if (sending) return bidButton({ state: 'sending', amount, rules });
  if (live.bid?.team === myTeam) return bidButton({ state: 'leading', amount: live.bid.amount, rules });
  const why = bidBlocker(A, myTeam, amount);
  return why ? bidButton({ state: 'blocked', amount, rules, reason: why }) : bidButton({ state: 'ready', amount, rules });
}

async function bid() {
  if (sending) return;
  sending = true;
  renderPhone();
  try {
    const amt = await placeBid(aid, A, myTeam);
    navigator.vibrate?.(40);
    toast(`Bid placed: ${money(amt, A.rules)}`, 'ok');
  } catch (e) {
    navigator.vibrate?.([30, 60, 30]);
    toast(e.message || 'Bid not accepted', 'error');
  } finally {
    sending = false;
    renderPhone();
  }
}

function below(tab) {
  if (tab === 'feed') return `<div class="card">${feed(A, 100)}</div>`;
  if (tab === 'pool') return poolTable(A);
  if (tab === 'rules') return rulesSummary(A);
  return squads(A, { viewer: viewer() });
}

/* ---------------- SOLD / UNSOLD stamp ---------------- */

function showResult() {
  const live = A.live;
  const isResult = live && ['sold', 'unsold'].includes(live.status);
  const key = isResult ? `${live.playerId}:${live.status}:${live.startedAt}` : '';
  const first = lastResult === null;
  const changed = key !== lastResult;
  lastResult = key;
  if (first || !changed || !isResult) return; // never replay on page load
  const sold = live.status === 'sold';
  $('#overlay').innerHTML = `<div class="overlay">${soldStamp({
    result: live.status, player: A.players[live.playerId]?.name, team: sold ? A.teams[live.bid.team] : null,
    amount: sold ? live.bid.amount : null, rules: A.rules, size: stage ? '' : 'ui',
  })}</div>`;
  if (!stage && sold && live.bid.team === myTeam) navigator.vibrate?.(120);
  setTimeout(() => { $('#overlay').innerHTML = ''; }, sold ? 4000 : 3000);
}

if (!aid) location.href = 'index.html';
else boot();
