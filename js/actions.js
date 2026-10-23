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
/* ---------------- who may create auctions ---------------- */
// Only approved organisers (Google accounts on organisers/, managed by the site owners at
// siteOwners/) can create auctions; the database rules enforce it. Demo mode has no accounts, so
// everyone can. Keys are the email in lower case with '.' as ',' (dots aren't allowed in keys).
export const emailKey = (email) => String(email || '').trim().toLowerCase().replace(/\./g, ',');

// { can, email, owner, claimed, why }
export async function organiserStatus() {
  if (isLocal) return { can: true, local: true };
  const email = db.email?.();
  const claimed = !!(await db.get('site/claimed').catch(() => null));
  if (!email) return { can: false, claimed, why: 'signin' };
  const k = emailKey(email);
  const [owner, org] = await Promise.all([db.get(`siteOwners/${k}`).catch(() => null), db.get(`organisers/${k}`).catch(() => null)]);
  if (owner || org) return { can: true, email, owner: !!owner, claimed };
  return { can: false, email, claimed, why: claimed ? 'not-listed' : 'no-owner' };
}

// The first person to claim the site becomes its owner (only while nobody has).
export async function claimSite() {
  const email = db.email?.();
  if (!email) throw new Error('Sign in with Google first');
  await db.update('', { [`siteOwners/${emailKey(email)}`]: true, 'site/claimed': true });
}

export async function listOrganisers() {
  const [owners, orgs] = await Promise.all([db.get('siteOwners').catch(() => null), db.get('organisers').catch(() => null)]);
  const out = new Map();
  for (const [k, x] of Object.entries(orgs || {})) out.set(k, { key: k, email: x.email, addedBy: x.addedBy || '', owner: false });
  for (const k of Object.keys(owners || {})) out.set(k, { ...(out.get(k) || { key: k, email: k.replace(/,/g, '.') }), owner: true });
  return [...out.values()].sort((x, y) => Number(y.owner) - Number(x.owner) || x.email.localeCompare(y.email));
}

export async function addOrganiser(email, { owner = false } = {}) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error(`"${email}" is not an email address`);
  const k = emailKey(e);
  await db.set(`organisers/${k}`, { email: e, addedBy: db.email?.() || '', addedAt: db.now() });
  if (owner) await db.set(`siteOwners/${k}`, true);
}

export async function removeOrganiser(key, { owner = false } = {}) {
  if (owner) {
    if (key === emailKey(db.email?.())) throw new Error('You cannot remove yourself as a site owner');
    await db.set(`siteOwners/${key}`, null);
  }
  await db.set(`organisers/${key}`, null);
}

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

// A past auction kept as a record: an AuctionXI file (exportSnapshot's format, auctionxi/1) saved as a
// finished, private auction with new admin and captain codes. Photos in the file go to media/.
export async function importAuction(snap) {
  if (!snap || snap.format !== 'auctionxi/1' || !snap.meta || !snap.teams) throw new Error('This is not an AuctionXI auction file');
  const aid = await newAuctionId(snap.meta.name || 'record', snap.meta.tournament);
  const photos = {};
  const players = {};
  for (const [id, { photoData, ...p }] of Object.entries(snap.players || {})) {
    players[id] = p;
    if (photoData) photos[id] = photoData;
  }
  const teams = Object.fromEntries(Object.entries(snap.teams).map(([id, { spent, maxBid, ...t }]) => [id, t]));
  const { ownerUid, ...meta } = snap.meta;
  await db.set(`auctions/${aid}`, {
    meta: { ...meta, ownerUid: db.uid(), createdAt: db.now(), importedAt: db.now(), status: 'completed', locked: true, visibility: 'private', mock: null },
    rules: snap.rules || DEFAULT_RULES,
    teams,
    players,
    sales: snap.sales || null,
    unsold: snap.unsold || null,
    log: snap.log || null,
    results: snap.results || null, // how the season went (js/history.js)
  });
  const codes = { teamCodes: {}, vcCodes: {} };
  for (const id of Object.keys(teams)) { codes.teamCodes[id] = randomCode(6); codes.vcCodes[id] = randomCode(6); }
  await db.set(`secrets/${aid}`, { adminCode: randomCode(8), ...codes });
  await db.update(`auctions/${aid}`, capsUpdate(normalize(await db.get(`auctions/${aid}`))));
  const m = snap.media || {};
  Object.assign(photos, m.players || {});
  if (m.logo || m.banner || Object.keys(photos).length) await db.set(`media/${aid}`, { logo: m.logo || null, banner: m.banner || null, players: photos });
  return { aid };
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
  forgetOnAccount(aid);
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

/* ---------------- your auctions, on your Google account ---------------- */
// The home page's "My tournaments and auctions" list lives in each browser. Signed in with Google,
// it is also kept on the account (accounts/{uid}/auctions), so any laptop or private window shows it.
export async function rememberOnAccount(aid, meta, role) {
  if (isLocal || !db.email?.() || !meta) return;
  await db.set(`accounts/${db.uid()}/auctions/${aid}`, {
    name: meta.name || aid, tournament: meta.tournament || '', season: String(meta.season || ''), kind: meta.kind || 'major',
    mock: !!meta.mock, role, at: db.now(),
  }).catch(() => {});
}
export async function accountAuctions() {
  if (isLocal || !db.email?.()) return [];
  const v = await db.get(`accounts/${db.uid()}/auctions`).catch(() => null);
  return Object.entries(v || {}).map(([id, x]) => ({ id, ...x }));
}
export const forgetOnAccount = (aid) => (isLocal || !db.email?.() ? null : db.set(`accounts/${db.uid()}/auctions/${aid}`, null).catch(() => {}));

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
// amount: a jump bid called out in the hall ("150!"); by default the next step up.
export async function placeBid(aid, a, team, source = 'phone', jump = null) {
  const next = nextBid(a.live, a.rules);
  const amount = jump != null ? Number(jump) : next;
  if (!Number.isFinite(amount)) throw new Error('Enter an amount');
  if (amount < next) throw new Error(`The next bid must be at least ${money(next, a.rules)}`);
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
  if (p.list === 'cancelled') throw new Error(`${p.name}'s registration is cancelled. Put them back in the auction first (Players tab)`);
  if (p.list === 'waiting') throw new Error(`${p.name} is on the waiting list. Move them into the auction first (Players tab)`);
  if (a.meta.stageView) await db.set(`auctions/${aid}/meta/stageView`, null); // the stage goes back to the auction
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
    // `first`: when the player first went unsold, so unsold rounds keep the original order.
    [`unsold/${live.playerId}`]: { round: a.meta.round || 1, at: db.now(), first: a.unsold[live.playerId]?.first ?? a.unsold[live.playerId]?.at ?? db.now() },
    'live/status': 'unsold',
  });
  await log(aid, { type: 'unsold', playerId: live.playerId });
}

// Undo any sale (admins only: the database lets only admins change sales). The player goes back to
// the pool, to come up again; the team gets the money back.
export async function undoSale(aid, a, pid) {
  const s = a.sales[pid];
  if (!s || s.allotted || s.retained) throw new Error('That player was not bought in the auction');
  const sales = { ...a.sales };
  delete sales[pid];
  await db.update(`auctions/${aid}`, {
    [`sales/${pid}`]: null,
    ...(a.live?.playerId === pid ? { live: null } : {}),
    ...capsUpdate({ ...a, sales }),
  });
  await log(aid, { type: 'undo', playerId: pid, team: s.team, amount: s.price });
}

// Change the team and / or price of any sale. Returns a warning (and changes nothing) when a rule
// would be broken, unless `force`: the admin may know better (a mistake typed in the hall).
export async function editSale(aid, a, pid, { team, price }, force = false) {
  const s = a.sales[pid];
  const p = a.players[pid];
  if (!s || s.allotted || s.retained || !p) throw new Error('That player was not bought in the auction');
  if (!a.teams[team]) throw new Error('Choose the team');
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter the price');
  if (team === s.team && amount === Number(s.price)) return null;
  const without = { ...a, sales: Object.fromEntries(Object.entries(a.sales).filter(([k]) => k !== pid)), live: null };
  const lim = bidLimit(without, team, p);
  const warn = [];
  if (amount < basePrice(p, a.rules)) warn.push(`below ${p.name}'s base price of ${money(basePrice(p, a.rules), a.rules)}`);
  if (amount > lim.max) warn.push(`over what ${a.teams[team].name} can pay (${money(lim.max, a.rules)}${lim.why ? `: ${lim.why}` : ''})`);
  if (warn.length && !force) return `This sale would be ${warn.join(' and ')}.`;
  const sale = { ...s, team, price: amount, editedAt: db.now(), was: { team: s.team, price: Number(s.price) } };
  await db.update(`auctions/${aid}`, {
    [`sales/${pid}`]: sale,
    ...capsUpdate({ ...a, sales: { ...a.sales, [pid]: sale } }),
  });
  await log(aid, { type: 'edit', playerId: pid, team, amount, fromTeam: s.team, fromAmount: Number(s.price) });
  return null;
}

// The countdown after each bid is only shown, never acted on: the auctioneer always closes the
// bidding. It can be switched off and on during the auction (the seconds are remembered).
export async function setTimer(aid, a, on) {
  const secs = Number(a.rules.bidTimer) || 0;
  const upd = on
    ? { 'rules/bidTimer': secs || Number(a.rules.bidTimerWas) || 30 }
    : { 'rules/bidTimer': 0, 'rules/bidTimerWas': secs || Number(a.rules.bidTimerWas) || 30, ...(a.live?.status === 'bidding' ? { 'live/bid/until': null } : {}) };
  await db.update(`auctions/${aid}`, upd);
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
  return { format: 'auctionxi/1', exportedAt: new Date().toISOString(), meta: publicMeta, rules, teams, players: plain, sales, unsold, log: history, ...(a.results ? { results: a.results } : {}), media: a.media || null };
}
