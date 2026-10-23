// A captain's budget plan: the players they want, the most they will pay for each, and what each
// buy leaves for the rest of the squad. Everything is worked out with the tournament's own rules
// (teamSummary / bidLimit) on a copy of the auction with the planned buys added, so it matches what
// the app will actually allow. Pure functions: no database, no DOM.

import { teamSummary, bidLimit, basePrice, minBase, allottedPrice } from './engine.js';

// The auction as it would be if `team` bought `pid` for `price`.
export function withBuy(a, team, pid, price) {
  return { ...a, sales: { ...a.sales, [pid]: { team, price: Number(price) || 0 } }, live: null };
}

// Before the auction starts the captains / vice-captains are not in the squads yet: count them the
// way the start of the auction will (startAuction), so a plan made beforehand is right.
export function withLeaders(a) {
  let sales = null;
  for (const [pid, p] of Object.entries(a.players)) {
    if (!p.allottedTeam || !a.teams[p.allottedTeam] || a.sales[pid]) continue;
    if (p.allottedAs === 'VC' && a.rules.leaders === 'captain') continue;
    (sales ||= { ...a.sales })[pid] = { team: p.allottedTeam, price: allottedPrice(p, a.rules), allotted: true };
  }
  return sales ? { ...a, sales } : a;
}

// Where a team stands: points left, squad, still to buy, max bid on the next player.
export function standing(a, team) {
  const s = teamSummary(withLeaders(a), team);
  return { remaining: s.remaining, count: s.count, toBuy: s.toBuy, maxBid: s.maxBid, squadSize: Number(a.rules.squadSize) };
}

// Who can still be bought: not sold, not a captain / VC, not on the waiting list or cancelled.
export const buyable = (a, pid) => !!a.players[pid] && !a.sales[pid] && !a.players[pid].allottedTeam && !a.players[pid].list;

// The plan for `team`: `targets` is [{ id, max }] in the captain's order. Each target still
// available is "bought" in turn at its max (or its base price if no max is set), and we record what
// is left after it. Targets already sold are listed apart.
export function planFor(a, team, targets) {
  a = withLeaders(a);
  const r = a.rules;
  const base = minBase(r);
  const now = standing(a, team);
  let sim = a;
  const steps = [];
  const gone = [];
  for (const t of targets) {
    const p = a.players[t.id];
    if (!p) continue;
    const sale = a.sales[t.id];
    if (sale) { gone.push({ id: t.id, mine: sale.team === team, team: sale.team, price: Number(sale.price) }); continue; }
    if (!buyable(a, t.id)) { gone.push({ id: t.id, unavailable: p.list || 'unavailable' }); continue; }
    const price = t.max != null && t.max !== '' ? Number(t.max) : basePrice(p, r);
    const limit = bidLimit(sim, team, p);
    const fits = price <= limit.max;
    const belowBase = price < basePrice(p, r);
    if (fits && !belowBase) sim = withBuy(sim, team, t.id, price);
    const after = standing(sim, team);
    steps.push({ id: t.id, price, planned: t.max != null && t.max !== '', fits: fits && !belowBase, belowBase, limit: limit.max, why: limit.why, ...after });
  }
  const end = standing(sim, team);
  const counted = steps.filter((s) => s.fits);
  const spend = counted.reduce((t, s) => t + s.price, 0);
  const restSlots = end.toBuy;
  const spare = end.remaining - restSlots * base; // above the base price for the rest of the squad
  return {
    now, steps, gone, base,
    spend, count: counted.length,
    left: end.remaining, restSlots,
    perSlot: restSlots ? Math.floor(end.remaining / restSlots) : 0,
    spare,
    extra: Math.max(0, steps.length - now.toBuy), // more targets than places left
  };
}

// What buying `pid` at `price` does to `team`: allowed now? what's left after? which targets in the
// plan stop being affordable?
export function whatIf(a, team, pid, price, targets = []) {
  a = withLeaders(a);
  const p = a.players[pid];
  const before = standing(a, team);
  const limit = bidLimit(a, team, p);
  const n = Number(price) || 0;
  const allowed = n <= limit.max && n >= basePrice(p, a.rules);
  const sim = withBuy(a, team, pid, n);
  const after = standing(sim, team);
  const rest = planFor(sim, team, targets.filter((t) => t.id !== pid));
  return { before, after, limit, allowed, belowBase: n < basePrice(p, a.rules), plan: rest, lost: rest.steps.filter((s) => !s.fits) };
}
