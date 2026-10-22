// CSV parsing / writing, the player + team templates, and the tournament setup
// questionnaire (rules + house rules as a fill-in CSV).

import { ROLES, roleId, withDefaults, DEFAULT_RULES, PICK_ORDERS, PURSE_VISIBILITY, parseHand, parseBowlingType, battingHandOf, bowlingArmOf, bowlingTypeOf } from './engine.js';

// allotted_team + allotted_as (C or VC): the captain / vice-captain given to a team before
// the auction, at the captain / vice-captain price from the setup. Everyone else is auctioned.
// batting_hand: Right / Left. bowling_arm: Right / Left (blank = does not bowl).
// bowling_type: Fast, Medium-fast, Medium, Off-spin, Leg-spin or Spin.
export const PLAYER_COLUMNS = [
  'id', 'name', 'role', 'pool', 'base_price', 'batting_hand', 'bowling_arm', 'bowling_type', 'age',
  'locality', 'photo_url', 'matches', 'runs', 'wickets', 'notes', 'allotted_team', 'allotted_as',
];

// Only `name` is required. captain / vice_captain: player names; they become the team's leaders
// (added to the player list if they are not in the players file).
export const TEAM_COLUMNS = ['id', 'name', 'short_name', 'color', 'captain', 'vice_captain', 'owner', 'logo_url'];

const PLAYER_EXAMPLE = [
  ['P001', 'Vikram Rao', 'All-rounder', 'A', '', 'Right', 'Left', 'Spin', '32', 'Wing A - 410', '', '12', '340', '9', '', 'T1', 'C'],
  ['P002', 'Amit Shah', 'Wicket-keeper', 'B', '', 'Left', '', '', '34', 'Wing A - 105', '', '8', '150', '0', '', 'T1', 'VC'],
  ['P003', 'Sanjay Mehta', 'Batter', 'A', '', 'Right', 'Right', 'Off-spin', '29', 'Wing B - 202', '', '10', '410', '1', '', 'T2', 'C'],
  ['P004', 'Rohan Patil', 'Bowler', 'B', '', 'Right', 'Right', 'Fast', '28', 'Wing B - 302', '', '12', '90', '14', 'Opening bowler', '', ''],
  ['P005', 'Nikhil Joshi', 'Batter', 'C', '', 'Left', '', '', '41', 'Wing D - 201', '', '', '', '', 'Available on weekends only', '', ''],
];

const TEAM_EXAMPLE = [
  ['T1', 'Wing A Tigers', 'TIG', '#4f9dff', 'Vikram Rao', 'Amit Shah', 'Mr. Kulkarni', ''],
  ['T2', 'Wing B Warriors', 'WAR', '#ff8a3d', 'Sanjay Mehta', '', '', ''],
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
  const leaders = {};
  rows.forEach((r, i) => {
    const line = i + 2;
    if (!r.name) { warnings.push(`Row ${line}: skipped (no name)`); return; }
    let id = String(r.id || '').trim().replace(/[.#$/[\]]/g, '');
    if (!id || used.has(id)) {
      if (id) warnings.push(`Row ${line}: duplicate id "${id}", assigned a new one`);
      do { id = 'P' + String(++n).padStart(3, '0'); } while (used.has(id));
    }
    used.add(id);
    // `pool` (A, B, Pool A…); older templates called it `category`.
    let cat = String(r.pool || r.category || '').trim();
    const short = cat.replace(/^pool\s*/i, '');
    const byLabel = (rules.categories || []).find((c) => c.label.toLowerCase() === cat.toLowerCase())
      || (rules.categories || []).find((c) => c.id.toLowerCase() === short.toLowerCase());
    if (byLabel) cat = byLabel.id;
    if (!catIds.includes(cat)) {
      if (cat) warnings.push(`Row ${line}: unknown pool "${cat}" for ${r.name}, put in ${(rules.categories || []).at(-1)?.label}`);
      cat = catIds.at(-1) || '';
    }
    if (r.base_price && num(r.base_price) == null) warnings.push(`Row ${line}: base_price "${r.base_price}" is not a number, ignored`);
    // Older templates used retained_by / retained_price.
    const team = (r.allotted_team || r.retained_by || '').trim() || null;
    let as = String(r.allotted_as || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    as = as.startsWith('V') ? 'VC' : as.startsWith('C') ? 'C' : as ? 'X' : '';
    if (as === 'X') { warnings.push(`Row ${line}: allotted_as "${r.allotted_as}" should be C or VC`); as = ''; }
    if (as && !team) { warnings.push(`Row ${line}: ${r.name} is ${as} but has no allotted_team`); as = ''; }
    if (team && !as) as = 'C' in (leaders[team] || {}) ? 'VC' : 'C';
    if (team) {
      leaders[team] ||= {};
      if (leaders[team][as]) warnings.push(`Row ${line}: team ${team} already has a ${as === 'C' ? 'captain' : 'vice-captain'} (${leaders[team][as]})`);
      leaders[team][as] = r.name;
      if (as === 'VC' && rules.leaders === 'captain') warnings.push(`Row ${line}: ${r.name} is vice-captain, but this tournament has captains only`);
    }
    // Batting hand and bowling arm / type (older files: batting_style, bowling_style).
    const batIn = r.batting_hand ?? r.batting ?? r.batting_style ?? '';
    const hand = parseHand(batIn);
    if (batIn && !hand) warnings.push(`Row ${line}: batting_hand "${batIn}" should be Right or Left`);
    const armIn = r.bowling_arm ?? (r.bowling_style && /\b(left|right)/i.test(r.bowling_style) ? r.bowling_style : '');
    const btype = parseBowlingType(r.bowling_type ?? r.bowling_style ?? '');
    const arm = btype || r.bowling_arm ? parseHand(armIn) : null;
    if (r.bowling_arm && !parseHand(r.bowling_arm) && !/^(none|no|-)$/i.test(r.bowling_arm)) warnings.push(`Row ${line}: bowling_arm "${r.bowling_arm}" should be Right or Left`);
    players[id] = {
      name: r.name,
      role: roleId(r.role),
      category: cat,
      basePrice: num(r.base_price),
      battingHand: hand,
      bowlingArm: arm,
      bowlingType: btype,
      age: num(r.age),
      locality: r.locality || null,
      photoUrl: r.photo_url || null,
      matches: num(r.matches),
      runs: num(r.runs),
      wickets: num(r.wickets),
      notes: r.notes || null,
      allottedTeam: team,
      allottedAs: team ? as : null,
      allottedPrice: team && r.retained_price ? num(r.retained_price) : null,
    };
  });
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
      logoUrl: r.logo_url || null,
      captainName: (r.captain || r.captain_name || '').trim() || null,
      vcName: (r.vice_captain || r['vice-captain'] || r.vc || r.vicecaptain || '').trim() || null,
    };
  });
  return { teams, warnings };
}

export function playersToCSV(players) {
  return toCSV(PLAYER_COLUMNS, Object.entries(players).map(([id, p]) => [
    id, p.name, ROLES[roleId(p.role)].name, p.category, p.basePrice,
    { R: 'Right', L: 'Left' }[battingHandOf(p)] || '', { R: 'Right', L: 'Left' }[bowlingArmOf(p)] || '', bowlingTypeOf(p) || '',
    p.age, p.locality, p.photoUrl, p.matches, p.runs, p.wickets, p.notes, p.allottedTeam, p.allottedAs,
  ]));
}

/* ---------------- tournament setup questionnaire ---------------- */

export const SETUP_COLUMNS = ['section', 'key', 'question', 'answer', 'help'];
const MAX_CATEGORIES = 6; // pools
const MAX_INCREMENTS = 6;

// House-rule questions every organiser should answer. Answers are shown to everyone
// on the live page; where the app can enforce a rule, the help text says which setting does it.
export const HOUSE_RULE_QUESTIONS = [
  ['hr_eligibility', 'Who can register to play?', 'e.g. Residents of the society only, age 16+, max 2 guest players per team'],
  ['hr_captains', 'How are captains and vice-captains chosen?', 'e.g. Chosen by the sports committee. Their prices are set above; mark them in the players CSV (allotted_team, allotted_as)'],
  ['hr_special_players', 'Any players every team must have?', 'e.g. At least 1 junior (under 16) and 1 senior (45+). Enforce with a pool min_per_team'],
  ['hr_locality', 'Any limit on players from the same wing / tower / family?', 'e.g. Max 4 players from the same wing per team (checked by the auctioneer)'],
  ['hr_reserves', 'How are the reserve players (squad beyond the playing side) used?', 'e.g. Any squad player may play; the playing 8 is told to the umpire before the toss'],
  ['hr_unsold_end', 'What happens to players still unsold at the end?', 'e.g. Lottery to teams short of players, at base price'],
  ['hr_absent', 'What if a bought player drops out before the tournament?', 'e.g. The team picks a replacement from the unsold players at base price'],
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
      if (v === '') { if (required) warn(`${key} is blank: kept ${r[prop]}. Fill it in`); else r[prop] = 0; return; }
      const n = num(v);
      if (n == null || n < 0) warn(`${key}: "${v}" is not a number, kept ${r[prop]}`);
      else r[prop] = n;
    }]);

  text('Tournament', 'auction_name', 'Auction name', 'Shown on every screen', ['meta', 'name']);
  text('Tournament', 'tournament_name', 'Tournament name', 'e.g. Society Premier League', ['meta', 'tournament']);
  text('Tournament', 'season', 'Season', 'e.g. 2026 or 3. Auctions of the same tournament are grouped by season', ['meta', 'season']);
  text('Tournament', 'venue', 'Venue', 'e.g. Clubhouse hall', ['meta', 'venue']);
  text('Tournament', 'date', 'Auction date (YYYY-MM-DD)', 'e.g. 2026-11-15', ['meta', 'date']);
  text('Tournament', 'time', 'Auction time', 'e.g. 6 PM - 9 PM', ['meta', 'time']);
  text('Tournament', 'organiser', 'Organiser', 'e.g. Sports committee', ['meta', 'organiser']);
  number('Tournament', 'overs', 'Overs per innings', 'Information only', 'overs');

  f.push(['Money', 'currency', 'Currency', '₹ for virtual rupees (₹50, ₹5 L, ₹1.2 Cr), or pts for points', (m, r) => r.currency, (m, r, v) => { r.currency = v || '₹'; }]);
  number('Money', 'purse_per_team', 'Purse per team', 'e.g. 1000. Amounts can also be written 1L, 1Cr or 1,00,000', 'purse', { required: true });
  number('Money', 'max_price_per_player', 'Highest price allowed for one player (blank = no cap)', 'e.g. 400', 'maxPlayerPrice');

  number('Squad', 'players_per_side', 'Players per side in a match', 'e.g. 8, 11, or 6 for box cricket', 'playersPerSide', { required: true });
  number('Squad', 'squad_size', 'Players each team must own in total, captain and vice-captain included', 'e.g. 10 for an 8-a-side tournament with 2 reserves. Every team must reach exactly this number', 'squadSize', { required: true });

  f.push(['Captain and vice-captain', 'leaders', 'Allotted to each team before the auction (captain / captain_vc)', 'captain = only a captain; captain_vc = a captain and a vice-captain. Mark them in the players CSV',
    (m, r) => r.leaders, (m, r, v, warn) => { if (/^c(apt(ain)?)?$/i.test(v)) r.leaders = 'captain'; else if (/v/i.test(v)) r.leaders = 'captain_vc'; else if (v) warn(`leaders: "${v}" should be captain or captain_vc`); }]);
  number('Captain and vice-captain', 'captain_price', 'Captain value (not taken from the purse)', 'e.g. 200. Recorded as the captain\'s value: if the captain is unavailable next season, this amount is added to the team\'s mini-auction budget', 'captainPrice');
  number('Captain and vice-captain', 'vc_price', 'Vice-captain value (not taken from the purse)', 'e.g. 150. Same as above for the vice-captain. Ignored with captain only', 'vcPrice');
  f.push(['Captain and vice-captain', 'bidders', 'Who bids for the team (captain / captain_vc)', 'captain = only the captain bids; captain_vc = captain and vice-captain both bid, each with their own code',
    (m, r) => r.bidders, (m, r, v, warn) => { if (/^c(apt(ain)?)?$/i.test(v)) r.bidders = 'captain'; else if (/v/i.test(v)) r.bidders = 'captain_vc'; else if (v) warn(`bidders: "${v}" should be captain or captain_vc`); }]);
  f.push(['Captain and vice-captain', 'purse_visibility', `Who sees remaining purse and max bid (${Object.keys(PURSE_VISIBILITY).join(' / ')})`, 'own = each captain/VC sees only their team; bidders = all captains/VCs see all teams; everyone = also the audience. Admins always see all',
    (m, r) => r.purseVisibility, (m, r, v, warn) => { if (PURSE_VISIBILITY[v]) r.purseVisibility = v; else if (v) warn(`purse_visibility: "${v}" not recognised, kept ${r.purseVisibility}`); }]);

  for (let i = 1; i <= MAX_CATEGORIES; i++) {
    const c = (r) => r.categories[i - 1] || {};
    const ensure = (r) => (r.categories[i - 1] ||= { id: '', label: '', base: 0, min: 0, max: 0 });
    const ex = DEFAULT_RULES.categories[i - 1];
    f.push(['Pools', `pool_${i}_id`, `Pool ${i}: short ID used in the players CSV`, i === 1 ? 'e.g. A. Pool A = the strongest players, then B, C… Pools come up in this order. Leave a whole pool blank if not needed' : ex ? `e.g. ${ex.id}` : 'Optional, e.g. D',
      (m, r) => c(r).id ?? '', (m, r, v) => { if (v) ensure(r).id = v.replace(/[.#$/[\]\s]/g, ''); }]);
    f.push(['Pools', `pool_${i}_name`, `Pool ${i}: name`, ex ? `e.g. ${ex.label}` : 'e.g. Pool D, Juniors',
      (m, r) => c(r).label ?? '', (m, r, v) => { if (v) ensure(r).label = v; }]);
    f.push(['Pools', `pool_${i}_base_price`, `Pool ${i}: base (starting) price`, ex ? `e.g. ${ex.base}` : 'e.g. 100',
      (m, r) => c(r).base ?? '', (m, r, v, warn) => { if (v) { const n = num(v); if (n == null) warn(`pool_${i}_base_price: "${v}" is not a number`); else ensure(r).base = n; } }]);
    f.push(['Pools', `pool_${i}_min_per_team`, `Pool ${i}: each team must have at least (blank = no rule)`, 'e.g. at least 1 Pool A player per team', (m, r) => c(r).min || '',
      (m, r, v) => { if (v) ensure(r).min = num(v) || 0; }]);
    f.push(['Pools', `pool_${i}_max_per_team`, `Pool ${i}: each team may have at most (blank = no limit)`, 'e.g. at most 3 Pool A players per team', (m, r) => c(r).max || '',
      (m, r, v) => { if (v) ensure(r).max = num(v) || 0; }]);
  }

  for (const [role, key] of Object.entries(ROLE_KEYS)) {
    f.push(['Roles', key, `Each team must have at least this many ${ROLES[role].name.toLowerCase()}s (blank = no rule)`, role === 'wk' ? 'e.g. 1' : '',
      (m, r) => r.roleMin[role] || '', (m, r, v) => { r.roleMin[role] = num(v) || 0; }]);
  }

  for (let i = 1; i <= MAX_INCREMENTS; i++) {
    const s = (r) => r.increments[i - 1] || {};
    const ensure = (r) => (r.increments[i - 1] ||= { upto: 0, step: 0 });
    f.push(['Bid increments', `increment_${i}_below`, `Slab ${i}: while the bid is below`, i === 1 ? 'e.g. 200. Leave blank on the last slab to mean "and above"' : '',
      (m, r) => s(r).upto || '', (m, r, v) => { if (v || s(r).step) ensure(r).upto = num(v) || 0; }]);
    f.push(['Bid increments', `increment_${i}_raise_by`, `Slab ${i}: raise each bid by`, i === 1 ? 'e.g. 10' : '',
      (m, r) => s(r).step || '', (m, r, v) => { if (v) ensure(r).step = num(v) || 0; }]);
  }

  f.push(['Bidding', 'bid_mode', 'How do captains bid? (phones / room)', 'phones = captains tap BID on their phones, auctioneer can still enter room bids. room = paddles only, auctioneer enters the final amount',
    (m, r) => (r.bidMode === 'room' ? 'room' : 'phones'), (m, r, v) => { r.bidMode = /room|paddle/i.test(v) ? 'room' : 'both'; }]);
  number('Bidding', 'bid_timer_seconds', 'Countdown after each bid, in seconds (0 = off)', 'e.g. 30', 'bidTimer');
  f.push(['Bidding', 'pick_order', `Order players come up (${Object.keys(PICK_ORDERS).join(' / ')})`, 'category-random = random draw, Pool A first. The control room can always also draw from one pool or bring up a chit',
    (m, r) => r.pickOrder, (m, r, v, warn) => { if (PICK_ORDERS[v]) r.pickOrder = v; else if (v) warn(`pick_order: "${v}" not recognised, kept ${r.pickOrder}`); }]);
  f.push(['Bidding', 'live_commentary', 'Show live commentary on the stage and phones? (yes / no)', 'Generated from the auction itself; it can also be read aloud on any device',
    (m, r) => (r.commentary === false ? 'no' : 'yes'), (m, r, v) => { r.commentary = !/^(n|no|off|false|0)$/i.test(v); }]);
  f.push(['Bidding', 'commentary_language', 'Commentary language (english / hinglish / marathi)', 'Each phone can still switch for itself',
    (m, r) => ({ hi: 'hinglish', mr: 'marathi' }[r.commentaryLang] || 'english'),
    (m, r, v, warn) => { const l = /hing|hindi/i.test(v) ? 'hi' : /mar|मराठी/i.test(v) ? 'mr' : /eng/i.test(v) || !v ? 'en' : null; if (l) r.commentaryLang = l; else warn(`commentary_language: "${v}" should be english, hinglish or marathi`); }]);
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
  // Older questionnaires called pools `category_N_…`.
  const answers = new Map(rows.filter((x) => x.key).map((x) => [x.key.trim().replace(/^category_(\d+)_/, 'pool_$1_'), (x.answer ?? '').trim()]));
  if (!answers.size) throw new Error('No answers found. Keep the header row: section,key,question,answer,help');
  const known = new Set();
  // Categories and increments are rebuilt from the file when it has them.
  if ([...answers.keys()].some((k) => /^pool_\d+_/.test(k))) r.categories = [];
  if ([...answers.keys()].some((k) => /^increment_\d+_/.test(k))) r.increments = [];
  for (const [, key, , , , set] of setupFields()) {
    known.add(key);
    if (answers.has(key)) set(m, r, answers.get(key), warn);
  }
  for (const k of answers.keys()) if (!known.has(k)) warn(`Unknown key "${k}" ignored`);

  r.categories = r.categories.filter((c) => c && c.id).map((c) => ({ ...c, label: c.label || c.id, base: c.base || 0 }));
  if (!r.categories.length) { warn('No pools given - kept the defaults'); r.categories = withDefaults(rules).categories; }
  r.increments = r.increments.filter((s) => s && s.step > 0).sort((x, y) => (x.upto || Infinity) - (y.upto || Infinity));
  if (!r.increments.length) { warn('No bid increments given - kept the defaults'); r.increments = withDefaults(rules).increments; }
  if (Number(r.playersPerSide) > Number(r.squadSize)) warn(`squad_size (${r.squadSize}) is smaller than players_per_side (${r.playersPerSide})`);
  const catMin = r.categories.reduce((t, c) => t + (Number(c.min) || 0), 0);
  const roleMin = Object.values(r.roleMin).reduce((t, n) => t + (Number(n) || 0), 0);
  if (Math.max(catMin, roleMin) > r.squadSize) warn('Pool or role minimums add up to more than squad_size');
  const toBuy = Number(r.squadSize) - (r.leaders === 'captain_vc' ? 2 : 1);
  const need = toBuy * Math.min(...r.categories.map((c) => Number(c.base) || 0));
  if (need > Number(r.purse)) warn(`The purse (${r.purse}) cannot buy ${toBuy} players even at base price (${need})`);
  delete r.reservesPerTeam; delete r.reserveBasePrice; delete r.retainedPriceDefault;
  return { meta: m, rules: withDefaults(r), warnings };
}
