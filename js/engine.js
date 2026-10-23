// Auction rules engine: pure functions over an auction snapshot.
// An auction snapshot looks like:
//   { meta, rules, teams: {id: team}, players: {id: player},
//     sales: {playerId: {team, price, at, round, allotted?, source?}}, unsold: {playerId: {round}},
//     live: {playerId, status, bid: {amount, team, at, until}}, log: {...} }
// Amounts are whole numbers in the base unit (virtual rupees, or points).

export const DEFAULT_RULES = {
  currency: '₹',
  purse: 1000,
  playersPerSide: 8, // players in a match
  squadSize: 10, // players each team MUST own, captain and vice-captain included (extra = reserves)
  overs: null,
  // Who is allotted to each team before the auction, and their value. The value is NOT taken from
  // the purse: it is the budget that comes back to the team in next season's mini auction if the
  // captain / vice-captain is unavailable.
  leaders: 'captain_vc', // 'captain' | 'captain_vc'
  captainPrice: 200,
  vcPrice: 150,
  // Who may bid from a phone for the team.
  bidders: 'captain_vc', // 'captain' | 'captain_vc'
  // Who sees each team's remaining purse and max bid.
  purseVisibility: 'own', // 'own' | 'bidders' | 'everyone'
  maxBidVisibility: '', // same choices; '' = like purseVisibility
  showCurrentBid: true, // false: the stage, members and audience don't see the current bid
  maxPlayerPrice: 0, // 0 = no cap
  // Pools (stored as `categories`): Pool A = the strongest players, then B, C... The admin puts
  // each player in a pool. min/max: per-team limits for the pool (0 = none).
  categories: [
    { id: 'A', label: 'Pool A', base: 50, min: 0, max: 0 },
    { id: 'B', label: 'Pool B', base: 50, min: 0, max: 0 },
    { id: 'C', label: 'Pool C', base: 50, min: 0, max: 0 },
  ],
  roleMin: { bat: 0, bowl: 0, ar: 0, wk: 0 },
  // While the current bid is below `upto`, the next bid goes up by `step`.
  // `upto: 0` means "and above".
  increments: [
    { upto: 200, step: 10 },
    { upto: 0, step: 25 },
  ],
  bidTimer: 30,
  pickOrder: 'category-random',
  unsoldRounds: 1,
  // 'both': captains bid from phones and the auctioneer can also record room bids.
  // 'room': paddles in the room only; the auctioneer records every bid or just the final amount.
  bidMode: 'both',
  commentary: true, // live commentary lines on the stage, phones and console
  commentaryLang: 'en', // 'en' | 'hi' (Hinglish) | 'mr' (Marathi); each device can switch
  humour: 'high', // 'high' = punchlines in the commentary, 'normal' = plain
  houseRules: [],
};

export const ROLES = {
  bat: { code: 'BAT', name: 'Batter' },
  bowl: { code: 'BOWL', name: 'Bowler' },
  ar: { code: 'AR', name: 'All-rounder' },
  wk: { code: 'WK', name: 'Wicket-keeper' },
};

export const LEADERS = {
  captain: 'Captain only',
  captain_vc: 'Captain and vice-captain',
};

export const BIDDERS = {
  captain: 'Only the captain bids',
  captain_vc: 'Captain and vice-captain can both bid',
};

export const PURSE_VISIBILITY = {
  own: 'Each captain / vice-captain sees only their own team (admins see all)',
  bidders: 'All captains and vice-captains see every team (admins see all)',
  everyone: 'Everyone, including the audience and the stage screen',
};

// How the next player is chosen. Random draws use the built-in logic below; 'manual' means chits
// drawn in the hall and searched by name. The control room offers both whatever is set here.
export const PICK_ORDERS = {
  'category-random': 'Random draw, pool by pool (all of Pool A first, then B, C…)',
  random: 'Random draw from all pools together',
  'category-sequence': 'Pool by pool, in player ID order',
  manual: 'Chits: draw a chit in the hall and search the player by name',
};

export const BID_MODES = {
  both: 'Captains bid from phones (auctioneer can also record room bids)',
  room: 'Verbal / paddles only: bids are called out in the hall and recorded on the laptop (phones watch)',
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
  // Older auctions had a min/max squad; the squad size is now one exact number.
  if (rules && rules.squadSize == null && rules.maxSquad != null) r.squadSize = rules.maxSquad;
  r.squadSize = Number(r.squadSize) || 1;
  r.minSquad = r.maxSquad = r.squadSize;
  if (r.leaders !== 'captain') r.leaders = 'captain_vc';
  if (r.bidders !== 'captain') r.bidders = 'captain_vc';
  if (r.leaders === 'captain') r.bidders = 'captain'; // no vice-captain, so only the captain can bid
  if (!PURSE_VISIBILITY[r.purseVisibility]) r.purseVisibility = 'own';
  r.roleMin = { ...DEFAULT_RULES.roleMin, ...(r.roleMin || {}) };
  r.categories = (r.categories || []).map((c) => ({ min: 0, max: 0, ...c }));
  r.houseRules = Array.isArray(r.houseRules) ? r.houseRules.filter((x) => x && x.a) : Object.values(r.houseRules || {});
  return r;
}

export const phoneBidding = (rules) => rules.bidMode !== 'room';
export const hasVC = (rules) => rules.leaders === 'captain_vc';
export const vcCanBid = (rules) => hasVC(rules) && rules.bidders === 'captain_vc';
export const reserves = (rules) => Math.max(0, Number(rules.squadSize) - (Number(rules.playersPerSide) || Number(rules.squadSize)));

// Can this viewer see `teamId`'s remaining purse and max bid?
// viewer: { role: 'admin' | 'captain' | 'vc' | 'member' | 'audience' | 'screen', team }
// Max bid has its own setting (maxBidVisibility); until it is set it follows the purse setting.
export function canSeeMaxBid(rules, viewer, teamId) {
  return canSeePurse({ ...rules, purseVisibility: rules.maxBidVisibility || rules.purseVisibility }, viewer, teamId);
}
// The current bid and who leads: admins and bidders always; the stage, members and audience unless
// the tournament hides it (showCurrentBid: false), e.g. a verbal auction that keeps the room guessing.
export function canSeeBid(rules, viewer) {
  const role = viewer?.role;
  return rules.showCurrentBid !== false || role === 'admin' || role === 'captain' || role === 'vc';
}

export function canSeePurse(rules, viewer, teamId) {
  const role = viewer?.role;
  if (role === 'admin' || rules.purseVisibility === 'everyone') return true;
  const bidder = role === 'captain' || role === 'vc';
  if (!bidder) return false;
  return rules.purseVisibility === 'bidders' || viewer.team === teamId;
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
    aicomm: a.aicomm || {}, // AI commentary lines, when the control room has AI commentary on
    history: a.history || {}, // past seasons of the tournament (js/history.js)
  };
}

/* ---------------- money ---------------- */

function trimNum(n, digits) {
  const s = n.toFixed(digits);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

// Same rules as the design system's formatPrice: ₹50, ₹4.2 L, ₹1.25 Cr · 2,400 pts · $250 K
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

// Captain / vice-captain allotted to a team before the auction.
export const isAllotted = (p) => !!(p && p.allottedTeam);
// The waiting list: registered, but not in the auction unless an organiser moves them in.
export const isWaiting = (p) => p?.list === 'waiting';
// Registration cancelled: kept on record, but out of the auction, the lists and the downloads.
export const isCancelled = (p) => p?.list === 'cancelled';
// Players who are auctioned: not a captain / vice-captain / kept player, not on the waiting list, not cancelled.
export const inAuction = (p) => !!p && !isAllotted(p) && !isWaiting(p) && !isCancelled(p);
// allottedAs: 'C' captain, 'VC' vice-captain, 'R' kept from last season (mini auction).
export const leaderLabel = (as) => (as === 'C' ? 'Captain' : as === 'VC' ? 'Vice-captain' : as === 'R' ? 'Retained' : 'Allotted');

export function allottedPrice(p, rules) {
  if (p.allottedPrice != null && p.allottedPrice !== '') return Number(p.allottedPrice);
  if (p.allottedAs === 'C') return Number(rules.captainPrice) || 0;
  if (p.allottedAs === 'VC') return Number(rules.vcPrice) || 0;
  return 0;
}

export function basePrice(player, rules) {
  if (Number(player.basePrice)) return Number(player.basePrice);
  return Number(category(rules, player.category)?.base) || minBase(rules);
}

export function nextBid(live, rules) {
  const b = live?.bid;
  if (!b) return null;
  return b.team ? Number(b.amount) + increment(Number(b.amount), rules) : Number(b.amount);
}

/* ---------------- teams ---------------- */

// A team's budget: its own (a mini auction carries over each team's balance) or the standard purse.
export function teamPurse(a, teamId) {
  const own = a.teams[teamId]?.purse;
  return own != null && own !== '' ? Number(own) : Number(a.rules.purse);
}

export function teamSummary(a, teamId) {
  const { rules } = a;
  const purse = teamPurse(a, teamId);
  const players = Object.entries(a.sales)
    .filter(([, s]) => s.team === teamId)
    .map(([pid, s]) => {
      const p = a.players[pid] || { name: '(removed)' };
      return { ...p, id: pid, role: roleId(p.role), price: Number(s.price), allotted: !!(s.allotted || s.retained), as: p.allottedAs || null };
    });
  // The purse pays only for auctioned players; captain / VC values are recorded separately.
  const spent = players.filter((p) => !p.allotted).reduce((t, p) => t + p.price, 0);
  const allottedValue = players.filter((p) => p.allotted).reduce((t, p) => t + p.price, 0);
  const count = players.length;
  const remaining = purse - spent;
  const byCat = {};
  const byRole = {};
  for (const p of players) {
    byCat[p.category] = (byCat[p.category] || 0) + 1;
    byRole[p.role] = (byRole[p.role] || 0) + 1;
  }
  const toBuy = Math.max(0, Number(rules.squadSize) - count);
  const s = { players, purse, spent, allottedValue, squadValue: spent + allottedValue, count, toBuy, remaining, slots: toBuy, byCat, byRole };
  s.maxBid = looseMaxBid(s, rules);
  return s;
}

// max bid = purse left − (players still to buy − 1) × base price, never above the purse left.
// Stored in the database so the security rules can reject over-purse bids from phones.
function looseMaxBid(s, rules) {
  if (s.toBuy <= 0) return 0;
  let max = Math.max(0, Math.min(s.remaining, s.remaining - (s.toBuy - 1) * minBase(rules)));
  if (Number(rules.maxPlayerPrice)) max = Math.min(max, Number(rules.maxPlayerPrice));
  return max;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The most `teamId` may pay for `player`, and why it can't be more.
// Applies the squad size, category min/max, role minimums and the per-player cap.
export function bidLimit(a, teamId, player) {
  const { rules } = a;
  const s = teamSummary(a, teamId);
  const cap = Number(rules.maxPlayerPrice) || Infinity;

  if (s.toBuy <= 0) return { max: 0, why: `Squad complete (${s.count} of ${rules.squadSize}).` };
  const cat = category(rules, player?.category);
  if (cat && Number(cat.max) && (s.byCat[cat.id] || 0) >= Number(cat.max)) {
    return { max: 0, why: `${cat.label} limit reached (${s.byCat[cat.id]} of ${cat.max}).` };
  }

  // Slots and money still needed AFTER buying this player.
  const role = roleId(player?.role);
  const slotsAfter = s.toBuy - 1;
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
  const catMoney = catNeeds.reduce((t, [c, n]) => t + n * Number(c.base), 0);
  const keep = Math.max(slotsAfter * minBase(rules), catMoney + Math.max(0, slotsAfter - catNeed) * minBase(rules));
  const max = Math.max(0, Math.min(cap, s.remaining, s.remaining - keep));
  let why = '';
  if (max === cap && cap < s.remaining - keep) why = `Max ${money(cap, rules)} per player in this tournament.`;
  else if (keep) why = `Keep ${money(keep, rules)} for ${plural(slotsAfter, 'more player')}.`;
  return { max, why, keep, slotsAfter, remaining: s.remaining };
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

// Players still to be auctioned in the current round (allotted captains / VCs never come up).
export function pool(a) {
  const round = Number(a.meta.round) || 1;
  return Object.entries(a.players)
    .filter(([pid, p]) => inAuction(p) && !a.sales[pid] && !(a.unsold[pid] && Number(a.unsold[pid].round) >= round))
    .map(([id, p]) => ({ ...p, id }));
}

// Players left in the current round, grouped for the control room ("Pool A 3 · Pool B 10").
export function poolCounts(a) {
  const left = pool(a);
  return (a.rules.categories || []).map((c) => ({ ...c, left: left.filter((p) => p.category === c.id).length }));
}

// Search players by name, by number (P024, 24) or both ("24 arjun"). Best matches first.
export function searchPlayers(list, q, limit = 8) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return [];
  const bare = (x) => x.replace(/^p0*/, '');
  const isNum = (w) => /^p?\d+$/.test(w);
  const nums = s.split(/\s+/).filter(isNum);
  const words = s.split(/\s+/).filter((w) => !isNum(w));
  const text = words.join(' ');
  return list
    .map((p) => {
      const name = String(p.name || '').toLowerCase();
      const id = String(p.id).toLowerCase();
      if (id === s) return [p, 0];
      if (nums.length && !nums.some((n) => bare(id) === bare(n))) {
        // Not that number: still try the whole query as a name or an ID ("P0" prefix and so on).
        if (!words.length && id.startsWith(s)) return [p, 4];
        return null;
      }
      if (!words.length) return [p, 0];
      if (name.startsWith(text)) return [p, 1];
      if (words.every((w) => name.split(/\s+/).some((n) => n.startsWith(w)))) return [p, 2];
      if (name.includes(text)) return [p, 3];
      return null;
    })
    .filter(Boolean)
    .sort((x, y) => x[1] - y[1] || String(x[0].name).localeCompare(y[0].name))
    .slice(0, limit)
    .map(([p]) => p);
}

// Search the players left in this round (for chits).
export const searchPool = (a, q, limit = 8) => searchPlayers(pool(a), q, limit);

// Random draw. Without filters it follows the tournament's order (pool by pool, Pool A first);
// `filter.pool` / `filter.role` draw at random from one pool and/or one role instead.
export function pickNext(a, filter = {}) {
  const { rules } = a;
  let candidates = pool(a);
  if (filter.pool) candidates = candidates.filter((p) => p.category === filter.pool);
  if (filter.role) candidates = candidates.filter((p) => roleId(p.role) === filter.role);
  if (!candidates.length) return null;
  // Unsold rounds: the unsold players come back in the order they first came up.
  if ((Number(a.meta.round) || 1) > 1 && !filter.pool && !filter.role) {
    const firstAt = (p) => Number(a.unsold[p.id]?.first ?? a.unsold[p.id]?.at) || 0;
    const back = candidates.filter((p) => a.unsold[p.id]).sort((x, y) => firstAt(x) - firstAt(y));
    if (back.length) return back[0];
  }
  const rnd = (list) => list[Math.floor(Math.random() * list.length)];
  if (filter.pool || rules.pickOrder === 'random') return rnd(candidates);
  const order = (rules.categories || []).map((c) => c.id);
  const rank = (p) => { const i = order.indexOf(p.category); return i < 0 ? order.length : i; };
  const best = Math.min(...candidates.map(rank));
  const group = candidates.filter((p) => rank(p) === best);
  if (rules.pickOrder === 'category-sequence') {
    return group.sort((x, y) => String(x.id).localeCompare(String(y.id), undefined, { numeric: true }))[0];
  }
  return rnd(group);
}

// Next season's mini auction: a team keeps `keepIds`; everyone else is released and their value
// (captain / VC value, or the price paid) goes back into the team's budget with its remaining purse.
export function miniBudget(a, teamId, keepIds) {
  const s = teamSummary(a, teamId);
  const kept = s.players.filter((p) => keepIds.has(p.id));
  const released = s.players.filter((p) => !keepIds.has(p.id));
  const releasedValue = released.reduce((t, p) => t + p.price, 0);
  return { remaining: s.remaining, releasedValue, budget: s.remaining + releasedValue, kept, released };
}

// True when teams have their own budgets (mini auction) instead of one shared purse.
export const variedBudgets = (a) => Object.values(a.teams).some((t) => t.purse != null && t.purse !== '');

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

// Captain and vice-captain of each team, from the players list.
export function leadersOf(a, teamId) {
  const out = {};
  for (const [id, p] of Object.entries(a.players)) {
    if (p.allottedTeam === teamId && (p.allottedAs === 'C' || p.allottedAs === 'VC')) out[p.allottedAs] = { ...p, id };
  }
  return out;
}

// Captain and vice-captain names typed in the teams template (team.captainName / team.vcName)
// make those players the team's leaders. A name matches a player exactly, or uniquely by all its
// words ("Kiran" → "Kiran Patil"). A name with no player adds one (autoLeader), so captains need
// not be in the players file. Whoever held the seat before goes back into the auction pool.
// Returns { updates, warnings }: paths under the auction for db.update.
export function linkLeaders(a) {
  const warnings = [];
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const words = (s) => norm(s).split(' ').filter(Boolean);
  const players = Object.fromEntries(Object.entries(a.players).map(([id, p]) => [id, { ...p }]));
  const removed = new Set();
  const lastPool = a.rules.categories.at(-1)?.id || null;
  const seated = new Map(); // pid -> "team/as" given in this pass
  let n = Object.keys(players).length;
  const newId = () => { let id; do { n++; id = 'P' + String(n).padStart(3, '0'); } while (players[id]); return id; };
  for (const [tid, t] of Object.entries(a.teams)) {
    for (const [as, name] of [['C', t.captainName], ['VC', t.vcName]]) {
      if (!name || !String(name).trim()) continue;
      const label = `${t.name}: ${as === 'C' ? 'captain' : 'vice-captain'} ${name}`;
      if (as === 'VC' && a.rules.leaders === 'captain') { warnings.push(`${label} ignored: this tournament has captains only`); continue; }
      const live = Object.entries(players).filter(([id]) => !removed.has(id));
      let found = live.filter(([, p]) => norm(p.name) === norm(name));
      if (!found.length) {
        const want = words(name);
        found = live.filter(([, p]) => want.every((w) => words(p.name).includes(w)));
        if (found.length === 1) warnings.push(`${label}: matched to ${found[0][1].name}`);
        if (found.length > 1) { warnings.push(`${label}: several players match (${found.map(([, p]) => p.name).join(', ')}); write the full name`); continue; }
      }
      // Prefer a real player over a placeholder made earlier; drop duplicate placeholders.
      found.sort(([, x], [, y]) => Number(!!x.autoLeader) - Number(!!y.autoLeader));
      let pid = found[0]?.[0];
      for (const [id, p] of found.slice(1)) if (p.autoLeader) removed.add(id);
      if (!pid) {
        pid = newId();
        players[pid] = { name: String(name).trim(), role: 'ar', category: lastPool, autoLeader: true };
      }
      const p = players[pid];
      if (seated.has(pid)) { warnings.push(`${label}: ${p.name} is already ${seated.get(pid)}`); continue; }
      if (p.allottedTeam && (p.allottedTeam !== tid || p.allottedAs !== as) && !p.autoLeader) warnings.push(`${label}: moved from ${a.teams[p.allottedTeam]?.name || p.allottedTeam} ${p.allottedAs}`);
      // Anyone else in this seat goes back into the pool (a placeholder is removed).
      for (const [id, q] of Object.entries(players)) {
        if (id !== pid && q.allottedTeam === tid && q.allottedAs === as) {
          if (q.autoLeader) removed.add(id); else { q.allottedTeam = null; q.allottedAs = null; }
        }
      }
      p.allottedTeam = tid; p.allottedAs = as;
      seated.set(pid, `${t.name} ${as}`);
    }
  }
  const updates = {};
  for (const [id, p] of Object.entries(players)) {
    if (removed.has(id)) { if (a.players[id]) updates[`players/${id}`] = null; continue; }
    const old = a.players[id];
    if (!old) { updates[`players/${id}`] = p; continue; }
    if ((old.allottedTeam || null) !== (p.allottedTeam || null)) updates[`players/${id}/allottedTeam`] = p.allottedTeam || null;
    if ((old.allottedAs || null) !== (p.allottedAs || null)) updates[`players/${id}/allottedAs`] = p.allottedAs || null;
  }
  return { updates, warnings };
}

// Keep each team's captain / vice-captain names in step with who is actually allotted.
export function leaderNamesUpdate(a) {
  const updates = {};
  for (const [tid, t] of Object.entries(a.teams)) {
    const l = leadersOf(a, tid);
    if ((t.captainName || null) !== (l.C?.name || null)) updates[`teams/${tid}/captainName`] = l.C?.name || null;
    if ((t.vcName || null) !== (l.VC?.name || null)) updates[`teams/${tid}/vcName`] = l.VC?.name || null;
  }
  return updates;
}

/* ---------------- who can see an auction ---------------- */

// private: only admins (while setting up); link: anyone with the link or code;
// listed: also shown on the home page. Older auctions have no setting and are "link".
export const VISIBILITY = {
  private: 'Private: only admins (setting up)',
  link: 'Anyone with the link or code',
  listed: 'Listed on the home page',
};
export const visibilityOf = (meta) => (VISIBILITY[meta?.visibility] ? meta.visibility : 'link');

/* ---------------- batting and bowling ---------------- */

export const BOWLING_TYPES = ['Fast', 'Medium-fast', 'Medium', 'Off-spin', 'Leg-spin', 'Spin'];

// "Right", "R", "RHB", "Right-hand bat", "Left-arm spin"… → 'R' / 'L'
export function parseHand(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return null;
  if (/^(l|lh|lhb|la|lf|lm|ls)$/.test(s) || /\bleft/.test(s)) return 'L';
  if (/^(r|rh|rhb|ra|rf|rm)$/.test(s) || /\bright/.test(s)) return 'R';
  return null;
}

// "fast", "RM", "off spin", "leg-spin", "chinaman"… → one of BOWLING_TYPES (other text kept as written)
export function parseBowlingType(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || /^(none|no|nil|-|na|n\/a|does ?n.?t bowl)$/.test(s)) return null;
  if (/^(rf|lf)$/.test(s)) return 'Fast';
  if (/^(rm|lm)$/.test(s)) return 'Medium';
  if (/^(ls)$/.test(s)) return 'Spin';
  if (/medium[- ]?fast|fast[- ]?medium/.test(s)) return 'Medium-fast';
  if (/fast|pace|quick/.test(s)) return 'Fast';
  if (/medium/.test(s)) return 'Medium';
  if (/off/.test(s)) return 'Off-spin';
  if (/leg|wrist|chinaman/.test(s)) return 'Leg-spin';
  if (/spin|slow|orthodox/.test(s)) return 'Spin';
  if (/^(right|left|r|l)([- ]arm)?$/.test(s)) return null; // only the arm was written
  return String(v).trim();
}

// Older player lists had free-text batting_style / bowling_style; read those too.
export const battingHandOf = (p) => p.battingHand || parseHand(p.battingStyle);
export const bowlingArmOf = (p) => p.bowlingArm || (p.bowlingStyle && /\b(left|right)/i.test(p.bowlingStyle) ? parseHand(p.bowlingStyle) : null);
export const bowlingTypeOf = (p) => p.bowlingType || parseBowlingType(p.bowlingStyle);

export function battingLabel(p) {
  const h = battingHandOf(p);
  return h ? `${h === 'L' ? 'Left' : 'Right'}-hand bat` : '';
}

export function bowlingLabel(p) {
  const arm = bowlingArmOf(p);
  const type = bowlingTypeOf(p);
  const side = arm ? `${arm === 'L' ? 'Left' : 'Right'}-arm` : '';
  if (side && type) return `${side} ${type.toLowerCase()}`;
  return type || (side ? `${side} bowler` : '');
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
