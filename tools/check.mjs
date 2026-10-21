// Checks the rules engine, money formatting and the setup questionnaire.
// Run: node tools/check.mjs
import fs from 'node:fs';
globalThis.crypto ??= (await import('node:crypto')).webcrypto;
const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const csv = await import(root + '/js/csv.js');
const E = await import(root + '/js/engine.js');
const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
// money
const R = E.withDefaults({});
ok(E.money(4200000, R) === '₹42 L', 'money 42 L: ' + E.money(4200000, R));
ok(E.money(12500000, R) === '₹1.25 Cr', 'money Cr: ' + E.money(12500000, R));
ok(E.money(50000, R) === '₹50,000', 'money thousands');
ok(E.money(2400, { currency: 'pts' }) === '2,400 pts', 'points');
ok(csv.num('5L') === 500000 && csv.num('1.5Cr') === 15000000 && csv.num('5,00,000') === 500000 && csv.num('₹2 lakh') === 200000, 'num parses L/Cr');
// questionnaire round trip
const text = fs.readFileSync(root + '/templates/sample_tournament_setup.csv', 'utf8');
const s = csv.importSetup(csv.parseCSV(text), {}, {});
ok(!s.warnings.length, 'sample setup imports cleanly ' + s.warnings.join('; '));
ok(s.rules.reservesPerTeam === 2 && s.rules.maxSquad === 13 && s.rules.categories.length === 4 && s.rules.categories[3].min === 1, 'sample rules parsed');
ok(s.rules.roleMin.wk === 1 && s.rules.houseRules.length === 10 && s.meta.venue === 'Clubhouse hall', 'roles, house rules, meta');
const again = csv.importSetup(csv.parseCSV(csv.setupToCSV(s.meta, s.rules)), {}, {});
ok(JSON.stringify(again.rules) === JSON.stringify(s.rules), 'export -> import round-trips');
const tpl = csv.importSetup(csv.parseCSV(fs.readFileSync(root + '/templates/tournament_setup_template.csv', 'utf8')), {}, {});
ok(!tpl.warnings.length, 'blank template imports cleanly ' + tpl.warnings.join('; '));
const edited = csv.importSetup([{ key: 'bid_mode', answer: 'Room paddles' }, { key: 'purse_per_team', answer: '50L' }, { key: 'pick_order', answer: 'nonsense' }], {}, {});
ok(edited.rules.bidMode === 'room' && edited.rules.purse === 5000000 && edited.warnings.length === 1, 'partial questionnaire + warning');
// limits
const players = csv.importPlayers(csv.parseCSV(fs.readFileSync(root + '/templates/sample_players.csv', 'utf8')), s.rules).players;
const teams = csv.importTeams(csv.parseCSV(fs.readFileSync(root + '/templates/sample_teams.csv', 'utf8'))).teams;
const a = E.normalize({ meta: { round: 1 }, rules: s.rules, teams, players, sales: {} });
ok(Object.values(players).filter(E.isReserve).length === 8, '8 reserve players');
const icon = Object.entries(players).find(([, p]) => p.category === 'A')[0];
a.sales = { P001: { team: 'T1', price: 0 }, P005: { team: 'T1', price: 1000000 } };
ok(E.bidLimit(a, 'T1', players.P006).max === 0 && /Icon limit/.test(E.bidLimit(a, 'T1', players.P006).why), 'category max: ' + E.bidLimit(a, 'T1', players.P006).why);
const res = Object.entries(players).find(([, p]) => E.isReserve(p))[1];
ok(E.bidLimit(a, 'T1', res).max > 0, 'reserve allowed with slots');
// fill T2 to 12 players with no WK and no junior -> last slot must go to WK/junior
const nonSpecial = Object.entries(players).filter(([, p]) => !E.isReserve(p) && p.category !== 'J' && E.roleId(p.role) !== 'wk' && p.category !== 'A');
a.sales = {};
nonSpecial.slice(0, 12).forEach(([id], i) => { a.sales[id] = { team: 'T2', price: 100000 }; });
const anotherBat = nonSpecial[12][1];
ok(/Keep your last slots/.test(E.bidLimit(a, 'T2', anotherBat).why), 'role/category slot reserve: ' + E.bidLimit(a, 'T2', anotherBat).why);
const wk = Object.values(players).find((p) => E.roleId(p.role) === 'wk' && p.category === 'J') || Object.values(players).find((p) => E.roleId(p.role) === 'wk' && !E.isReserve(p) && p.category !== 'A');
console.log('    wk limit', E.bidLimit(a, 'T2', wk));
// pickNext puts reserves last
a.sales = {}; const order = new Set();
for (let i = 0; i < 52; i++) { const p = E.pickNext(a); if (!p) break; a.sales[p.id] = { team: 'T1', price: 1 }; order.add(E.isReserve(p) ? 'R' : 'M'); if (E.isReserve(p)) { ok(Object.values(players).filter((x) => !E.isReserve(x)).every((x, j) => a.sales[Object.keys(players).find((k) => players[k] === x)]), 'reserves come after all main players'); break; } }
