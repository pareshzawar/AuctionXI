// Screen sections shared by the admin console, live view, stage and results page,
// assembled from the design-system components in ds.js.

import { esc } from './ui.js';
import { money, teamSummary, category, basePrice, nextBid, roleId, ROLES, pool, canSeePurse, leaderLabel, minBase, hasVC, vcCanBid, reserves, PURSE_VISIBILITY, variedBudgets, battingLabel, bowlingLabel, inAuction, isWaiting } from './engine.js';
import { playerCard, bidPanel, teamPurse, salesTicker, badge, teamBadge, price, playerTable } from './ds.js';

export function playerStatus(a, pid) {
  const s = a.sales[pid];
  if (s) return s.allotted || s.retained ? 'retained' : 'sold';
  if (isWaiting(a.players[pid])) return 'waiting';
  if (a.live?.playerId === pid && a.live.status === 'bidding') return 'live';
  if (a.unsold[pid]) return 'unsold';
  return 'upcoming';
}

// "Lot n of m": players brought up so far, counting the current one.
export function lotInfo(a) {
  const total = Object.values(a.players).filter(inAuction).length;
  const done = Object.values(a.sales).filter((s) => !s.allotted && !s.retained).length + Object.keys(a.unsold).filter((pid) => !a.sales[pid]).length;
  const live = a.live?.status === 'bidding' ? 1 : 0;
  return { lot: done + live, total };
}

export function cardFor(a, pid, variant = 'tile') {
  const p = a.players[pid];
  if (!p) return '';
  const status = a.live?.playerId === pid && a.live.status === 'bidding' ? 'live' : playerStatus(a, pid);
  const cat = category(a.rules, p.category);
  const sale = a.sales[pid];
  return playerCard(p, {
    variant,
    status,
    rules: a.rules,
    base: basePrice(p, a.rules),
    category: cat ? { label: cat.label, featured: a.rules.categories[0]?.id === cat.id } : null,
    leaderLabel: p.allottedTeam ? leaderLabel(p.allottedAs) : null,
    currentBid: status === 'live' && a.live.bid?.team ? a.live.bid.amount : null,
    soldTo: sale ? a.teams[sale.team] : null,
    soldPrice: sale ? sale.price : null,
  });
}

export function livePanel(a, size = '') {
  const live = a.live;
  const p = live && a.players[live.playerId];
  if (!p) return '';
  const b = live.bid || {};
  const bidding = live.status === 'bidding';
  const timerTotal = (Number(a.rules.bidTimer) || 0) * 1000;
  return bidPanel({
    size,
    rules: a.rules,
    base: basePrice(p, a.rules),
    current: b.team ? Number(b.amount) : undefined,
    leading: b.team ? a.teams[b.team] : null,
    next: bidding ? nextBid(live, a.rules) : null,
    status: bidding ? 'live' : live.status === 'sold' ? 'sold' : live.status === 'unsold' ? 'unsold' : 'paused',
    timer: bidding && b.until && timerTotal ? { until: b.until, total: timerTotal } : null,
  });
}

// viewer: { role, team } - decides whose remaining purse and max bid are shown.
export function purses(a, { viewer = null, size = '' } = {}) {
  const leading = a.live?.status === 'bidding' ? a.live.bid?.team : null;
  return Object.entries(a.teams).map(([id, t]) =>
    teamPurse(t, teamSummary(a, id), a.rules, { size, leading: id === leading, mine: id === viewer?.team, hidePurse: !canSeePurse(a.rules, viewer, id) })).join('');
}

export function tickerItems(a, limit = 12) {
  const sales = Object.entries(a.sales).filter(([, s]) => !s.allotted && !s.retained)
    .map(([pid, s]) => ({ at: s.at, player: a.players[pid]?.name || pid, team: a.teams[s.team], price: s.price }));
  const unsold = Object.entries(a.unsold).filter(([pid]) => !a.sales[pid])
    .map(([pid, u]) => ({ at: u.at, player: a.players[pid]?.name || pid, result: 'unsold' }));
  return [...sales, ...unsold].sort((x, y) => y.at - x.at).slice(0, limit);
}

export function ticker(a, opts) {
  const items = tickerItems(a);
  return items.length ? salesTicker(items, a.rules, opts) : '';
}

export function feed(a, limit = 30) {
  const items = Object.values(a.log).sort((x, y) => y.at - x.at).slice(0, limit);
  const name = (pid) => `<b>${esc(a.players[pid]?.name || pid)}</b>`;
  const line = (e) => {
    switch (e.type) {
      case 'sold': return `${badge('sold')} ${name(e.playerId)} ${teamBadge(a.teams[e.team])} ${price(e.amount, a.rules, { size: 'sm', tone: 'sold' })}`;
      case 'unsold': return `${badge('unsold')} ${name(e.playerId)}`;
      case 'up': return `${badge('upcoming', { text: e.drawn === 'chit' ? 'Chit' : e.drawn === 'random' ? 'Drawn' : 'Up' })} ${name(e.playerId)} <span class="muted">base ${esc(money(e.amount, a.rules))}</span>`;
      case 'undo': return `${badge('paused', { text: 'Reversed' })} Sale of ${name(e.playerId)} reversed`;
      case 'round': return `${badge('upcoming', { text: 'Round' })} Round ${esc(e.round)}: unsold players return`;
      case 'start': return `${badge('live')} Auction started`;
      case 'end': return `${badge('paused', { text: 'Closed' })} Auction completed`;
      default: return esc(e.type);
    }
  };
  const time = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return items.length
    ? `<div class="feed">${items.map((e) => `<div>${line(e)}<time>${time(e.at)}</time></div>`).join('')}</div>`
    : '<p class="muted">Nothing yet.</p>';
}

export function squadRows(a, teamId) {
  return teamSummary(a, teamId).players.sort((x, y) => Number(y.allotted) - Number(x.allotted) || y.price - x.price).map((p) => ({
    id: p.id,
    name: p.name,
    sub: [p.allotted ? leaderLabel(p.as) : null, battingLabel(p), bowlingLabel(p)].filter(Boolean).join(' · '),
    role: p.role,
    category: category(a.rules, p.category)?.label,
    status: p.allotted ? 'retained' : 'sold',
    price: p.price,
  }));
}

export function squads(a, { viewer = null } = {}) {
  const leading = a.live?.status === 'bidding' ? a.live.bid?.team : null;
  const mine = viewer?.team;
  // The viewer's own team first.
  const ids = Object.keys(a.teams).sort((x, y) => (y === mine) - (x === mine));
  return `<div class="grid grid-2">${ids.map((id) => `
    <div class="stack">
      ${teamPurse(a.teams[id], teamSummary(a, id), a.rules, { variant: 'card', leading: id === leading, hidePurse: !canSeePurse(a.rules, viewer, id) })}
      ${playerTable(squadRows(a, id), a.rules, { dense: true, columns: ['player', 'role', 'price'] })}
    </div>`).join('')}</div>`;
}

// Players still to come, and the waiting list, for profiles on phones and the stage.
export function profileGroups(a) {
  const left = pool(a);
  const ids = new Set(left.map((p) => p.id));
  const unsoldOut = Object.entries(a.players).filter(([id, p]) => inAuction(p) && !a.sales[id] && !ids.has(id)).map(([id, p]) => ({ ...p, id }));
  const waiting = Object.entries(a.players).filter(([id, p]) => isWaiting(p) && !a.sales[id]).map(([id, p]) => ({ ...p, id }));
  const byName = (x, y) => x.name.localeCompare(y.name);
  return { available: [...left, ...unsoldOut].sort(byName), waiting: waiting.sort(byName) };
}

const statLine = (p) => [p.matches != null && `${p.matches} m`, p.runs != null && `${p.runs} r`, p.strikeRate != null && `SR ${Math.round(p.strikeRate)}`,
  p.wickets != null && `${p.wickets} w`, p.economy != null && `eco ${Number(p.economy).toFixed(1)}`].filter(Boolean).join(' · ');

// Phones: both lists, each player opens to the full card.
export function profilesView(a) {
  const { available, waiting } = profileGroups(a);
  const row = (p) => `<details class="profile-row"><summary>
      <span class="ax-avatar" style="width:40px;height:40px">${p.photoData ? `<img src="${esc(p.photoData)}" alt="">` : esc(p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join(''))}</span>
      <span style="min-width:0;flex:1"><b>${esc(p.name)}</b> <small class="muted">${esc(ROLES[roleId(p.role)].code)}${a.unsold[p.id] ? ' · unsold so far' : ''}</small><br><small class="muted">${esc(statLine(p) || 'No stats yet')}</small></span>
    </summary><div style="padding:var(--space-2) 0">${cardFor(a, p.id)}</div></details>`;
  return `<div class="card"><h3 style="margin-top:0">Up for auction (${available.length})</h3>${available.map(row).join('') || '<p class="muted">Everyone has been bought.</p>'}</div>
    <div class="card" style="margin-top:var(--space-4)"><h3 style="margin-top:0">Waiting list (${waiting.length})</h3>${waiting.map(row).join('') || '<p class="muted">Nobody on the waiting list.</p>'}
    <p class="hint">Waiting-list players come into the auction only if the organisers move them in.</p></div>`;
}

// The stage: a board of player tiles (which = 'available' | 'waiting'), 30 to a page; the stage
// turns the pages by itself (page = a running counter).
export const BOARD_PAGE = 30;
export function stageBoard(a, which, page = 0) {
  const all = profileGroups(a)[which] || [];
  const pages = Math.max(1, Math.ceil(all.length / BOARD_PAGE));
  const at = page % pages;
  const list = all.slice(at * BOARD_PAGE, (at + 1) * BOARD_PAGE);
  return `<div class="stage-board" style="grid-column:1/-1">
    <h2 class="stage-board-title">${which === 'waiting' ? 'Waiting list' : 'Up for auction'} <span>${all.length} player${all.length === 1 ? '' : 's'}${pages > 1 ? ` · page ${at + 1} of ${pages}` : ''}</span></h2>
    <div class="stage-board-grid">${list.map((p) => `<div class="stage-tile">
      <span class="stage-tile-photo">${p.photoData ? `<img src="${esc(p.photoData)}" alt="">` : esc(p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join(''))}</span>
      <span style="min-width:0"><b>${esc(p.name)}</b><small>${esc(ROLES[roleId(p.role)].name)}</small><small>${esc(statLine(p))}</small></span></div>`).join('')}</div></div>`;
}

export function poolTable(a) {
  const rows = pool(a).map((p) => ({
    id: p.id,
    name: p.name,
    sub: [p.age ? `Age ${p.age}` : null, p.locality].filter(Boolean).join(' · '),
    role: p.role,
    category: category(a.rules, p.category)?.label,
    base: basePrice(p, a.rules),
    status: playerStatus(a, p.id),
  }));
  return playerTable(rows, a.rules, { dense: true, columns: ['player', 'role', 'category', 'base', 'status'] });
}

// The max-bid rule in words, with a worked example from this tournament's numbers.
export function maxBidExplainer(r) {
  const base = minBase(r);
  const left = Number(r.purse);
  const toBuy = Number(r.squadSize) - (hasVC(r) ? 2 : 1);
  const max = Math.max(0, Math.min(left, left - (toBuy - 1) * base));
  return {
    rule: `Max bid = purse left − (players still to buy − 1) × base price ${money(base, r)}, and never more than the purse left.`,
    example: `Example at the start: the full purse ${money(left, r)} (${hasVC(r) ? 'captain and vice-captain values are' : 'the captain value is'} not taken from it) with ${toBuy} players to buy, so the first max bid is ${money(left, r)} − ${toBuy - 1} × ${money(base, r)} = ${money(max, r)}.`,
  };
}

export function rulesSummary(a) {
  const r = a.rules;
  const res = reserves(r);
  const mb = maxBidExplainer(r);
  const items = [
    ['Format', `${r.playersPerSide}-a-side${r.overs ? `, ${r.overs} overs` : ''}`],
    ['Squad', `Every team must own exactly ${r.squadSize} players${res ? ` (${r.playersPerSide} playing + ${res} reserve${res === 1 ? '' : 's'})` : ''}, ${hasVC(r) ? 'captain and vice-captain' : 'captain'} included`],
    variedBudgets(a)
      ? ['Budget per team', `Mini auction${a.meta.parentName ? ` after ${a.meta.parentName}` : ''}: each team's budget = its remaining purse + the value of the players it released. Each captain sees their own team's budget`]
      : ['Purse per team', money(r.purse, r)],
    ...(variedBudgets(a) ? [['Kept players', 'Players a team kept from last season are already in its squad and are not auctioned']] : []),
    [hasVC(r) ? 'Captain and vice-captain' : 'Captain', hasVC(r)
      ? `Allotted to their team before the auction, not auctioned. Values: captain ${money(r.captainPrice, r)}, vice-captain ${money(r.vcPrice, r)}. These are not taken from the purse; if one is unavailable next season, their value is added to the team's mini-auction budget`
      : `Allotted to their team before the auction, not auctioned. Value ${money(r.captainPrice, r)}, not taken from the purse; if the captain is unavailable next season, it is added to the team's mini-auction budget`],
    ['Who bids', vcCanBid(r) ? 'The captain and the vice-captain, each from their own phone' : 'The captain'],
    [r.categories.length > 1 ? 'Pools and base prices' : 'Base price', r.categories.map((c) => `${r.categories.length > 1 ? `${c.label} ` : ''}${money(c.base, r)}${Number(c.min) ? `, at least ${c.min} per team` : ''}${Number(c.max) ? `, at most ${c.max} per team` : ''}`).join(' · ') + (r.categories.length > 1 ? `. ${r.categories[0].label} = the strongest players` : '')],
    ['Player order', r.pickOrder === 'manual' ? 'Chits drawn in the hall; the auctioneer brings up each player by name' : r.pickOrder === 'random' ? 'Random draw from all pools' : r.pickOrder === 'category-sequence' ? 'Pool by pool, in player number order' : `Random draw, pool by pool (${r.categories.map((c) => c.label).join(' → ')}). The auctioneer may also draw from one pool or bring up a chit`],
    ['Max bid', variedBudgets(a) ? mb.rule : `${mb.rule} ${mb.example}`],
    ...(Object.entries(r.roleMin).some(([, n]) => Number(n)) ? [['Each team needs', Object.entries(r.roleMin).filter(([, n]) => Number(n)).map(([k, n]) => `${n} ${ROLES[roleId(k)].code}`).join(', ')]] : []),
    ['Bid increments', r.increments.map((s) => (Number(s.upto) ? `+${money(s.step, r)} below ${money(s.upto, r)}` : `+${money(s.step, r)} above`)).join(' · ')],
    ...(Number(r.maxPlayerPrice) ? [['Price cap per player', money(r.maxPlayerPrice, r)]] : []),
    ['Bidding', r.bidMode === 'room' ? 'Room paddles; the auctioneer records bids' : 'From phones; the auctioneer confirms every sale'],
    ['Timer', Number(r.bidTimer) ? `${r.bidTimer} seconds after each bid` : 'Off'],
    ['Remaining purse and max bid shown to', PURSE_VISIBILITY[r.purseVisibility]],
  ];
  const house = r.houseRules.filter((h) => h.a);
  return `<div class="grid grid-2">
    <div class="card"><h2>Tournament rules</h2><dl class="rules-list">${items.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
    <div class="card"><h2>House rules</h2>${house.length
      ? `<dl class="rules-list">${house.map((h) => (h.q ? `<dt>${esc(h.q)}</dt><dd>${esc(h.a)}</dd>` : `<dt>${esc(h.a)}</dt>`)).join('')}</dl>`
      : '<p class="muted">The organisers have not added house rules.</p>'}</div>
  </div>`;
}
