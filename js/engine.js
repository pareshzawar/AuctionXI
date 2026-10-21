// Auction rules engine: pure functions over an auction snapshot.
// An auction snapshot looks like:
//   { meta, rules, teams: {id: team}, players: {id: player},
//     sales: {playerId: {team, price, at, round}}, unsold: {playerId: {round}},
//     live: {playerId, status, bid: {amount, team, at, until}}, log: {...} }

export const DEFAULT_RULES = {
  currency: '₹',
  purse: 10000,
  minSquad: 11,
  maxSquad: 15,
  categories: [
    { id: 'A', label: 'Icon', base: 1000 },
    { id: 'B', label: 'Gold', base: 500 },
    { id: 'C', label: 'Silver', base: 300 },
    { id: 'D', label: 'Bronze', base: 100 },
  ],
  // While the current bid is below `upto`, the next bid goes up by `step`.
  // `upto: 0` means "and above".
  increments: [
    { upto: 1000, step: 100 },
    { upto: 5000, step: 250 },
    { upto: 0, step: 500 },
  ],
  bidTimer: 30,
  pickOrder: 'category-random',
  unsoldRounds: 2,
  captainBidding: true,
};

export const ROLES = ['Batsman', 'Bowler', 'All-rounder', 'Wicket-keeper'];

export const PICK_ORDERS = {
  'category-random': 'Category by category, random within each',
  'category-sequence': 'Category by category, in player ID order',
  random: 'Fully random',
  manual: 'Manual - auctioneer picks every player',
};

export function withDefaults(rules) {
  return { ...DEFAULT_RULES, ...(rules || {}) };
}

export function normalize(a) {
  if (!a) return null;
  return {
    ...a,
    meta: a.meta || {},
    rules: withDefaults(a.rules),
    teams: a.teams || {},
    players: a.players || {},
    sales: a.sales || {},
    unsold: a.unsold || {},
    live: a.live || null,
    log: a.log || {},
  };
}

export function money(n, rules) {
  const c = (rules && rules.currency) ?? '₹';
  const v = Number(n || 0).toLocaleString('en-IN');
  return /^[A-Za-z]/.test(c) ? `${v} ${c}` : `${c}${v}`;
}

export function increment(amount, rules) {
  const slabs = rules.increments || [];
  for (const s of slabs) if (!Number(s.upto) || amount < Number(s.upto)) return Number(s.step);
  return Number(slabs.at(-1)?.step) || 100;
}

export function category(rules, id) {
  return (rules.categories || []).find((c) => c.id === id) || null;
}

export function minBase(rules) {
  const bases = (rules.categories || []).map((c) => Number(c.base)).filter((n) => n > 0);
  return bases.length ? Math.min(...bases) : 0;
}

export function basePrice(player, rules) {
  return Number(player.basePrice) || Number(category(rules, player.category)?.base) || minBase(rules);
}

export function nextBid(live, rules) {
  const b = live?.bid;
  if (!b) return null;
  return b.team ? Number(b.amount) + increment(Number(b.amount), rules) : Number(b.amount);
}

export function teamSummary(a, teamId) {
  const { rules } = a;
  const players = Object.entries(a.sales)
    .filter(([, s]) => s.team === teamId)
    .map(([pid, s]) => ({ ...(a.players[pid] || { name: '(removed)' }), id: pid, price: Number(s.price), retained: !!s.retained }));
  const spent = players.reduce((t, p) => t + p.price, 0);
  const count = players.length;
  const remaining = Number(rules.purse) - spent;
  const slots = Number(rules.maxSquad) - count;
  const stillNeeded = Math.max(0, Number(rules.minSquad) - count - 1);
  const maxBid = slots <= 0 ? 0 : Math.max(0, remaining - stillNeeded * minBase(rules));
  return { players, spent, count, remaining, slots, maxBid };
}

// Why a team can't bid `amount` right now, or null if it can.
export function bidBlocker(a, teamId, amount) {
  const live = a.live;
  if (!live || live.status !== 'bidding') return 'No player under the hammer';
  if (live.bid?.team === teamId) return 'Already the highest bidder';
  const t = teamSummary(a, teamId);
  if (t.slots <= 0) return 'Squad is full';
  if (amount > t.maxBid) return `Max bid is ${money(t.maxBid, a.rules)} (must keep purse for minimum squad)`;
  return null;
}

// Players still to be auctioned in the current round.
export function pool(a) {
  const round = Number(a.meta.round) || 1;
  return Object.entries(a.players)
    .filter(([pid]) => !a.sales[pid] && !(a.unsold[pid] && Number(a.unsold[pid].round) >= round))
    .map(([id, p]) => ({ ...p, id }));
}

export function pickNext(a) {
  const { rules } = a;
  const candidates = pool(a);
  if (!candidates.length || rules.pickOrder === 'manual') return null;
  const rnd = (list) => list[Math.floor(Math.random() * list.length)];
  if (rules.pickOrder === 'random') return rnd(candidates);
  const order = (rules.categories || []).map((c) => c.id);
  const rank = (p) => { const i = order.indexOf(p.category); return i < 0 ? order.length : i; };
  const best = Math.min(...candidates.map(rank));
  const group = candidates.filter((p) => rank(p) === best);
  if (rules.pickOrder === 'category-sequence') {
    return group.sort((x, y) => String(x.id).localeCompare(String(y.id), undefined, { numeric: true }))[0];
  }
  return rnd(group);
}

// Multi-path update that stores each team's spent / maxBid. The database rules
// read `maxBid` to stop captains bidding beyond their purse.
export function capsUpdate(a) {
  const out = {};
  for (const id of Object.keys(a.teams)) {
    const t = teamSummary(a, id);
    out[`teams/${id}/spent`] = t.spent;
    out[`teams/${id}/maxBid`] = t.maxBid;
  }
  return out;
}

export function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// Google Drive "share" links don't render as images; convert to a thumbnail URL.
export function photoUrl(url) {
  if (!url) return '';
  const m = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : url;
}

export function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = crypto.getRandomValues(new Uint32Array(len));
  for (const n of buf) s += chars[n % chars.length];
  return s;
}

export function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
