// Regenerates the CSV templates and sample data in templates/ from js/csv.js.
// Run: node tools/generate-templates.mjs
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
globalThis.crypto ??= (await import('node:crypto')).webcrypto;
const csv = await import(root + '/js/csv.js');
const { DEFAULT_RULES } = await import(root + '/js/engine.js');
const L = 100000;
const w = (f, s) => fs.writeFileSync(`${root}/templates/${f}`, s);
w('players_template.csv', csv.playerTemplate());
w('teams_template.csv', csv.teamTemplate());
w('tournament_setup_template.csv', csv.setupToCSV({}, DEFAULT_RULES));

// Filled sample: a society league with juniors, reserves and house rules.
const rules = {
  ...DEFAULT_RULES,
  purse: 100 * L, minSquad: 11, maxSquad: 13, reservesPerTeam: 2, reserveBasePrice: 50000, maxPlayerPrice: 40 * L,
  playersPerSide: 11, overs: 10, bidMode: 'both', bidTimer: 30, unsoldRounds: 1,
  categories: [
    { id: 'A', label: 'Icon', base: 10 * L, min: 0, max: 2 },
    { id: 'B', label: 'Gold', base: 5 * L, min: 0, max: 0 },
    { id: 'C', label: 'Silver', base: 2 * L, min: 0, max: 0 },
    { id: 'J', label: 'Junior', base: 1 * L, min: 1, max: 0 },
  ],
  roleMin: { bat: 0, bowl: 0, ar: 0, wk: 1 },
  houseRules: [
    { key: 'hr_eligibility', q: '', a: 'Residents of the society only. Juniors are under 16 on the auction date.' },
    { key: 'hr_captains', q: '', a: 'Captains chosen by the sports committee and retained by their team at ₹0.' },
    { key: 'hr_special_players', q: '', a: 'Every team must buy at least 1 junior and 1 wicket-keeper (enforced by the app).' },
    { key: 'hr_locality', q: '', a: 'At most 5 players from the same wing per team (checked by the auctioneer).' },
    { key: 'hr_reserves', q: '', a: 'Reserves play only when a squad player is absent; tell the organisers 24 hours before the match.' },
    { key: 'hr_unsold_end', q: '', a: 'Players still unsold go by lottery to teams below 11 players, at base price.' },
    { key: 'hr_absent', q: '', a: 'If a bought player drops out, the team picks a replacement from the unsold or reserve list at base price.' },
    { key: 'hr_trades', q: '', a: 'No trades after the auction.' },
    { key: 'hr_conduct', q: '', a: 'Bid only from the app or by paddle. No bids after the auctioneer says sold.' },
    { key: 'hr_disputes', q: '', a: "The auctioneer's decision is final." },
  ],
};
w('sample_tournament_setup.csv', csv.setupToCSV({ name: 'Society Premier League 2026 player auction', tournament: 'Society Premier League', venue: 'Clubhouse hall', date: '2026-11-15', organiser: 'Sports committee' }, rules));

w('sample_teams.csv', csv.toCSV(csv.TEAM_COLUMNS, [
  ['T1', 'Sunrise Strikers', 'SUN', csv.TEAM_COLORS[0], 'Mr. Kulkarni', 'Rohan Patil', ''],
  ['T2', 'Royal Warriors', 'ROY', csv.TEAM_COLORS[1], 'Mrs. Desai', 'Sanjay Mehta', ''],
  ['T3', 'Thunder Kings', 'THU', csv.TEAM_COLORS[2], 'Mr. Iyer', 'Arjun Nair', ''],
  ['T4', 'Green Giants', 'GRN', csv.TEAM_COLORS[3], 'Mr. Khan', 'Imran Shaikh', ''],
]));

const first = ['Aarav', 'Vivaan', 'Aditya', 'Kabir', 'Ishaan', 'Reyansh', 'Arnav', 'Dhruv', 'Kunal', 'Nikhil', 'Pranav', 'Rahul', 'Siddharth', 'Tanmay', 'Varun', 'Yash', 'Harsh', 'Manish', 'Omkar', 'Pratik', 'Rohit', 'Saurabh', 'Tushar', 'Vedant', 'Akash', 'Chirag', 'Gaurav', 'Jay', 'Neel', 'Parth', 'Sahil', 'Atharva'];
const last = ['Sharma', 'Joshi', 'Kulkarni', 'Deshmukh', 'Pawar', 'Gupta', 'Menon', 'Reddy', 'Singh', 'Verma', 'Bhat', 'Chavan', 'Naik', 'Gokhale', 'Shinde', 'More', 'Jadhav'];
const roles = ['Batter', 'Bowler', 'All-rounder', 'Wicket-keeper'];
let seed = 7; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const rows = [
  ['P001', 'Rohan Patil', 'All-rounder', 'A', 'main', '', 'Right-hand bat', 'Right-arm medium', 29, 'A-302', '', 14, 420, 11, 'Captain', 'T1', 0],
  ['P002', 'Sanjay Mehta', 'Batter', 'A', 'main', '', 'Right-hand bat', '', 33, 'B-110', '', 12, 510, 1, 'Captain', 'T2', 0],
  ['P003', 'Arjun Nair', 'Bowler', 'A', 'main', '', 'Right-hand bat', 'Right-arm fast', 27, 'C-704', '', 13, 95, 22, 'Captain', 'T3', 0],
  ['P004', 'Imran Shaikh', 'Wicket-keeper', 'A', 'main', '', 'Left-hand bat', '', 31, 'D-501', '', 10, 380, 0, 'Captain', 'T4', 0],
];
const used = new Set(rows.map((x) => x[1]));
for (let i = 5; i <= 52; i++) {
  const reserve = i > 44;
  const cat = reserve ? 'C' : i <= 8 ? 'A' : i <= 20 ? 'B' : i <= 36 ? 'C' : 'J';
  let role = i % 9 === 0 ? 'Wicket-keeper' : roles[Math.floor(r() * 3)];
  let name;
  do { name = `${first[Math.floor(r() * first.length)]} ${last[Math.floor(r() * last.length)]}`; } while (used.has(name));
  used.add(name);
  const age = cat === 'J' ? 12 + Math.floor(r() * 4) : 18 + Math.floor(r() * 30);
  const bowls = role === 'Bowler' || role === 'All-rounder';
  rows.push([`P${String(i).padStart(3, '0')}`, name, role, cat, reserve ? 'reserve' : 'main', '', r() < 0.75 ? 'Right-hand bat' : 'Left-hand bat',
    bowls ? ['Right-arm medium', 'Right-arm fast', 'Off-spin', 'Left-arm spin', 'Leg-spin'][Math.floor(r() * 5)] : '', age,
    `${'ABCD'[Math.floor(r() * 4)]}-${100 + Math.floor(r() * 800)}`, '', Math.floor(r() * 15), role === 'Bowler' ? Math.floor(r() * 80) : Math.floor(r() * 450),
    bowls ? Math.floor(r() * 20) : 0, reserve ? 'Reserve' : '', '', '']);
}
w('sample_players.csv', csv.toCSV(csv.PLAYER_COLUMNS, rows));
