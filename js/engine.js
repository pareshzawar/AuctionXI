// Auction rules engine: pure functions over an auction snapshot.
// An auction snapshot looks like:
//   { meta, rules, teams: {id: team}, players: {id: player},
//     sales: {playerId: {team, price, at, round, retained?, source?}}, unsold: {playerId: {round}},
//     live: {playerId, status, bid: {amount, team, at, until}}, log: {...} }
// Amounts are whole numbers in the base unit (virtual rupees, or points).

const L = 100000; // one lakh

export const DEFAULT_RULES = {
  currency: '₹',
  purse: 100 * L, // ₹1 Cr virtual purse
  minSquad: 11,
  maxSquad: 15,
  reservesPerTeam: 0,
  reserveBasePrice: 0,
  maxPlayerPrice: 0, // 0 = no cap
  retainedPriceDefault: 0,
  playersPerSide: 11,
  overs: null,
  // min/max: per-team limits for the category (0 = none)
  categories: [
    { id: 'A', label: 'Icon', base: 10 * L, min: 0, max: 0 },
    { id: 'B', label: 'Gold', base: 5 * L, min: 0, max: 0 },
    { id: 'C', label: 'Silver', base: 2 * L, min: 0, max: 0 },
    { id: 'D', label: 'Bronze', base: 1 * L, min: 0, max: 0 },
  ],
  roleMin: { bat: 0, bowl: 0, ar: 0, wk: 0 },
  // While the current bid is below `upto`, the next bid goes up by `step`.
  // `upto: 0` means "and above".
  increments: [
    { upto: 20 * L, step: 50000 },
    { upto: 50 * L, step: 1 * L },
    { upto: 0, step: 2 * L },
  ],
  bidTimer: 30,
  pickOrder: 'category-random',
  unsoldRounds: 1,
  // 'both': captains bid from phones and the auctioneer can also record room bids.
  // 'room': paddles in the room only; the auctioneer records every bid or just the final amount.
  bidMode: 'both',
  houseRules: [],
};

export const ROLES = {
  bat: { code: 'BAT', name: 'Batter' },
  bowl: { code: 'BOWL', name: 'Bowler' },
  ar: { code: 'AR', name: 'All-rounder' },
  wk: { code: 'WK', name: 'Wicket-keeper' },
};

export const PICK_ORDERS = {
  'category-random': 'Category by category, random within each',
  'category-sequence': 'Category by category, in player ID order',
  random: 'Fully random',
  manual: 'Manual - auctioneer picks every player',
};

export const BID_MODES = {
  both: 'Captains bid from phones (auctioneer can also record room bids)',
  room: 'Room paddles only (auctioneer records bids or the final amount)',
};

// Old auctions stored full role names; accept both.
export function roleId(r) {
  const s = String(r || '').toLowerCase().replace(/[^a-z]/g, '');
  if (ROLES[s]) return s;
  if (s.startsWith('wk') || s.includes('keeper')) return 'wk';
  if (s.startsWith('all') || s === 'ar') return 'ar';
  if (s.startsWith('bowl')) return 'bowl';
  if (s.startsWith('bat')) return 'bat';
  return 'ar';
}

export function withDefaults(rules) {
  const r = { ...DEFAULT_RULES, ...(rules || {}) };
  if (r.bidMode === 'phones') r.bidMode = 'both';
  if (rules && rules.captainBidding === false && !rules.bidMode) r.bidMode = 'room';
  r.roleMin = { ...DEFAULT_RULES.roleMin, ...(r.roleMin || {}) };
  r.categories = (r.categories || []).map((c) => ({ min: 0, max: 0, ...c }));
  r.houseRules = Array.isArray(r.houseRules) ? r.houseRules.filter((x) => x && x.a) : Object.values(r.houseRules || {});
  return r;
}

export const phoneBidding = (rules) => rules.bidMode !== 'room';

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

/* ---------------- money ---------------- */

function trimNum(n, digits) {
  const s = n.toFixed(digits);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

// Same rules as the design system's formatPrice: ₹4.2 L, ₹1.25 Cr, ₹50,000 · 2,400 pts · $250 K
export function moneyParts(n, rules) {
  const c = (rules && rules.currency) ?? '₹';
  const a = Math.max(0, Number(n) || 0);
  if (/^[A-Za-z]/.test(c)) return { symbol: '', number: a.toLocaleString('en-IN'), unit: c };
  if (c === '₹' || c === 'Rs' || c === 'INR') {
    if (a >= 1e7) return { symbol: '₹', number: trimNum(a / 1e7, 2), unit: 'Cr' };
    if (a >= 1e5) return { symbol: '₹', number: trimNum(a / 1e5, 2), unit: 'L' };
    return { symbol: '₹', number: a.toLocaleString('en-IN'), unit: '' };
  }
  if (a >= 1e9) return { symbol: c, number: trimNum(a / 1e9, 2), unit: 'B' };
  if (a >= 1e6) return { symbol: c, number: trimNum(a / 1e6, 2), unit: 'M' };
  if (a >= 1e4) return { symbol: c, number: trimNum(a / 1e3, 1), unit: 'K' };
  return { symbol: c, number: a.toLocaleString('en-US'), unit: '' };
}

export function money(n, rules) {
  const p = moneyParts(n, rules);
  return p.symbol + p.number + (p.unit ? ` ${p.unit}` : '');
}

/* ---------------- prices ---------------- */

export function increment(amount, rules) {
  const slabs = rules.increments || [];
  for (const s of slabs) if (!Number(s.upto) || amount < Number(s.upto)) return Number(s.step);
  return Number(slabs.at(-1)?.step) || 1;
}

export function category(rules, id) {
  return (rules.categories || []).find((c) => c.id === id) || null;
}

export function minBase(rules) {
  const bases = (rules.categories || []).map((c) => Number(c.base)).filter((n) => n > 0);
  return bases.length ? Math.min(...bases) : 0;
}

export const isReserve = (p) => p?.pool === 'reserve';

export function basePrice(player, rules) {
  if (Number(player.basePrice)) return Number(player.basePrice);
  if (isReserve(player) && Number(rules.reserveBasePrice)) return Number(rules.reserveBasePrice);
  return Number(category(rules, player.category)?.base) || minBase(rules);
}

export function nextBid(live, rules) {
  const b = live?.bid;
  if (!b) return null;
  return b.team ? Number(b.amount) + increment(Number(b.amount), rules) : Number(b.amount);
}

/* ---------------- teams ---------------- */

export function teamSummary(a, teamId) {
  const { rules } = a;
  const players = Object.entries(a.sales)
    .filter(([, s]) => s.team === teamId)
    .map(([pid, s]) => {
      const p = a.players[pid] || { name: '(removed)' };
      return { ...p, id: pid, role: roleId(p.role), price: Number(s.price), retained: !!s.retained, reserve: isReserve(p) };
    });
  const main = players.filter((p) => !p.reserve);
  const spent = players.reduce((t, p) => t + p.price, 0);
  const count = main.length;
  const reserveCount = players.length - count;
  const remaining = Number(rules.purse) - spent;
  const byCat = {};
  const byRole = {};
  for (const p of main) {
    byCat[p.category] = (byCat[p.category] || 0) + 1;
    byRole[p.role] = (byRole[p.role] || 0) + 1;
  }
  const s = { players, main, spent, count, reserveCount, remaining, slots: Number(rules.maxSquad) - count, byCat, byRole };
  s.maxBid = looseMaxBid(s, rules);
  return s;
}

// Upper bound on any bid by this team, ignoring which player is up. Stored in the
// database so the security rules can reject over-purse bids from phones.
function looseMaxBid(s, rules) {
  const need = Math.max(0, Number(rules.minSquad) - s.count - 1);
  let max = Math.max(0, s.remaining - need * minBase(rules));
  if (Number(rules.maxPlayerPrice)) max = Math.min(max, Number(rules.maxPlayerPrice));
  return max;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The most `teamId` may pay for `player`, and why it can't be more.
// Applies squad size, reserve slots, category min/max, role minimums and the per-player cap.
export function bidLimit(a, teamId, player) {
  const { rules } = a;
  const s = teamSummary(a, teamId);
  const cap = Number(rules.maxPlayerPrice) || Infinity;
  const mainNeed = Math.max(0, Number(rules.minSquad) - s.count);

  if (isReserve(player)) {
    const slots = Number(rules.reservesPerTeam) || 0;
    if (s.reserveCount >= slots) return { max: 0, why: slots ? `Reserve slots full (${s.reserveCount} of ${slots}).` : 'This tournament has no reserve slots.' };
    const keep = mainNeed * minBase(rules);
    const max = Math.max(0, Math.min(cap, s.remaining - keep));
    return { max, why: keep ? `Keep ${money(keep, rules)} for ${plural(mainNeed, 'more player')}.` : '' };
  }

  if (s.slots <= 0) return { max: 0, why: `Squad full (${s.count} of ${rules.maxSquad}).` };
  const cat = category(rules, player?.category);
  if (cat && Number(cat.max) && (s.byCat[cat.id] || 0) >= Number(cat.max)) {
    return { max: 0, why: `${cat.label} limit reached (${s.byCat[cat.id]} of ${cat.max}).` };
  }

  // Slots and money still needed AFTER buying this player.
  const role = roleId(player?.role);
  const slotsAfter = Number(rules.maxSquad) - s.count - 1;
  const roleNeeds = Object.entries(rules.roleMin || {})
    .map(([r, min]) => [r, Math.max(0, Number(min) - (s.byRole[r] || 0) - (r === role ? 1 : 0))])
    .filter(([, n]) => n > 0);
  const catNeeds = (rules.categories || [])
    .map((c) => [c, Math.max(0, Number(c.min) - (s.byCat[c.id] || 0) - (c.id === cat?.id ? 1 : 0))])
    .filter(([, n]) => n > 0);
  const roleNeed = roleNeeds.reduce((t, [, n]) => t + n, 0);
  const catNeed = catNeeds.reduce((t, [, n]) => t + n, 0);
  if (Math.max(roleNeed, catNeed) > slotsAfter) {
    const list = [...roleNeeds.map(([r, n]) => `${n} ${ROLES[r].code}`), ...catNeeds.map(([c, n]) => `${n} ${c.label}`)].join(', ');
    return { max: 0, why: `Keep your last slots for ${list}.` };
  }
  const general = Math.max(0, Number(rules.minSquad) - s.count - 1, roleNeed);
  const catMoney = catNeeds.reduce((t, [c, n]) => t + n * Number(c.base), 0);
  const keep = Math.max(general * minBase(rules), catMoney + Math.max(0, general - catNeed) * minBase(rules));
  const max = Math.max(0, Math.min(cap, s.remaining - keep));
  let why = '';
  if (max === cap && cap < s.remaining - keep) why = `Max ${money(cap, rules)} per player in this tournament.`;
  else if (keep) why = `Keep ${money(keep, rules)} for ${plural(general, 'more player')}.`;
  return { max, why };
}

// Why a team can't bid `amount` right now, or null if it can.
export function bidBlocker(a, teamId, amount) {
  const live = a.live;
  if (!live || live.status !== 'bidding') return 'Bidding closed. Wait for the next player.';
  if (live.bid?.team === teamId) return 'You lead. Wait for another team to raise.';
  const { max, why } = bidLimit(a, teamId, a.players[live.playerId]);
  if (max <= 0) return why || 'Your team cannot bid.';
  if (amount > max) return `Over your max bid of ${money(max, a.rules)}. ${why}`.trim();
  return null;
}

/* ---------------- running order ---------------- */

// Players still to be auctioned in the current round.
export function pool(a) {
  const round = Number(a.meta.round) || 1;
  return Object.entries(a.players)
    .filter(([pid]) => !a.sales[pid] && !(a.unsold[pid] && Number(a.unsold[pid].round) >= round))
    .map(([id, p]) => ({ ...p, id }));
}

export function pickNext(a) {
  const { rules } = a;
  let candidates = pool(a);
  if (!candidates.length || rules.pickOrder === 'manual') return null;
  // Main players first; the reserve pool is auctioned last.
  if (candidates.some((p) => !isReserve(p))) candidates = candidates.filter((p) => !isReserve(p));
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

// Multi-path update that stores each team's spent / maxBid for the database rules.
export function capsUpdate(a) {
  const out = {};
  for (const id of Object.keys(a.teams)) {
    const t = teamSummary(a, id);
    out[`teams/${id}/spent`] = t.spent;
    out[`teams/${id}/maxBid`] = t.maxBid;
  }
  return out;
}

/* ---------------- misc ---------------- */

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return ((parts[0] || '').charAt(0) + (parts.length > 1 ? parts.at(-1).charAt(0) : '')).toUpperCase();
}

export function teamCode(t) {
  return (t?.short || initials(t?.name) || '?').toUpperCase().slice(0, 4);
}

// Google Drive "share" links don't render as images; convert to a thumbnail URL.
export function photoUrl(url) {
  if (!url) return '';
  const m = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w600` : url;
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
