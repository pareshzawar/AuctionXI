// CSV parsing / writing, the player + team templates, and the tournament setup
// questionnaire (rules + house rules as a fill-in CSV).

import { ROLES, roleId, withDefaults, DEFAULT_RULES, PICK_ORDERS } from './engine.js';

export const PLAYER_COLUMNS = [
  'id', 'name', 'role', 'category', 'pool', 'base_price', 'batting_style', 'bowling_style', 'age',
  'locality', 'photo_url', 'matches', 'runs', 'wickets', 'notes', 'retained_by', 'retained_price',
];

export const TEAM_COLUMNS = ['id', 'name', 'short_name', 'color', 'owner', 'captain', 'logo_url'];

const PLAYER_EXAMPLE = [
  ['P001', 'Rohan Patil', 'All-rounder', 'A', 'main', '', 'Right-hand bat', 'Right-arm medium', '28', 'Wing A - 302', '', '12', '340', '9', 'Opening bat', '', ''],
  ['P002', 'Amit Shah', 'Wicket-keeper', 'B', 'main', '600000', 'Left-hand bat', '', '34', 'Wing C - 105', '', '8', '150', '0', '', '', ''],
  ['P003', 'Vikram Rao', 'Bowler', 'C', 'main', '', 'Right-hand bat', 'Left-arm spin', '22', 'Wing B - 410', '', '', '', '', 'Captain of Tigers', 'T1', '0'],
  ['P004', 'Nikhil Joshi', 'Batter', 'D', 'reserve', '', 'Right-hand bat', '', '41', 'Wing D - 201', '', '', '', '', 'Available on weekends only', '', ''],
];

const TEAM_EXAMPLE = [
  ['T1', 'Wing A Tigers', 'TIG', '#4f9dff', 'Mr. Kulkarni', 'Vikram Rao', ''],
  ['T2', 'Wing B Warriors', 'WAR', '#ff8a3d', 'Mrs. Desai', 'Sanjay Mehta', ''],
];

// Design-system default team colours (team-1 … team-8, night theme).
export const TEAM_COLORS = ['#4f9dff', '#ff8a3d', '#2ec4a6', '#ee6aa0', '#ad92ff', '#e0cb4f', '#78c95a', '#e8776a'];

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Starts with a byte-order mark so Excel reads ₹ and other non-ASCII text correctly.
export function toCSV(header, rows) {
  return '\uFEFF' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const playerTemplate = () => toCSV(PLAYER_COLUMNS, PLAYER_EXAMPLE);
export const teamTemplate = () => toCSV(TEAM_COLUMNS, TEAM_EXAMPLE);

// Numbers may be written as 500000, 5,00,000, 5L, 5 lakh, 1.5Cr, 2k.
export function num(v) {
  if (v === '' || v == null) return null;
  const s = String(v).toLowerCase().replace(/[₹,\s]/g, '').replace(/rs\.?|inr/g, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?)(cr|crore|crores|l|lac|lakh|lakhs|k)?$/);
  if (!m) return null;
  const mult = { cr: 1e7, crore: 1e7, crores: 1e7, l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5, k: 1e3 }[m[2]] || 1;
  return Math.round(Number(m[1]) * mult);
}

// Returns { players: {id: player}, warnings: [string] }
export function importPlayers(rows, rules, existingIds = []) {
  const warnings = [];
  const players = {};
  const catIds = (rules.categories || []).map((c) => c.id);
  const used = new Set(existingIds);
  let n = existingIds.length;
  let reserves = 0;
  rows.forEach((r, i) => {
    const line = i + 2;
    if (!r.name) { warnings.push(`Row ${line}: skipped (no name)`); return; }
    let id = String(r.id || '').trim().replace(/[.#$/[\]]/g, '');
    if (!id || used.has(id)) {
      if (id) warnings.push(`Row ${line}: duplicate id "${id}", assigned a new one`);
      do { id = 'P' + String(++n).padStart(3, '0'); } while (used.has(id));
    }
    used.add(id);
    let cat = String(r.category || '').trim();
    const byLabel = (rules.categories || []).find((c) => c.label.toLowerCase() === cat.toLowerCase());
    if (byLabel) cat = byLabel.id;
    if (!catIds.includes(cat)) {
      if (cat) warnings.push(`Row ${line}: unknown category "${cat}" for ${r.name}, set to ${catIds.at(-1)}`);
      cat = catIds.at(-1) || '';
    }
    const pool = /^res/i.test(r.pool || '') ? 'reserve' : 'main';
    if (pool === 'reserve') reserves++;
    for (const f of ['base_price', 'retained_price']) {
      if (r[f] && num(r[f]) == null) warnings.push(`Row ${line}: ${f} "${r[f]}" is not a number, ignored`);
    }
    players[id] = {
      name: r.name,
      role: roleId(r.role),
      category: cat,
      pool,
      basePrice: num(r.base_price),
      battingStyle: r.batting_style || null,
      bowlingStyle: r.bowling_style || null,
      age: num(r.age),
      locality: r.locality || null,
      photoUrl: r.photo_url || null,
      matches: num(r.matches),
      runs: num(r.runs),
      wickets: num(r.wickets),
      notes: r.notes || null,
      retainedBy: r.retained_by || null,
      retainedPrice: num(r.retained_price),
    };
  });
  if (reserves && !Number(rules.reservesPerTeam)) {
    warnings.push(`${reserves} reserve players found but "Reserves per team" is 0 - set it in Setup or teams cannot buy them`);
  }
  return { players, warnings };
}

export function importTeams(rows) {
  const warnings = [];
  const teams = {};
  rows.forEach((r, i) => {
    if (!r.name) { warnings.push(`Row ${i + 2}: skipped (no name)`); return; }
    let id = String(r.id || '').trim().replace(/[.#$/[\]]/g, '') || 'T' + (i + 1);
    if (teams[id]) { warnings.push(`Row ${i + 2}: duplicate id "${id}"`); id = id + '_' + (i + 1); }
    teams[id] = {
      name: r.name,
      short: (r.short_name || r.name.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase(),
      color: /^#[0-9a-f]{3,8}$/i.test(r.color) ? r.color : TEAM_COLORS[Object.keys(teams).length % TEAM_COLORS.length],
      owner: r.owner || null,
      captain: r.captain || null,
      logoUrl: r.logo_url || null,
    };
  });
  return { teams, warnings };
}

export function playersToCSV(players) {
  return toCSV(PLAYER_COLUMNS, Object.entries(players).map(([id, p]) => [
    id, p.name, ROLES[roleId(p.role)].name, p.category, p.pool || 'main', p.basePrice, p.battingStyle, p.bowlingStyle,
    p.age, p.locality, p.photoUrl, p.matches, p.runs, p.wickets, p.notes, p.retainedBy, p.retainedPrice,
  ]));
}

/* ---------------- tournament setup questionnaire ---------------- */

export const SETUP_COLUMNS = ['section', 'key', 'question', 'answer', 'help'];
const MAX_CATEGORIES = 6;
const MAX_INCREMENTS = 4;

// House-rule questions every organiser should answer. Answers are shown to everyone
// on the live page; where the app can enforce a rule, the help text says which setting does it.
export const HOUSE_RULE_QUESTIONS = [
  ['hr_eligibility', 'Who can register to play?', 'e.g. Residents of the society only, age 16+, max 2 guest players per team'],
  ['hr_captains', 'How are captains / owners chosen, and do they cost purse?', 'e.g. Captains chosen by committee, retained at ₹0. Set retained_by in the players CSV'],
  ['hr_special_players', 'Any players every team must have?', 'e.g. At least 1 junior (under 16) and 1 senior (45+). Enforce with a category min_per_team'],
  ['hr_locality', 'Any limit on players from the same wing / tower / family?', 'e.g. Max 4 players from the same wing per team (checked by the auctioneer)'],
  ['hr_reserves', 'When and how are reserve players used?', 'e.g. Reserves play only if a squad player is absent; must be informed 1 day before'],
  ['hr_unsold_end', 'What happens to players still unsold at the end?', 'e.g. Lottery to teams short of players, at base price'],
  ['hr_absent', 'What if a bought player drops out before the tournament?', 'e.g. Team picks a replacement from the unsold/reserve list at base price'],
  ['hr_trades', 'Are trades between teams allowed after the auction?', 'e.g. No trades'],
  ['hr_conduct', 'Bidding conduct', 'e.g. Bids only via the app or paddle; no bids after the hammer; no proxy bidding'],
  ['hr_disputes', 'Who settles disputes during the auction?', "e.g. The auctioneer's decision is final"],
  ['hr_other_1', 'Other rule', ''],
  ['hr_other_2', 'Other rule', ''],
  ['hr_other_3', 'Other rule', ''],
];

const ROLE_KEYS = { bat: 'min_batters', bowl: 'min_bowlers', ar: 'min_allrounders', wk: 'min_wicketkeepers' };

// [section, key, question, help, get(meta, rules), set(meta, rules, value, warn)]
function setupFields() {
  const f = [];
  const text = (section, key, q, help, path) => f.push([section, key, q, help,
    (m, r) => (path[0] === 'meta' ? m : r)[path[1]] ?? '',
    (m, r, v) => { (path[0] === 'meta' ? m : r)[path[1]] = v || null; }]);
  const number = (section, key, q, help, prop, { required = false } = {}) => f.push([section, key, q, help,
    (m, r) => r[prop] ?? '',
    (m, r, v, warn) => {
      if (v === '') { if (!required) r[prop] = 0; return; }
      const n = num(v);
      if (n == null || n < 0) warn(`${key}: "${v}" is not a number, kept ${r[prop]}`);
      else r[prop] = n;
    }]);

  text('Tournament', 'auction_name', 'Auction name', 'Shown on every screen', ['meta', 'name']);
  text('Tournament', 'tournament_name', 'Tournament name', 'e.g. Society Premier League', ['meta', 'tournament']);
  text('Tournament', 'venue', 'Venue', 'e.g. Clubhouse hall', ['meta', 'venue']);
  text('Tournament', 'date', 'Auction date (YYYY-MM-DD)', 'e.g. 2026-11-15', ['meta', 'date']);
  text('Tournament', 'organiser', 'Organiser', 'e.g. Sports committee', ['meta', 'organiser']);
  number('Tournament', 'players_per_side', 'Players per side in a match', 'e.g. 11, 8 or 6 (box cricket)', 'playersPerSide');
  number('Tournament', 'overs', 'Overs per innings', 'Information only', 'overs');

  f.push(['Money', 'currency', 'Currency', '₹ for virtual rupees (shown as ₹5 L, ₹1.2 Cr), or pts for points', (m, r) => r.currency, (m, r, v) => { r.currency = v || '₹'; }]);
  number('Money', 'purse_per_team', 'Purse per team', 'Amounts can be written 10000000, 1Cr, 100L or 1,00,00,000', 'purse', { required: true });
  number('Money', 'max_price_per_player', 'Highest price allowed for one player (blank = no cap)', 'e.g. 30L', 'maxPlayerPrice');

  number('Squad', 'min_squad', 'Minimum players each team must buy (not counting reserves)', 'Usually players per side, e.g. 11. Retained players count', 'minSquad', { required: true });
  number('Squad', 'max_squad', 'Maximum players per team (not counting reserves)', 'e.g. 13-15', 'maxSquad', { required: true });
  number('Squad', 'reserves_per_team', 'Reserve players each team may buy (0 = none)', 'Reserve players are marked pool=reserve in the players CSV and are auctioned after everyone else', 'reservesPerTeam');
  number('Squad', 'reserve_base_price', 'Base price for reserve players (blank = their category base)', 'e.g. 50000', 'reserveBasePrice');
  number('Squad', 'retained_price_default', 'Price charged for a retained player when the CSV leaves retained_price blank', 'e.g. 0, or 10L', 'retainedPriceDefault');

  for (let i = 1; i <= MAX_CATEGORIES; i++) {
    const c = (r) => r.categories[i - 1] || {};
    const ensure = (r) => (r.categories[i - 1] ||= { id: '', label: '', base: 0, min: 0, max: 0 });
    const ex = DEFAULT_RULES.categories[i - 1];
    f.push(['Categories', `category_${i}_id`, `Category ${i}: short ID used in the players CSV`, i === 1 ? 'e.g. A. Leave the whole category blank if not needed. Categories come up in this order' : ex ? `e.g. ${ex.id}` : '',
      (m, r) => c(r).id ?? '', (m, r, v) => { if (v) ensure(r).id = v.replace(/[.#$/[\]\s]/g, ''); }]);
    f.push(['Categories', `category_${i}_name`, `Category ${i}: name`, ex ? `e.g. ${ex.label}` : 'e.g. Juniors',
      (m, r) => c(r).label ?? '', (m, r, v) => { if (v) ensure(r).label = v; }]);
    f.push(['Categories', `category_${i}_base_price`, `Category ${i}: base (starting) price`, ex ? `e.g. ${ex.base / 1e5}L` : 'e.g. 50000',
      (m, r) => c(r).base ?? '', (m, r, v, warn) => { if (v) { const n = num(v); if (n == null) warn(`category_${i}_base_price: "${v}" is not a number`); else ensure(r).base = n; } }]);
    f.push(['Categories', `category_${i}_min_per_team`, `Category ${i}: each team must buy at least (blank = no rule)`, 'e.g. 1 junior per team', (m, r) => c(r).min || '',
      (m, r, v) => { if (v) ensure(r).min = num(v) || 0; }]);
    f.push(['Categories', `category_${i}_max_per_team`, `Category ${i}: each team may buy at most (blank = no limit)`, 'e.g. max 2 icon players per team', (m, r) => c(r).max || '',
      (m, r, v) => { if (v) ensure(r).max = num(v) || 0; }]);
  }

  for (const [role, key] of Object.entries(ROLE_KEYS)) {
    f.push(['Roles', key, `Each team must have at least this many ${ROLES[role].name.toLowerCase()}s (blank = no rule)`, role === 'wk' ? 'e.g. 1' : '',
      (m, r) => r.roleMin[role] || '', (m, r, v) => { r.roleMin[role] = num(v) || 0; }]);
  }

  for (let i = 1; i <= MAX_INCREMENTS; i++) {
    const s = (r) => r.increments[i - 1] || {};
    const ensure = (r) => (r.increments[i - 1] ||= { upto: 0, step: 0 });
    f.push(['Bid increments', `increment_${i}_below`, `Slab ${i}: while the bid is below`, i === 1 ? 'e.g. 20L. Leave blank on the last slab to mean "and above"' : '',
      (m, r) => s(r).upto || '', (m, r, v) => { if (v || s(r).step) ensure(r).upto = num(v) || 0; }]);
    f.push(['Bid increments', `increment_${i}_raise_by`, `Slab ${i}: raise each bid by`, i === 1 ? 'e.g. 50000' : '',
      (m, r) => s(r).step || '', (m, r, v) => { if (v) ensure(r).step = num(v) || 0; }]);
  }

  f.push(['Bidding', 'bid_mode', 'How do captains bid? (phones / room)', 'phones = captains tap BID on their phones, auctioneer can still enter room bids. room = paddles only, auctioneer enters the final amount',
    (m, r) => (r.bidMode === 'room' ? 'room' : 'phones'), (m, r, v) => { r.bidMode = /room|paddle/i.test(v) ? 'room' : 'both'; }]);
  number('Bidding', 'bid_timer_seconds', 'Countdown after each bid, in seconds (0 = off)', 'e.g. 30', 'bidTimer');
  f.push(['Bidding', 'pick_order', `Order players come up (${Object.keys(PICK_ORDERS).join(' / ')})`, 'category-random is most common',
    (m, r) => r.pickOrder, (m, r, v, warn) => { if (PICK_ORDERS[v]) r.pickOrder = v; else if (v) warn(`pick_order: "${v}" not recognised, kept ${r.pickOrder}`); }]);
  number('Bidding', 'unsold_rounds', 'How many times unsold players come back for another round', 'e.g. 1', 'unsoldRounds');

  for (const [key, q, help] of HOUSE_RULE_QUESTIONS) {
    f.push(['House rules', key, q, help,
      (m, r) => (r.houseRules.find((h) => h.key === key) || {}).a || '',
      (m, r, v) => {
        r.houseRules = r.houseRules.filter((h) => h.key !== key);
        if (v) r.houseRules.push({ key, q: key.startsWith('hr_other') ? '' : q, a: v });
      }]);
  }
  return f;
}

export function setupToCSV(meta, rules) {
  const r = withDefaults(rules);
  return toCSV(SETUP_COLUMNS, setupFields().map(([section, key, q, help, get]) => [section, key, q, get(meta || {}, r), help]));
}

// Returns { meta, rules, warnings }. Only keys present in the file are applied.
export function importSetup(rows, meta, rules) {
  const warnings = [];
  const warn = (w) => warnings.push(w);
  const m = { ...(meta || {}) };
  const r = withDefaults(JSON.parse(JSON.stringify(rules || {})));
  const answers = new Map(rows.filter((x) => x.key).map((x) => [x.key.trim(), (x.answer ?? '').trim()]));
  if (!answers.size) throw new Error('No answers found. Keep the header row: section,key,question,answer,help');
  const known = new Set();
  // Categories and increments are rebuilt from the file when it has them.
  if ([...answers.keys()].some((k) => /^category_\d+_/.test(k))) r.categories = [];
  if ([...answers.keys()].some((k) => /^increment_\d+_/.test(k))) r.increments = [];
  for (const [, key, , , , set] of setupFields()) {
    known.add(key);
    if (answers.has(key)) set(m, r, answers.get(key), warn);
  }
  for (const k of answers.keys()) if (!known.has(k)) warn(`Unknown key "${k}" ignored`);

  r.categories = r.categories.filter((c) => c && c.id).map((c) => ({ ...c, label: c.label || c.id, base: c.base || 0 }));
  if (!r.categories.length) { warn('No categories given - kept the defaults'); r.categories = withDefaults(rules).categories; }
  r.increments = r.increments.filter((s) => s && s.step > 0).sort((x, y) => (x.upto || Infinity) - (y.upto || Infinity));
  if (!r.increments.length) { warn('No bid increments given - kept the defaults'); r.increments = withDefaults(rules).increments; }
  if (r.minSquad > r.maxSquad) warn(`min_squad (${r.minSquad}) is larger than max_squad (${r.maxSquad})`);
  const catMin = r.categories.reduce((t, c) => t + (Number(c.min) || 0), 0);
  const roleMin = Object.values(r.roleMin).reduce((t, n) => t + (Number(n) || 0), 0);
  if (Math.max(catMin, roleMin) > r.maxSquad) warn('Category or role minimums add up to more than max_squad');
  return { meta: m, rules: r, warnings };
}
