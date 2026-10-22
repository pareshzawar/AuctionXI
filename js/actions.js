// Database writes shared by the pages. Paths:
//   auctions/{aid}            public: meta, rules, teams, players, sales, unsold, live, log
//   secrets/{aid}             admin only: adminCode, teamCodes/{teamId} (captains), vcCodes/{teamId} (vice-captains)
//   captains/{aid}/{uid}      {team, as: 'C'|'VC', code, name} - a phone that proved its captain / vice-captain code
//   coadmins/{aid}/{uid}      {code, name}        - a device that proved the admin code

import { db, isLocal } from './db.js';
import { esc } from './ui.js';
import { DEFAULT_RULES, capsUpdate, nextBid, bidBlocker, bidLimit, normalize, randomCode, slug, basePrice, money, teamSummary, allottedPrice, miniBudget, visibilityOf } from './engine.js';

async function newAuctionId(name, tournament) {
  const prefix = (slug(tournament || name).replace(/-/g, '').slice(0, 4) || 'axi').toUpperCase();
  let aid;
  do { aid = `${prefix}-${randomCode(4)}`; } while (await db.get(`auctions/${aid}/meta`));
  return aid;
}

// A major auction: a fresh player pool. `copyFrom` (an earlier auction, normalized) copies its
// rules, house rules and teams - typically last season's auction of the same tournament.
export async function createAuction({ name, tournament, season, venue, date, organiser, copyFrom = null }) {
  const aid = await newAuctionId(name, tournament);
  const adminCode = randomCode(8);
  const teams = {};
  const codes = { teamCodes: {}, vcCodes: {} };
  for (const [id, t] of Object.entries(copyFrom?.teams || {})) {
    const { purse, spent, maxBid, carriedOver, releasedValue, captainName, vcName, ...rest } = t; // new season, new captains
    teams[id] = rest;
    codes.teamCodes[id] = randomCode(6);
    codes.vcCodes[id] = randomCode(6);
  }
  await db.set(`auctions/${aid}`, {
    meta: {
      name, tournament: tournament || null, season: season || null, kind: 'major',
      venue: venue || null, date: date || null, organiser: organiser || null,
      copiedFrom: copyFrom ? copyFrom.id : null, copiedFromName: copyFrom ? copyFrom.meta.name : null,
      ownerUid: db.uid(), createdAt: db.now(), status: 'setup', locked: false, round: 1,
      visibility: 'private', // hidden until the admin opens it
    },
    rules: copyFrom ? copyFrom.rules : DEFAULT_RULES,
    teams,
  });
  await db.set(`secrets/${aid}`, { adminCode, ...codes });
  if (copyFrom) await db.update(`auctions/${aid}`, capsUpdate(normalize({ meta: {}, rules: copyFrom.rules, teams })));
  // The league logo and banner carry over; player photos belong to the players uploaded later.
  if (copyFrom?.media?.logo || copyFrom?.media?.banner) await db.set(`media/${aid}`, { logo: copyFrom.media.logo || null, banner: copyFrom.media.banner || null });
  return { aid, adminCode };
}

// Next season's mini auction from a finished auction `a`.
// keep: { teamId: Set(playerId) } - players each team keeps. Kept players join their team before
// the auction (captain / vice-captain stay so; others as retained) and are never auctioned.
// Each team's budget = remaining purse + value of its released players.
// addToPool: put released and never-sold players back into the player pool.
export async function createMiniAuction(prevAid, a, { name, season, keep, addToPool }) {
  const aid = await newAuctionId(name, a.meta.tournament);
  const own = (p) => { const { photoData: _, ...rest } = p; return rest; }; // photos live under media/
  const teams = {};
  const players = {};
  const codes = { teamCodes: {}, vcCodes: {} };
  for (const [id, t] of Object.entries(a.teams)) {
    const mb = miniBudget(a, id, keep[id] || new Set());
    const { spent, maxBid, captainName, vcName, ...rest } = t; // leaders come from the kept players
    teams[id] = { ...rest, purse: mb.budget, carriedOver: mb.remaining, releasedValue: mb.releasedValue };
    for (const p of mb.kept) {
      players[p.id] = { ...own(a.players[p.id]), allottedTeam: id, allottedAs: p.as === 'C' || p.as === 'VC' ? p.as : 'R', allottedPrice: p.price };
    }
    if (addToPool) for (const p of mb.released) players[p.id] = { ...own(a.players[p.id]), allottedTeam: null, allottedAs: null, allottedPrice: null };
    codes.teamCodes[id] = randomCode(6);
    codes.vcCodes[id] = randomCode(6);
  }
  if (addToPool) {
    for (const [pid, p] of Object.entries(a.players)) {
      if (!a.sales[pid] && !p.allottedTeam) players[pid] = { ...own(p), allottedTeam: null, allottedAs: null, allottedPrice: null };
    }
  }
  const adminCode = randomCode(8);
  const next = normalize({
    meta: {
      name, tournament: a.meta.tournament || null, season: season || a.meta.season || null, organiser: a.meta.organiser || null, venue: null, date: null,
      ownerUid: db.uid(), createdAt: db.now(), status: 'setup', locked: false, round: 1,
      kind: 'mini', parent: prevAid, parentName: a.meta.name, visibility: 'private',
    },
    rules: a.rules,
    teams,
    players,
  });
  await db.set(`auctions/${aid}`, { meta: next.meta, rules: next.rules, teams: next.teams, players: next.players });
  await db.set(`secrets/${aid}`, { adminCode, ...codes });
  await db.update(`auctions/${aid}`, capsUpdate(next));
  const m = a.media || {};
  const photos = Object.fromEntries(Object.keys(players).filter((pid) => m.players?.[pid]).map((pid) => [pid, m.players[pid]]));
  if (m.logo || m.banner || Object.keys(photos).length) await db.set(`media/${aid}`, { logo: m.logo || null, banner: m.banner || null, players: photos });
  return { aid, adminCode };
}

// A practice copy of an auction: the same setup, teams, players and pictures, new codes, nothing
// sold. Run it end to end with the captains to check everything works, reset it, run it again.
// The real auction is never touched.
export async function createMockAuction(fromAid, a) {
  const aid = await newAuctionId('mock', 'mock');
  const { ownerUid, createdAt, startedAt, completedAt, status, round, mock, mockOf, mockOfName, visibility, ...meta } = a.meta;
  const teams = {};
  const codes = { teamCodes: {}, vcCodes: {} };
  for (const [id, t] of Object.entries(a.teams)) {
    const { spent, maxBid, ...rest } = t;
    teams[id] = rest;
    codes.teamCodes[id] = randomCode(6);
    codes.vcCodes[id] = randomCode(6);
  }
  const players = Object.fromEntries(Object.entries(a.players).map(([id, { photoData, ...p }]) => [id, p]));
  const adminCode = randomCode(8);
  await db.set(`auctions/${aid}`, {
    meta: { ...meta, name: `${a.meta.name} (mock)`, mock: true, mockOf: fromAid, mockOfName: a.meta.name, visibility: 'link', ownerUid: db.uid(), createdAt: db.now(), status: 'setup', round: 1, locked: !!a.meta.locked },
    rules: a.rules,
    teams,
    players,
  });
  await db.set(`secrets/${aid}`, { adminCode, ...codes });
  await db.update(`auctions/${aid}`, capsUpdate(normalize(await db.get(`auctions/${aid}`))));
  const m = a.media || {};
  if (m.logo || m.banner || m.players) await db.set(`media/${aid}`, { logo: m.logo || null, banner: m.banner || null, players: m.players || null });
  return { aid, adminCode };
}

// Back to "not started" with nothing sold. Mock auctions only.
export async function resetAuction(aid, a) {
  if (!a.meta.mock) throw new Error('Only a mock auction can be reset');
  await db.update(`auctions/${aid}`, {
    sales: null, unsold: null, live: null, log: null,
    'meta/status': 'setup', 'meta/round': 1, 'meta/startedAt': null, 'meta/completedAt': null,
  });
  await db.update(`auctions/${aid}`, capsUpdate(normalize(await db.get(`auctions/${aid}`))));
}

// Remove an auction and everything that belongs to it. The auction itself goes last, because the
// database rules check its owner for the other parts.
export async function deleteAuction(aid) {
  for (const part of ['directory', 'secrets', 'media', 'captains', 'coadmins']) await db.set(`${part}/${aid}`, null).catch(() => {});
  await db.set(`auctions/${aid}`, null);
}

// Who can see the auction (see VISIBILITY in engine.js). A listed auction also gets an entry in
// directory/, the public list on the home page.
export async function setVisibility(aid, meta, visibility) {
  await db.update(`auctions/${aid}`, { 'meta/visibility': visibility });
  await syncDirectory(aid, { ...meta, visibility });
}

export const directoryEntry = (m) => ({
  name: m.name, tournament: m.tournament || null, season: m.season || null, status: m.status || 'setup',
  date: m.date || null, time: m.time || null, venue: m.venue || null, mock: !!m.mock,
});

export async function syncDirectory(aid, meta) {
  if (isLocal) return;
  if (meta.visibility === 'listed') await db.set(`directory/${aid}`, directoryEntry(meta));
  else await db.set(`directory/${aid}`, null).catch(() => {});
}

// Can this device open the auction? { meta, ok }. meta is null when there is no such auction.
export async function viewGate(aid) {
  const meta = await db.get(`auctions/${aid}/meta`).catch(() => null);
  if (!meta) return { meta: null, ok: false };
  if (visibilityOf(meta) !== 'private') return { meta, ok: true };
  return { meta, ok: await isAdmin(aid, meta) };
}

// A private auction: show "not open yet" and reload by itself the moment the admin opens it.
export function waitUntilOpen(aid, meta, el) {
  el.innerHTML = `<div class="card" style="max-width:640px;margin:var(--space-8) auto;text-align:center">
    <h2>${esc(meta.name)}</h2>
    <p>The organisers are still setting this auction up. This page opens by itself as soon as they open it.</p></div>`;
  db.on(`auctions/${aid}/meta/visibility`, (v) => { if (v !== 'private') location.reload(); });
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

// how: { drawn: 'random' | 'chit', pool } - shown on the stage ("Random draw · Pool A", "Chit").
export async function startPlayer(aid, a, playerId, how = {}) {
  const p = a.players[playerId];
  if (!p) throw new Error('Unknown player');
  if (a.sales[playerId]) throw new Error(`${p.name} is already in a team`);
  if (a.live?.status === 'bidding') throw new Error('Finish the player on the block first (mark sold or unsold)');
  await db.set(`auctions/${aid}/live`, {
    playerId, status: 'bidding', round: a.meta.round || 1, startedAt: db.now(),
    drawn: how.drawn || null, drawnPool: how.pool || null,
    bid: { amount: basePrice(p, a.rules), team: null, at: db.now(), until: null },
  });
  await log(aid, { type: 'up', playerId, amount: basePrice(p, a.rules), drawn: how.drawn || null });
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
  const plain = Object.fromEntries(Object.entries(players).map(([id, { photoData, ...p }]) => [id, p]));
  return { format: 'auctionxi/1', exportedAt: new Date().toISOString(), meta: publicMeta, rules, teams, players: plain, sales, unsold, log: history, media: a.media || null };
}
