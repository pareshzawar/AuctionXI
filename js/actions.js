// Database writes shared by the pages. Paths:
//   auctions/{aid}            public: meta, rules, teams, players, sales, unsold, live, log
//   secrets/{aid}             admin only: adminCode, teamCodes/{teamId} (captains), vcCodes/{teamId} (vice-captains)
//   captains/{aid}/{uid}      {team, as: 'C'|'VC', code, name} - a phone that proved its captain / vice-captain code
//   coadmins/{aid}/{uid}      {code, name}        - a device that proved the admin code

import { db, isLocal } from './db.js';
import { DEFAULT_RULES, capsUpdate, nextBid, bidBlocker, bidLimit, normalize, randomCode, slug, basePrice, money, teamSummary, allottedPrice } from './engine.js';

export async function createAuction({ name, tournament, venue, date, organiser }) {
  const prefix = (slug(tournament || name).replace(/-/g, '').slice(0, 4) || 'axi').toUpperCase();
  let aid;
  do { aid = `${prefix}-${randomCode(4)}`; } while (await db.get(`auctions/${aid}/meta`));
  const adminCode = randomCode(8);
  await db.set(`auctions/${aid}`, {
    meta: {
      name, tournament: tournament || null, venue: venue || null, date: date || null, organiser: organiser || null,
      ownerUid: db.uid(), createdAt: db.now(), status: 'setup', locked: false, round: 1,
    },
    rules: DEFAULT_RULES,
  });
  await db.set(`secrets/${aid}`, { adminCode, teamCodes: {}, vcCodes: {} });
  return { aid, adminCode };
}

export async function isAdmin(aid, meta) {
  if (isLocal) return true;
  if (meta?.ownerUid === db.uid()) return true;
  return !!(await db.get(`coadmins/${aid}/${db.uid()}`).catch(() => null));
}

export async function claimCoadmin(aid, code, name) {
  if (isLocal) {
    const s = await db.get(`secrets/${aid}`);
    if (s?.adminCode !== code) throw new Error('Wrong admin code');
  }
  try {
    await db.set(`coadmins/${aid}/${db.uid()}`, { code, name: name || 'Co-admin', at: db.now() });
  } catch {
    throw new Error('Wrong admin code');
  }
}

// as: 'C' (captain, team code) or 'VC' (vice-captain, vice-captain code).
export async function claimCaptain(aid, team, code, name, as = 'C') {
  const wrong = as === 'VC' ? 'Wrong vice-captain code for this team' : 'Wrong captain code for this team';
  if (isLocal) {
    const s = await db.get(`secrets/${aid}/${as === 'VC' ? 'vcCodes' : 'teamCodes'}/${team}`);
    if (!s || s !== code) throw new Error(wrong);
  }
  try {
    await db.set(`captains/${aid}/${db.uid()}`, { team, as, code, name: name || (as === 'VC' ? 'Vice-captain' : 'Captain'), at: db.now() });
  } catch {
    throw new Error(wrong);
  }
}

// { team, as } for this phone, or null.
export async function myBidderSeat(aid) {
  const c = await db.get(`captains/${aid}/${db.uid()}`).catch(() => null);
  return c?.team ? { team: c.team, as: c.as || 'C' } : null;
}

export function log(aid, entry) {
  return db.push(`auctions/${aid}/log`, { ...entry, at: db.now() });
}

// Captain (or admin on behalf of a team) raises the bid by one increment.
export async function placeBid(aid, a, team, source = 'phone') {
  const amount = nextBid(a.live, a.rules);
  const why = bidBlocker(a, team, amount);
  if (why) throw new Error(why);
  const timer = Number(a.rules.bidTimer) || 0;
  const seen = a.live.bid;
  const res = await db.transaction(`auctions/${aid}/live/bid`, (cur) => {
    // Abort if someone else bid since this screen last updated, so nobody
    // accidentally bids a higher amount than the one shown on their button.
    if (!cur || Number(cur.amount) !== Number(seen.amount) || (cur.team || null) !== (seen.team || null)) return undefined;
    return {
      amount, team, source, at: db.now(), until: timer ? db.now() + timer * 1000 : null,
      prev: { amount: Number(cur.amount), team: cur.team || null },
    };
  });
  if (!res.committed) {
    const now = (await db.get(`auctions/${aid}/live/bid`)) || {};
    throw new Error(`Outbid. ${money(now.amount, a.rules)} is now leading.`);
  }
  return amount;
}

// Take the current bid back one step (one level of undo).
export async function undoLastBid(aid, a) {
  const b = a.live?.bid;
  if (a.live?.status !== 'bidding' || !b?.team) throw new Error('No bid to undo');
  const prev = b.prev || { amount: basePrice(a.players[a.live.playerId], a.rules), team: null };
  await db.set(`auctions/${aid}/live/bid`, { amount: prev.amount, team: prev.team || null, at: db.now(), until: null });
}

// Room / paddle auction: the auctioneer enters the winning team and final amount.
// Returns a warning string (and does nothing) when a soft rule would be broken, unless `force`.
export async function recordRoomSale(aid, a, team, amount, force = false) {
  const live = a.live;
  if (!live || live.status !== 'bidding') throw new Error('Bring up a player first');
  if (!a.teams[team]) throw new Error('Choose the winning team');
  const p = a.players[live.playerId];
  const base = basePrice(p, a.rules);
  if (!(amount >= base)) throw new Error(`Enter at least the base price, ${money(base, a.rules)}`);
  const s = teamSummary(a, team);
  if (amount > s.remaining) throw new Error(`${a.teams[team].name} has only ${money(s.remaining, a.rules)} left`);
  const { max, why } = bidLimit(a, team, p);
  if (amount > max && !force) return `Over ${a.teams[team].name}'s max bid of ${money(max, a.rules)}. ${why}`;
  await db.set(`auctions/${aid}/live/bid`, { amount, team, source: 'room', at: db.now(), until: null });
  await sell(aid, { ...a, live: { ...live, bid: { amount, team } } });
  return null;
}

export async function startPlayer(aid, a, playerId) {
  const p = a.players[playerId];
  if (!p) throw new Error('Unknown player');
  if (a.sales[playerId]) throw new Error('Player already sold');
  await db.set(`auctions/${aid}/live`, {
    playerId, status: 'bidding', round: a.meta.round || 1, startedAt: db.now(),
    bid: { amount: basePrice(p, a.rules), team: null, at: db.now(), until: null },
  });
  await log(aid, { type: 'up', playerId, amount: basePrice(p, a.rules) });
}

export async function sell(aid, a) {
  const live = a.live;
  if (!live || live.status !== 'bidding') throw new Error('Nothing to sell');
  if (!live.bid?.team) throw new Error('No bids yet. Mark unsold instead.');
  const sale = { team: live.bid.team, price: Number(live.bid.amount), at: db.now(), round: live.round || 1, source: live.bid.source || 'phone' };
  const after = { ...a, sales: { ...a.sales, [live.playerId]: sale } };
  await db.update(`auctions/${aid}`, {
    [`sales/${live.playerId}`]: sale,
    [`unsold/${live.playerId}`]: null,
    'live/status': 'sold',
    ...capsUpdate(after),
  });
  await log(aid, { type: 'sold', playerId: live.playerId, team: sale.team, amount: sale.price });
}

export async function markUnsold(aid, a) {
  const live = a.live;
  if (!live || live.status !== 'bidding') throw new Error('No player under the hammer');
  await db.update(`auctions/${aid}`, {
    [`unsold/${live.playerId}`]: { round: a.meta.round || 1, at: db.now() },
    'live/status': 'unsold',
  });
  await log(aid, { type: 'unsold', playerId: live.playerId });
}

export async function undoLastSale(aid, a) {
  const last = Object.entries(a.sales).filter(([, s]) => !s.allotted && !s.retained).sort((x, y) => y[1].at - x[1].at)[0];
  if (!last) throw new Error('No sale to undo');
  const [pid, s] = last;
  const sales = { ...a.sales };
  delete sales[pid];
  await db.update(`auctions/${aid}`, {
    [`sales/${pid}`]: null,
    ...(a.live?.playerId === pid ? { live: null } : {}),
    ...capsUpdate({ ...a, sales }),
  });
  await log(aid, { type: 'undo', playerId: pid, team: s.team, amount: s.price });
}

// Put each team's captain / vice-captain in the team at their price, then open the auction.
export async function startAuction(aid, a) {
  const sales = { ...a.sales };
  const upd = {};
  for (const [pid, p] of Object.entries(a.players)) {
    if (p.allottedTeam && a.teams[p.allottedTeam] && !sales[pid]) {
      if (p.allottedAs === 'VC' && a.rules.leaders === 'captain') continue;
      sales[pid] = { team: p.allottedTeam, price: allottedPrice(p, a.rules), at: db.now(), round: 0, allotted: true };
      upd[`sales/${pid}`] = sales[pid];
    }
  }
  await db.update(`auctions/${aid}`, {
    ...upd,
    ...capsUpdate(normalize({ ...a, sales })),
    'meta/status': 'live',
    'meta/locked': true,
    'meta/startedAt': db.now(),
  });
  await log(aid, { type: 'start' });
}

export async function nextRound(aid, a) {
  const round = (Number(a.meta.round) || 1) + 1;
  await db.update(`auctions/${aid}`, { 'meta/round': round, live: null });
  await log(aid, { type: 'round', round });
}

export async function finishAuction(aid) {
  await db.update(`auctions/${aid}`, { 'meta/status': 'completed', 'meta/completedAt': db.now(), 'live/status': 'closed' });
  await log(aid, { type: 'end' });
}

// Public snapshot for archiving in the repo (archive/<slug>/auction.json).
export function exportSnapshot(a) {
  const { meta, rules, teams, players, sales, unsold, log: history } = a;
  const { ownerUid, ...publicMeta } = meta;
  return { format: 'auctionxi/1', exportedAt: new Date().toISOString(), meta: publicMeta, rules, teams, players, sales, unsold, log: history };
}
