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

// Filled sample: 8-a-side society tournament, squads of 10 (2 reserves), captain + vice-captain allotted.
const rules = {
  ...DEFAULT_RULES,
  purse: 1000, playersPerSide: 8, squadSize: 10, overs: 8,
  leaders: 'captain_vc', captainPrice: 200, vcPrice: 150, bidders: 'captain_vc', purseVisibility: 'own',
  maxPlayerPrice: 0, bidMode: 'both', bidTimer: 30, unsoldRounds: 1,
  categories: [{ id: 'P', label: 'Player', base: 50, min: 0, max: 0 }],
  roleMin: { bat: 0, bowl: 0, ar: 0, wk: 1 },
  increments: [{ upto: 200, step: 10 }, { upto: 0, step: 25 }],
  houseRules: [
    { key: 'hr_eligibility', q: '', a: 'Residents of the society only, age 14 and above on the auction date.' },
    { key: 'hr_captains', q: '', a: 'Captains and vice-captains are chosen by the sports committee before the auction.' },
    { key: 'hr_special_players', q: '', a: 'Every team must have at least 1 wicket-keeper (enforced by the app).' },
    { key: 'hr_locality', q: '', a: 'At most 4 players from the same wing per team (checked by the auctioneer).' },
    { key: 'hr_reserves', q: '', a: 'Any 8 of the 10 may play a match; the captain names the playing 8 before the toss.' },
    { key: 'hr_unsold_end', q: '', a: 'Players still unsold go by lottery to teams below 10 players, at base price.' },
    { key: 'hr_absent', q: '', a: 'If a bought player drops out, the team picks a replacement from the unsold players at base price.' },
    { key: 'hr_trades', q: '', a: 'No trades after the auction.' },
    { key: 'hr_conduct', q: '', a: 'Bid only from the app or by paddle. No bids after the auctioneer says sold.' },
    { key: 'hr_disputes', q: '', a: "The auctioneer's decision is final." },
  ],
};
w('sample_tournament_setup.csv', csv.setupToCSV({ name: 'Society Premier League 2026 player auction', tournament: 'Society Premier League', venue: 'Clubhouse hall', date: '2026-11-15', organiser: 'Sports committee' }, rules));

w('sample_teams.csv', csv.toCSV(csv.TEAM_COLUMNS, [
  ['T1', 'Sunrise Strikers', 'SUN', csv.TEAM_COLORS[0], 'Mr. Kulkarni', ''],
  ['T2', 'Royal Warriors', 'ROY', csv.TEAM_COLORS[1], 'Mrs. Desai', ''],
  ['T3', 'Thunder Kings', 'THU', csv.TEAM_COLORS[2], 'Mr. Iyer', ''],
  ['T4', 'Green Giants', 'GRN', csv.TEAM_COLORS[3], 'Mr. Khan', ''],
]));

const first = ['Aarav', 'Vivaan', 'Aditya', 'Kabir', 'Ishaan', 'Reyansh', 'Arnav', 'Dhruv', 'Kunal', 'Nikhil', 'Pranav', 'Rahul', 'Siddharth', 'Tanmay', 'Varun', 'Yash', 'Harsh', 'Manish', 'Omkar', 'Pratik', 'Rohit', 'Saurabh', 'Tushar', 'Vedant', 'Akash', 'Chirag', 'Gaurav', 'Jay', 'Neel', 'Parth', 'Sahil', 'Atharva'];
const last = ['Sharma', 'Joshi', 'Kulkarni', 'Deshmukh', 'Pawar', 'Gupta', 'Menon', 'Reddy', 'Singh', 'Verma', 'Bhat', 'Chavan', 'Naik', 'Gokhale', 'Shinde', 'More', 'Jadhav'];
const roles = ['Batter', 'Bowler', 'All-rounder'];
let seed = 7; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const leaders = [
  ['Rohan Patil', 'All-rounder', 'T1', 'C'], ['Amit Shah', 'Wicket-keeper', 'T1', 'VC'],
  ['Sanjay Mehta', 'Batter', 'T2', 'C'], ['Kiran Bhosale', 'Bowler', 'T2', 'VC'],
  ['Arjun Nair', 'Bowler', 'T3', 'C'], ['Deepak Rane', 'All-rounder', 'T3', 'VC'],
  ['Imran Shaikh', 'Wicket-keeper', 'T4', 'C'], ['Suresh Kale', 'Batter', 'T4', 'VC'],
];
const used = new Set(leaders.map((x) => x[0]));
const row = (i, name, role, team = '', as = '') => {
  const bowls = role === 'Bowler' || role === 'All-rounder';
  return [`P${String(i).padStart(3, '0')}`, name, role, 'P', '', r() < 0.75 ? 'Right-hand bat' : 'Left-hand bat',
    bowls ? ['Right-arm medium', 'Right-arm fast', 'Off-spin', 'Left-arm spin', 'Leg-spin'][Math.floor(r() * 5)] : '', 16 + Math.floor(r() * 32),
    `${'ABCD'[Math.floor(r() * 4)]}-${100 + Math.floor(r() * 800)}`, '', Math.floor(r() * 15), role === 'Bowler' ? Math.floor(r() * 80) : Math.floor(r() * 450),
    bowls ? Math.floor(r() * 20) : 0, '', team, as];
};
const rows = leaders.map(([name, role, team, as], i) => row(i + 1, name, role, team, as));
for (let i = 9; i <= 44; i++) {
  const role = i % 7 === 0 ? 'Wicket-keeper' : roles[Math.floor(r() * 3)];
  let name;
  do { name = `${first[Math.floor(r() * first.length)]} ${last[Math.floor(r() * last.length)]}`; } while (used.has(name));
  used.add(name);
  rows.push(row(i, name, role));
}
w('sample_players.csv', csv.toCSV(csv.PLAYER_COLUMNS, rows));
