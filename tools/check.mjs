// Checks the rules engine, money formatting and the setup questionnaire.
// Run: node tools/check.mjs
import fs from 'node:fs';

globalThis.crypto ??= (await import('node:crypto')).webcrypto;
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const csv = await import(root + '/js/csv.js');
const E = await import(root + '/js/engine.js');
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const read = (f) => fs.readFileSync(`${root}/templates/${f}`, 'utf8');

// money
const R = E.withDefaults({});
ok(E.money(50, R) === '₹50' && E.money(4200000, R) === '₹42 L' && E.money(12500000, R) === '₹1.25 Cr', 'money: ₹50, ₹42 L, ₹1.25 Cr');
ok(E.money(2400, { currency: 'pts' }) === '2,400 pts', 'money: points');
ok(csv.num('5L') === 500000 && csv.num('1.5Cr') === 15000000 && csv.num('5,00,000') === 500000 && csv.num('₹200') === 200, 'num parses 5L / 1.5Cr / 5,00,000 / ₹200');

// questionnaire
const s = csv.importSetup(csv.parseCSV(read('sample_tournament_setup.csv')), {}, {});
ok(!s.warnings.length, 'sample setup imports cleanly ' + s.warnings.join('; '));
ok(s.rules.squadSize === 10 && s.rules.playersPerSide === 8 && s.rules.captainPrice === 200 && s.rules.vcPrice === 150 && s.rules.purse === 1000, 'sample: 8-a-side, squad 10, C 200, VC 150, purse 1000');
ok(s.rules.leaders === 'captain_vc' && s.rules.bidders === 'captain_vc' && s.rules.purseVisibility === 'own' && s.rules.houseRules.length === 10, 'sample: leaders, bidders, visibility, house rules');
const again = csv.importSetup(csv.parseCSV(csv.setupToCSV(s.meta, s.rules)), {}, {});
ok(JSON.stringify(again.rules) === JSON.stringify(s.rules), 'questionnaire export → import round-trips');
const tpl = csv.importSetup(csv.parseCSV(read('tournament_setup_template.csv')), {}, {});
ok(!tpl.warnings.length, 'blank template imports cleanly ' + tpl.warnings.join('; '));
const capOnly = csv.importSetup([{ key: 'leaders', answer: 'captain' }, { key: 'bidders', answer: 'captain_vc' }, { key: 'bid_mode', answer: 'Room paddles' }], {}, {});
ok(capOnly.rules.leaders === 'captain' && capOnly.rules.bidders === 'captain' && capOnly.rules.bidMode === 'room', 'captain-only forces captain-only bidding');
const broke = csv.importSetup([{ key: 'purse_per_team', answer: '300' }], {}, {});
ok(broke.warnings.some((w) => /cannot buy/.test(w)), 'warns when the purse cannot buy the squad at base price');

// players + max bid
const { players, warnings } = csv.importPlayers(csv.parseCSV(read('sample_players.csv')), s.rules);
const teams = csv.importTeams(csv.parseCSV(read('sample_teams.csv'))).teams;
ok(!warnings.length && Object.values(players).filter(E.isAllotted).length === 8, '8 captains / vice-captains allotted ' + warnings.join('; '));
const dup = csv.importPlayers([{ name: 'A', allotted_team: 'T1', allotted_as: 'C' }, { name: 'B', allotted_team: 'T1', allotted_as: 'C' }], s.rules);
ok(dup.warnings.some((w) => /already has a captain/.test(w)), 'warns on two captains in one team');
const a = E.normalize({ meta: { round: 1 }, rules: s.rules, teams, players, sales: {} });
for (const [pid, p] of Object.entries(players)) if (p.allottedTeam) a.sales[pid] = { team: p.allottedTeam, price: E.allottedPrice(p, s.rules), allotted: true };
const t1 = E.teamSummary(a, 'T1');
ok(t1.remaining === 1000 && t1.toBuy === 8 && t1.maxBid === 650 && t1.allottedValue === 350, `example: full ₹1000 purse (C ₹200 + VC ₹150 = ₹350 recorded separately), 8 to buy → max bid 1000 − 7 × 50 = ₹650 (got ${t1.remaining}, ${t1.toBuy}, ${t1.maxBid}, ${t1.allottedValue})`);
const anyone = Object.values(players).find((p) => !p.allottedTeam && E.roleId(p.role) !== 'wk');
ok(E.bidLimit(a, 'T1', anyone).max === 650, 'bidLimit agrees: ₹650');
ok(E.pool(a).every((p) => !p.allottedTeam) && E.pool(a).length === 36, 'allotted players are never auctioned');
// fill T1 to 9 with non-keepers who cost 50 → last slot must be a WK (T1's VC is a WK, so use T2: C batter, VC bowler)
const plain = Object.entries(players).filter(([, p]) => !p.allottedTeam && E.roleId(p.role) !== 'wk');
plain.slice(0, 7).forEach(([id]) => { a.sales[id] = { team: 'T2', price: 50 }; });
ok(/Keep your last slots for 1 WK/.test(E.bidLimit(a, 'T2', plain[7][1]).why), 'role minimum keeps the last slot: ' + E.bidLimit(a, 'T2', plain[7][1]).why);
const t2 = E.teamSummary(a, 'T2');
ok(t2.toBuy === 1 && t2.maxBid === t2.remaining, `last player: max bid = whole purse left (${t2.maxBid} of ${t2.remaining})`);

// visibility
const vis = (v, viewer, team) => E.canSeePurse({ purseVisibility: v }, viewer, team);
ok(vis('own', { role: 'captain', team: 'T1' }, 'T1') && !vis('own', { role: 'captain', team: 'T1' }, 'T2') && vis('own', { role: 'vc', team: 'T2' }, 'T2'), 'own: captain / VC see only their team');
ok(!vis('own', { role: 'audience' }, 'T1') && !vis('bidders', { role: 'member', team: 'T1' }, 'T1') && !vis('own', { role: 'screen' }, 'T1'), 'audience, team members and the stage do not see purses');
ok(vis('own', { role: 'admin' }, 'T3') && vis('bidders', { role: 'captain', team: 'T1' }, 'T4') && vis('everyone', { role: 'audience' }, 'T1'), 'admin sees all; bidders / everyone modes');
