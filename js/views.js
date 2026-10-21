// Screen sections shared by the admin console, live view, stage and results page,
// assembled from the design-system components in ds.js.

import { esc } from './ui.js';
import { money, teamSummary, category, basePrice, nextBid, isReserve, roleId, ROLES, pool } from './engine.js';
import { playerCard, bidPanel, teamPurse, salesTicker, badge, teamBadge, price, playerTable } from './ds.js';

export function playerStatus(a, pid) {
  const s = a.sales[pid];
  if (s) return s.retained ? 'retained' : 'sold';
  if (a.live?.playerId === pid && a.live.status === 'bidding') return 'live';
  if (a.unsold[pid]) return 'unsold';
  return 'upcoming';
}

// "Lot n of m": players brought up so far, counting the current one.
export function lotInfo(a) {
  const total = Object.values(a.players).length;
  const done = Object.values(a.sales).filter((s) => !s.retained).length + Object.keys(a.unsold).filter((pid) => !a.sales[pid]).length;
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
    reserve: isReserve(p),
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

export function purses(a, { mine = null, size = '' } = {}) {
  const leading = a.live?.status === 'bidding' ? a.live.bid?.team : null;
  return Object.entries(a.teams).map(([id, t]) =>
    teamPurse(t, teamSummary(a, id), a.rules, { size, leading: id === leading, mine: id === mine })).join('');
}

export function tickerItems(a, limit = 12) {
  const sales = Object.entries(a.sales).filter(([, s]) => !s.retained)
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
      case 'up': return `${badge('upcoming', { text: 'Up' })} ${name(e.playerId)} <span class="muted">base ${esc(money(e.amount, a.rules))}</span>`;
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
  return teamSummary(a, teamId).players.sort((x, y) => Number(x.reserve) - Number(y.reserve) || y.price - x.price).map((p) => ({
    id: p.id,
    name: p.name,
    sub: [p.reserve ? 'Reserve' : null, p.retained ? 'Retained' : null, p.battingStyle, p.bowlingStyle].filter(Boolean).join(' · '),
    role: p.role,
    category: category(a.rules, p.category)?.label,
    status: p.retained ? 'retained' : 'sold',
    price: p.price,
  }));
}

export function squads(a, { mine = null } = {}) {
  const leading = a.live?.status === 'bidding' ? a.live.bid?.team : null;
  // The viewer's own team first.
  const ids = Object.keys(a.teams).sort((x, y) => (y === mine) - (x === mine));
  return `<div class="grid grid-2">${ids.map((id) => `
    <div class="stack">
      ${teamPurse(a.teams[id], teamSummary(a, id), a.rules, { variant: 'card', leading: id === leading })}
      ${playerTable(squadRows(a, id), a.rules, { dense: true, columns: ['player', 'role', 'price'] })}
    </div>`).join('')}</div>`;
}

export function poolTable(a) {
  const rows = pool(a).map((p) => ({
    id: p.id,
    name: p.name,
    sub: [isReserve(p) ? 'Reserve' : null, p.age ? `Age ${p.age}` : null, p.locality].filter(Boolean).join(' · '),
    role: p.role,
    category: category(a.rules, p.category)?.label,
    base: basePrice(p, a.rules),
    status: playerStatus(a, p.id),
  }));
  return playerTable(rows, a.rules, { dense: true, columns: ['player', 'role', 'category', 'base', 'status'] });
}

export function rulesSummary(a) {
  const r = a.rules;
  const items = [
    ['Purse per team', money(r.purse, r)],
    ['Squad', `${r.minSquad} to ${r.maxSquad} players${Number(r.reservesPerTeam) ? `, plus up to ${r.reservesPerTeam} reserves` : ''}`],
    ['Categories', r.categories.map((c) => `${c.label} ${money(c.base, r)}${Number(c.min) ? `, min ${c.min}` : ''}${Number(c.max) ? `, max ${c.max}` : ''}`).join(' · ')],
    ...(Object.entries(r.roleMin).some(([, n]) => Number(n)) ? [['Each team needs', Object.entries(r.roleMin).filter(([, n]) => Number(n)).map(([k, n]) => `${n} ${ROLES[roleId(k)].code}`).join(', ')]] : []),
    ['Bid increments', r.increments.map((s) => (Number(s.upto) ? `+${money(s.step, r)} below ${money(s.upto, r)}` : `+${money(s.step, r)} above`)).join(' · ')],
    ...(Number(r.maxPlayerPrice) ? [['Price cap per player', money(r.maxPlayerPrice, r)]] : []),
    ['Bidding', r.bidMode === 'room' ? 'Room paddles; the auctioneer records bids' : 'Captains bid from their phones; the auctioneer confirms every sale'],
    ['Timer', Number(r.bidTimer) ? `${r.bidTimer} seconds after each bid` : 'Off'],
  ];
  const house = r.houseRules.filter((h) => h.a);
  return `<div class="grid grid-2">
    <div class="card"><h2>Auction rules</h2><dl class="rules-list">${items.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
    <div class="card"><h2>House rules</h2>${house.length
      ? `<dl class="rules-list">${house.map((h) => (h.q ? `<dt>${esc(h.q)}</dt><dd>${esc(h.a)}</dd>` : `<dt>${esc(h.a)}</dt>`)).join('')}</dl>`
      : '<p class="muted">The organisers have not added house rules.</p>'}</div>
  </div>`;
}
