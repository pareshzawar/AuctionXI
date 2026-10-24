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
ok(E.pool(a).every((p) => !p.allottedTeam) && E.pool(a).length === 34, 'allotted players are never auctioned');
ok(Object.values(players).filter((p) => p.list === 'waiting').length === 2 && E.pool(a).every((p) => p.list !== 'waiting'), 'waiting-list players are not in the auction until moved in');
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

// mini auction: budget = remaining purse + value of released players
{
  const m = E.normalize({ meta: { round: 1 }, rules: s.rules, teams, players, sales: {} });
  for (const [pid, p] of Object.entries(players)) if (p.allottedTeam) m.sales[pid] = { team: p.allottedTeam, price: E.allottedPrice(p, s.rules), allotted: true };
  const bought = Object.keys(players).filter((pid) => !players[pid].allottedTeam).slice(0, 8);
  bought.forEach((pid, i) => { m.sales[pid] = { team: 'T1', price: i === 0 ? 300 : 50 }; }); // spent 650, 350 left
  const t = E.teamSummary(m, 'T1');
  ok(t.remaining === 350 && t.count === 10, 'T1 full squad, ₹350 left');
  const vcId = Object.keys(players).find((pid) => players[pid].allottedTeam === 'T1' && players[pid].allottedAs === 'VC');
  const keep = new Set(t.players.map((p) => p.id).filter((id) => id !== vcId && id !== bought[0]));
  const mb = E.miniBudget(m, 'T1', keep);
  ok(mb.releasedValue === 450 && mb.budget === 800, `release VC (value ₹150) + ₹300 player → budget 350 + 450 = ₹800 (got ${mb.budget})`);
  // the next season's auction: kept players are allotted, budget is the team's own purse
  const nextPlayers = {};
  for (const p of mb.kept) nextPlayers[p.id] = { ...players[p.id], allottedTeam: 'T1', allottedAs: p.as === 'C' || p.as === 'VC' ? p.as : 'R', allottedPrice: p.price };
  const n = E.normalize({ meta: { round: 1 }, rules: s.rules, teams: { ...teams, T1: { ...teams.T1, purse: mb.budget } }, players: nextPlayers, sales: {} });
  for (const [pid, p] of Object.entries(nextPlayers)) n.sales[pid] = { team: 'T1', price: E.allottedPrice(p, s.rules), allotted: true };
  const nt = E.teamSummary(n, 'T1');
  ok(nt.remaining === 800 && nt.toBuy === 2 && nt.maxBid === 750, `next season: ₹800 budget, 2 to buy → max bid 800 − 1 × 50 = ₹750 (got ${nt.remaining}, ${nt.toBuy}, ${nt.maxBid})`);
  ok(E.teamSummary(n, 'T2').purse === 1000 && E.variedBudgets(n), 'other teams keep the standard purse; budgets marked as varied');
}

// pools, random draw, chit search
{
  const r = E.withDefaults({});
  const imp = csv.importPlayers([
    { name: 'A One', pool: 'A' }, { name: 'B Two', pool: 'Pool B' }, { name: 'C Three', category: 'c' }, { name: 'D Four', pool: 'Z' },
  ], r);
  const pools = Object.values(imp.players).map((p) => p.category).join('');
  ok(pools === 'ABCC' && imp.warnings.length === 1, `pool column accepts A / "Pool B" / old category column; unknown pool warns (got ${pools})`);
  const q = csv.importSetup([{ key: 'category_1_id', answer: 'A' }, { key: 'category_1_name', answer: 'Pool A' }, { key: 'category_1_base_price', answer: '100' }], {}, {});
  ok(q.rules.categories.length === 1 && q.rules.categories[0].base === 100, 'old category_N keys in a questionnaire still import as pools');
  const p2 = E.normalize({ meta: { round: 1 }, rules: s.rules, teams, players, sales: {} });
  const firstDraws = new Set(Array.from({ length: 40 }, () => E.pickNext(p2).category));
  ok(firstDraws.size === 1 && firstDraws.has('A'), 'auto draw takes Pool A first');
  const fromB = Array.from({ length: 40 }, () => E.pickNext(p2, { pool: 'B', role: 'bowl' }));
  ok(fromB.every((p) => p.category === 'B' && E.roleId(p.role) === 'bowl'), 'draw from one pool and role');
  const someone = Object.values(players).find((p) => !p.allottedTeam);
  ok(E.searchPool(p2, someone.name.split(' ')[0].slice(0, 3)).some((p) => p.name === someone.name), 'chit search finds a player by the start of the name');
  const cap = Object.values(players).find((p) => p.allottedAs === 'C');
  ok(!E.searchPool(p2, cap.name).some((p) => p.name === cap.name), 'chit search never offers an allotted captain');
}

// live commentary
{
  const C = await import(root + '/js/commentary.js');
  const a = E.normalize({ meta: { name: 'SPL 2026', round: 1 }, rules: s.rules, teams, players, sales: {}, log: {} });
  for (const [pid, p] of Object.entries(players)) if (p.allottedTeam) a.sales[pid] = { team: p.allottedTeam, price: E.allottedPrice(p, s.rules), allotted: true };
  const said = [];
  const c = C.createCommentator({ onLine: (l) => said.push(l.text) });
  c.update(a); // first update: history only, nothing said
  const [p1, p2] = Object.keys(players).filter((id) => !players[id].allottedTeam);
  a.log.a1 = { type: 'start', at: 1 }; a.log.a2 = { type: 'up', playerId: p1, amount: 50, drawn: 'random', at: 2 };
  a.live = { playerId: p1, status: 'bidding', bid: { amount: 50, team: null } }; c.update(a);
  for (const [team, amount] of [['T1', 50], ['T2', 60], ['T1', 70], ['T2', 80], ['T3', 90]]) { a.live.bid = { amount, team, at: amount }; c.update(a); }
  a.sales[p1] = { team: 'T3', price: 90 }; a.live.status = 'sold'; a.log.a3 = { type: 'sold', playerId: p1, team: 'T3', amount: 90, at: 100 }; c.update(a);
  a.log.a4 = { type: 'up', playerId: p2, amount: 50, drawn: 'chit', at: 101 }; a.live = { playerId: p2, status: 'bidding', bid: { amount: 50, team: null } }; c.update(a);
  a.live.bid = { amount: 100, team: 'T1', at: 102 }; c.update(a); // past the 90 record? opening bid line wins
  a.live.bid = { amount: 110, team: 'T2', at: 103 }; c.update(a);
  console.log('     ' + said.join('\n     '));
  ok(said.length === 11 && /open|first/i.test(said[2]) && /war|let go|again/i.test(said[5]) && /Sold|to Thunder|Hammer/.test(said[7]) && /chits/.test(said[8]), 'commentary covers start, intro, bids, war, sale, chit');
  ok(!said.some((t) => /purse|left in/i.test(t)), 'no purse amounts when purses are private');
  const again = []; const c2 = C.createCommentator({ onLine: (l) => again.push(l.text) }); c2.update(a);
  ok(again.length === 0 && c2.lines.length > 0, 'a late joiner gets the history without it being read out');
}

// commentary languages: same events, Hinglish and Marathi
{
  const C = await import(root + '/js/commentary.js');
  for (const lang of ['hi', 'mr']) {
    const a = E.normalize({ meta: { name: 'SPL 2026', round: 1 }, rules: s.rules, teams, players, sales: {}, log: {} });
    for (const [pid, p] of Object.entries(players)) if (p.allottedTeam) a.sales[pid] = { team: p.allottedTeam, price: E.allottedPrice(p, s.rules), allotted: true };
    const said = [];
    const c = C.createCommentator({ lang, onLine: (l) => said.push(l.text) });
    c.update(a);
    const [p1] = Object.keys(players).filter((id) => !players[id].allottedTeam);
    a.log.a1 = { type: 'start', at: 1 }; a.log.a2 = { type: 'up', playerId: p1, amount: 50, drawn: 'chit', at: 2 };
    a.live = { playerId: p1, status: 'bidding', bid: { amount: 50, team: null } }; c.update(a);
    for (const [team, amount] of [['T1', 50], ['T2', 60], ['T1', 70], ['T2', 80], ['T3', 200]]) { a.live.bid = { amount, team, at: amount }; c.update(a); }
    a.sales[p1] = { team: 'T3', price: 200 }; a.live.status = 'sold'; a.log.a3 = { type: 'sold', playerId: p1, team: 'T3', amount: 200, at: 300 }; c.update(a);
    a.log.a4 = { type: 'end', at: 400 }; c.update(a);
    console.log(`     [${lang}]\n     ` + said.join('\n     '));
    ok(said.length === 9 && (lang === 'mr' ? said.every((t) => /[ऀ-ॿ]/.test(t)) : /shuru|baari|nikla/.test(said[1])), `commentary in ${lang === 'hi' ? 'Hinglish' : 'Marathi'}`);
  }
}

// workbook encryption and scratch-pad sums
{
  const V = await import(root + '/js/vault.js');
  const k = await V.keyFor('4321', 'auctionxi:TEST:T1_C');
  const box = await V.encryptJSON({ players: { P1: { fav: true, max: 300 } }, pad: 'plan' }, k);
  ok(!box.data.includes('plan') && (await V.decryptJSON(box, k)).players.P1.max === 300, 'workbook: encrypted at rest, decrypts with the PIN');
  const wrong = await V.keyFor('0000', 'auctionxi:TEST:T1_C');
  ok(await V.decryptJSON(box, wrong).then(() => false, () => true), 'workbook: a wrong PIN cannot read it');
  ok(V.calc('650 - 7*50') === 300 && V.calc('1.5L + 50,000') === 200000 && V.calc('alert(1)') === null, 'scratch pad: 650 - 7*50, 1.5L + 50,000, rejects code');
}

// teams template captains / vice-captains → players
{
  const rules = E.withDefaults({});
  const a = E.normalize({ meta: {}, rules, teams: { T1: { name: 'Rajgad', captainName: 'Ravi Kumar', vcName: 'Kiran' }, T2: { name: 'Torna', captainName: 'Ganesh Bhor' } },
    players: { P001: { name: 'Kiran Patil', role: 'bat', category: 'C' }, P002: { name: 'Old Captain', role: 'ar', category: 'A', allottedTeam: 'T2', allottedAs: 'C' } } });
  const { updates, warnings } = E.linkLeaders(a);
  const added = Object.entries(updates).filter(([k, v]) => /^players\/P\d+$/.test(k) && v);
  ok(added.length === 2 && added.every(([, p]) => p.autoLeader) && added.some(([, p]) => p.name === 'Ravi Kumar' && p.allottedTeam === 'T1' && p.allottedAs === 'C'), 'teams template: captains not in the player list are added');
  ok(updates['players/P001/allottedTeam'] === 'T1' && updates['players/P001/allottedAs'] === 'VC' && warnings.some((w) => /matched to Kiran Patil/.test(w)), 'teams template: "Kiran" matches Kiran Patil, with a note');
  ok(updates['players/P002/allottedTeam'] === null, 'teams template: the replaced captain goes back into the pool');
}

// batting hand, bowling arm and type
{
  const rows = csv.parseCSV('name,batting_hand,bowling_arm,bowling_type\nA,Right,Left,spin\nB,LHB,,\nC,R,RIGHT,RM\nD,left,none,\n');
  const { players: ps } = csv.importPlayers(rows, R, []);
  const v = Object.values(ps);
  ok(E.battingLabel(v[0]) === 'Right-hand bat' && E.bowlingLabel(v[0]) === 'Left-arm spin' && E.battingLabel(v[1]) === 'Left-hand bat' && !E.bowlingLabel(v[1]) && E.bowlingLabel(v[2]) === 'Right-arm medium' && !E.bowlingLabel(v[3]), 'players: batting hand, bowling arm and type');
  const old = csv.importPlayers(csv.parseCSV('name,batting_style,bowling_style\nE,Left-hand bat,Right-arm off-spin\n'), R, []);
  ok(E.bowlingLabel(Object.values(old.players)[0]) === 'Right-arm off-spin' && E.battingLabel(Object.values(old.players)[0]) === 'Left-hand bat', 'players: older batting_style / bowling_style still read');
}

// A five-slab point chart from the questionnaire: 50 → +10 to 150, +15 to 300, +20 to 500, +25 to 700, +50 above
{
  const ans = [['currency', 'pts'], ['season', '3'], ...[[150, 10], [300, 15], [500, 20], [700, 25], ['', 50]].flatMap(([u, st], i) => [[`increment_${i + 1}_below`, String(u)], [`increment_${i + 1}_raise_by`, String(st)]])];
  const chart = csv.importSetup(ans.map(([key, answer]) => ({ key, answer })), {}, {});
  const r = chart.rules;
  const steps = [50, 140, 150, 290, 300, 490, 500, 690, 700, 1000].map((x) => E.increment(x, r));
  ok(JSON.stringify(steps) === JSON.stringify([10, 10, 15, 15, 20, 20, 25, 25, 50, 50]) && r.currency === 'pts' && chart.meta.season === '3', 'point chart from the questionnaire: five slabs, points, season');
}

// unsold rounds bring players back in the order they first came up
{
  const a = E.normalize({ meta: { round: 2 }, rules: {}, teams: {}, sales: {},
    players: { P1: { name: 'A', category: 'A' }, P2: { name: 'B', category: 'A' }, P3: { name: 'C', category: 'A' } },
    unsold: { P2: { round: 1, at: 100 }, P3: { round: 1, at: 50 }, P1: { round: 1, at: 300, first: 10 } } });
  const order = [];
  for (let i = 0; i < 3; i++) { const p = E.pickNext(a); order.push(p.id); a.unsold[p.id] = { ...a.unsold[p.id], round: 2 }; }
  ok(order.join() === 'P1,P3,P2', `unsold round: original order (${order.join()})`);
}
ok(['waiting', 'Waiting list', 'cancelled', 'Registration cancelled', 'Withdrawn', '', 'x'].map(csv.listOf).join() === 'waiting,waiting,cancelled,cancelled,cancelled,,'
  && !E.inAuction({ name: 'X', list: 'cancelled' }) && E.inAuction({ name: 'X' }), 'list column: waiting / registration cancelled / auction');
{
  const L = [{ id: 'P024', name: 'Aadesh Nichite' }, { id: 'P003', name: 'Abhijeet Limaye' }, { id: 'P046', name: 'Akshay Thakur' }, { id: 'P240', name: 'Aadesh Kumar' }];
  const f = (q) => E.searchPlayers(L, q).map((p) => p.id).join();
  ok(f('24') === 'P024' && f('P024') === 'P024' && f('aadesh') === 'P240,P024' && f('24 aadesh') === 'P024' && f('aadesh 24') === 'P024' && f('thak') === 'P046' && f('3') === 'P003',
    `search by name, number or both (${f('24')} | ${f('aadesh')} | ${f('24 aadesh')})`);
}
{
  // Captain's plan: purse 1000, squad 9 with C + VC allotted, base 50 -> 7 to buy, first max bid 700.
  const PL = await import(root + '/js/plan.js');
  const rules = E.withDefaults({ purse: 1000, squadSize: 9, categories: [{ id: 'A', label: 'Pool A', base: 50 }] });
  const players = { C1: { name: 'Cap', allottedTeam: 'T1', allottedAs: 'C' }, V1: { name: 'Vice', allottedTeam: 'T1', allottedAs: 'VC' } };
  for (let i = 1; i <= 12; i++) players[`P${i}`] = { name: `Player ${i}`, category: 'A', role: 'bat' };
  const a = E.normalize({ meta: { round: 1 }, rules, teams: { T1: { name: 'One' }, T2: { name: 'Two' } }, players,
    sales: { C1: { team: 'T1', price: 250, allotted: true }, V1: { team: 'T1', price: 150, allotted: true } } });
  const now = PL.standing(a, 'T1');
  const before = PL.standing({ ...a, sales: {} }, 'T1'); // before the start: C + VC not in the squad yet
  const plan = PL.planFor(a, 'T1', [{ id: 'P1', max: 300 }, { id: 'P2', max: 200 }, { id: 'P3', max: null }, { id: 'P4', max: 400 }]);
  const w = PL.whatIf(a, 'T1', 'P5', 500, [{ id: 'P1', max: 300 }]);
  ok(now.remaining === 1000 && now.toBuy === 7 && now.maxBid === 700 && before.toBuy === 7 && before.maxBid === 700
    && plan.steps[0].remaining === 700 && plan.steps[0].maxBid === 450 && plan.steps[1].remaining === 500 && plan.steps[2].remaining === 450
    && !plan.steps[3].fits && plan.steps[3].limit === 300 && plan.spend === 550 && plan.left === 450 && plan.restSlots === 4 && plan.spare === 250
    && w.allowed && w.after.remaining === 500 && w.after.maxBid === 250 && w.lost.length === 1,
  `captain plan: leaves ${plan.steps.map((s) => s.fits ? s.remaining : 'x').join(',')}; what-if left ${w.after.remaining}, max ${w.after.maxBid}`);
}
{
  // Past seasons: a record with results becomes a small history entry; team names match across spellings.
  const H = await import(root + '/js/history.js');
  const rec = { format: 'auctionxi/1', meta: { season: '2', tournament: 'Test League' }, rules: { currency: 'pts', purse: 1000 },
    teams: { T1: { name: 'Sinhagad Spartans' }, T2: { name: 'Pratapgadche Mavle' } },
    players: { P1: { name: 'A' }, P2: { name: 'B' }, P3: { name: 'C' } },
    sales: { P1: { team: 'T1', price: 300 }, P2: { team: 'T2', price: 120 }, P3: { team: 'T2', price: 250, allotted: true } },
    results: { champion: 'Pratapgad Mavale', runnerUp: 'Sinhgad Spartans',
      standings: [{ team: 'Sinhgad Spartans', played: 4, won: 4, lost: 0, points: 8, nrr: 1.2, finish: 'Runner-up' }, { team: 'Pratapgad Mavale', played: 4, won: 3, lost: 1, points: 6, finish: 'Champion' }],
      performers: [{ name: 'A', team: 'Sinhgad Spartans', runs: 90, sr: 180, wickets: 2, mvpRank: 2 }, { name: 'B', team: 'Pratapgad Mavale', runs: 40, wickets: 7, economy: 6.5, mvpRank: 1 }] } };
  const h = H.historyFromRecord(rec);
  const past = H.teamPast(h, 'Pratapgadache Mawale');
  ok(h.top.mvp[0].name === 'B' && h.top.runs[0].name === 'A' && h.top.wickets[0].name === 'B' && h.auction.topBuys[0].price === 300 && h.auction.sold === 2
    && past?.finish === 'Champion' && past.won === 3 && H.sameTeam('Sinhagad Spartans', 'Sinhgad Spartans') && !H.sameTeam('Raigad Rakshak', 'Rajgad Yodhas'),
  `past seasons: champion ${past?.finish}, top buy ${h.auction.topBuys[0]?.price}, MVP ${h.top.mvp[0]?.name}`);
}
{
  // Offline pack: the tracker's Auction rows follow the log; an undone sale drops out; nothing sold is missing.
  const { auctionRows } = await import(root + '/js/tracker.js');
  const a = E.normalize({ meta: {}, rules: {}, teams: { T1: { name: 'One' }, T2: { name: 'Two' } },
    players: { P1: { name: 'A' }, P2: { name: 'B' }, P3: { name: 'C' }, P4: { name: 'D' } },
    sales: { P1: { team: 'T1', price: 80, at: 10 }, P3: { team: 'T2', price: 120, at: 60 }, P4: { team: 'T2', price: 50, at: 70 } },
    log: { a: { type: 'sold', playerId: 'P1', team: 'T1', amount: 80, at: 10 }, b: { type: 'unsold', playerId: 'P2', at: 20 },
      c: { type: 'sold', playerId: 'P3', team: 'T1', amount: 100, at: 30 }, d: { type: 'undo', playerId: 'P3', team: 'T1', at: 40 },
      e: { type: 'sold', playerId: 'P3', team: 'T2', amount: 120, at: 60 } } });
  const rows = auctionRows(a).map((r) => `${r.name}:${r.team || '-'}:${r.price}`).join(',');
  ok(rows === 'A:One:80,B:-:,C:Two:120,D:Two:50', `offline pack rows: ${rows}`);
}
{
  // Draft / Ready / Live / Completed, one per auction.
  const st = [{ status: 'setup' }, { status: 'setup', detailsLocked: true }, { status: 'live', detailsLocked: true }, { status: 'completed' }].map(E.stageOf).join(',');
  ok(st === 'draft,ready,live,completed', `auction stages: ${st}`);
}
{
  // No address is built in: nothing in the pages or code points at github.io or a CDN.
  const files = ['index.html', 'admin.html', 'live.html', 'results.html', 'poster.html', ...fs.readdirSync(root + '/js').map((f) => 'js/' + f)];
  const hits = files.filter((f) => /github\.io|gstatic\.com|cdnjs|jsdelivr|unpkg/.test(fs.readFileSync(`${root}/${f}`, 'utf8')));
  ok(!hits.length, `no fixed domain or CDN in the app${hits.length ? `: ${hits.join(', ')}` : ''}`);
}
{
  // Each past season keeps its own captain, vice-captain, owner and sponsor.
  const H = await import(root + '/js/history.js');
  const h = H.historyFromRecord({ format: 'auctionxi/1', meta: { season: '2' }, rules: {},
    teams: { T1: { name: 'Wing A Tigers', owner: 'Mr A' }, T2: { name: 'Wing B Warriors' } },
    players: { P1: { name: 'Kiran', allottedTeam: 'T1', allottedAs: 'C' }, P2: { name: 'Om' } },
    sales: { P1: { team: 'T1', price: 0, allotted: true }, P2: { team: 'T2', price: 90 } },
    results: { teams: [{ team: 'Wing B Warriors', captain: 'Ravi', viceCaptain: 'Sam', sponsor: 'Acme' }] } });
  const p1 = H.peopleText(H.teamPast(h, 'Wing A Tigers'));
  const p2 = H.peopleText(H.teamPast(h, 'Wing B Warriors'));
  ok(p1 === 'Captain Kiran · Owner Mr A' && p2 === 'Captain Ravi · Vice-captain Sam · Sponsor Acme', `season people: ${p1} | ${p2}`);
}
{
  // Room and jump bids must be on the bid steps (CPL-style slabs: 10 below 150, 15 below 300, 20 below 500).
  const rules = E.withDefaults({ increments: [{ upto: 150, step: 10 }, { upto: 300, step: 15 }, { upto: 500, step: 20 }, { upto: 0, step: 50 }] });
  const good = [50, 60, 150, 165, 180, 300, 320].every((x) => E.onLadder(x, 50, rules));
  const bad = [55, 155, 170, 310].every((x) => !E.onLadder(x, 50, rules));
  const msg = E.ladderError(170, 50, rules);
  ok(good && bad && /165.*180/.test(msg), `bid steps: 165/180 ok, 170 not (${msg})`);
}
