// The offline tracker: an Excel workbook to run or shadow the auction by hand, with no app and no
// internet. It follows the layout organisers already know from the CPL sheets (Auction, Live
// Auction, Ranking Board, Teams Summary, Players, one sheet per team) and adds the tournament's
// rules: every total, max bid and check is a formula driven by the Rules sheet, so it recalculates
// as sales are typed. Works in Excel 2010+, Excel online, Google Sheets and LibreOffice.

import { withDefaults, isAllotted, ROLES, roleId, battingLabel, bowlingLabel } from './engine.js';

const GOLD = 'FFF2B84B';
const INK = 'FF14171B';
const INPUT = 'FFFFF6DC'; // cells the organiser types into
const CALC = 'FFF1F3F5'; // formulas: leave alone
const head = { font: { bold: true, color: { argb: INK } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } } };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const RED = { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } }, font: { color: { argb: 'FF9B1C1C' }, bold: true } };
const GREEN = { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDCF3EC' } }, font: { color: { argb: 'FF0B7A62' }, bold: true } };

function header(ws, cols, row = 1) {
  cols.forEach(([h, width], i) => { ws.getColumn(i + 1).width = width; ws.getCell(row, i + 1).value = h; });
  ws.getRow(row).eachCell((c) => { c.font = head.font; c.fill = head.fill; c.alignment = { vertical: 'middle', wrapText: true }; });
  ws.getRow(row).height = 30;
  ws.views = [{ state: 'frozen', ySplit: row }];
}

const f = (formula) => ({ formula });
// A sheet name as Excel wants it in a formula: 'Teams Summary'!A1, 'Rajgad Yodha''s'!A1.
const ref = (name) => `'${name.replace(/'/g, "''")}'`;
// Sheet names: at most 31 characters, none of : \ / ? * [ ], and not starting or ending with '.
const sheetName = (name, used) => {
  let n = String(name).replace(/[:\\/?*[\]]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Team';
  let k = 2;
  while (used.has(n.toLowerCase())) n = `${n.slice(0, 28)} ${k++}`;
  used.add(n.toLowerCase());
  return n;
};

// ExcelJS is passed in: the browser loads vendor/exceljs.min.js, the checks use the npm package.
// opts.placeholders: rule keys (purse, squadSize, playersPerSide) still to be decided; marked in red.
export function buildTracker(ExcelJS, auction, opts = {}) {
  const a = { ...auction, rules: withDefaults(auction.rules) };
  const r = a.rules;
  const cur = r.currency === '₹' ? '₹' : r.currency || '';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AuctionXI';
  wb.calcProperties = { fullCalcOnLoad: true };

  const teams = Object.entries(a.teams);
  const all = Object.entries(a.players);
  const pool = all.filter(([, p]) => !isAllotted(p));
  const leader = (tid, as) => all.find(([, p]) => p.allottedTeam === tid && p.allottedAs === as)?.[1]?.name || '';
  const kept = (tid) => all.filter(([, p]) => p.allottedTeam === tid && p.allottedAs === 'R');
  const POOL_ROWS = Math.max(pool.length + 30, 100); // room to add names in Excel
  const LOTS = Math.max(pool.length * 3, 150);
  const slabs = [...r.increments].sort((x, y) => (x.upto || Infinity) - (y.upto || Infinity));
  const from = slabs.map((s, i) => (i === 0 ? 0 : Number(slabs[i - 1].upto) || 0));
  const TS = ref('Teams Summary');
  const tLast = teams.length + 1;
  const used = new Set(['guide', 'auction', 'live auction', 'ranking board', 'teams summary', 'players', 'rules', 'ladder']);

  /* Sheets in the order the organiser uses them */
  const G = wb.addWorksheet('Guide', { properties: { tabColor: { argb: GOLD } } });
  const K = wb.addWorksheet('Auction', { properties: { tabColor: { argb: GOLD } } });
  const LV = wb.addWorksheet('Live Auction');
  const RB = wb.addWorksheet('Ranking Board');
  const T = wb.addWorksheet('Teams Summary');
  const P = wb.addWorksheet('Players');
  const teamSheets = teams.map(([id, t]) => [id, t, wb.addWorksheet(sheetName(t.name, used))]);
  const R = wb.addWorksheet('Rules');
  const L = wb.addWorksheet('Ladder', { state: 'hidden' });

  /* Guide */
  G.getColumn(1).width = 110;
  [
    [`${a.meta.name || 'Auction'}: offline tracker`, { bold: true, size: 16 }],
    [[a.meta.tournament, a.meta.season && `Season ${a.meta.season}`, a.meta.date, a.meta.time, a.meta.venue].filter(Boolean).join(' · ')],
    [''],
    ['Run the auction by hand, or follow along beside the app. No internet needed.', { bold: true }],
    ['Auction: one row per player brought up. Pick the Player Name and, if sold, the Winning Team and the Sold Price. STATUS fills in by itself.'],
    ['   Leave team and price empty for UNSOLD. Unsold players are brought up again at the end, in the order they first came up.'],
    ['   Check says OK, or what is wrong: below base price, over the team\'s max bid, not a valid bid step, squad full, already sold.'],
    ['   Only rows marked OK count towards points and squads. Fix a red row and it counts.'],
    ['Live Auction: put it on the big screen. It shows the last player entered, SOLD / UNSOLD, and every team\'s points and max bid.'],
    ['   Type the current bid in the yellow cell to see the next valid bid.'],
    ['Ranking Board and Teams Summary: points used and remaining, players bought, still to buy, max bid.'],
    ['Players: everyone in the auction with base price and where they went. Add late names in the empty yellow rows.'],
    ['One sheet per team: captain, vice-captain and every player bought, with prices.'],
    ['Rules: purse, squad size, base prices and bid steps. Yellow cells can be changed; everything recalculates.'],
    [''],
    [`Max bid = points left - (players still to buy - 1) x lowest base price, and never more than the points left${r.maxPlayerPrice ? ` or ${r.maxPlayerPrice}` : ''}.`],
    ['Grey cells are formulas. If one is typed over, copy it again from the row above.'],
  ].forEach(([text, font], i) => { const c = G.getCell(i + 1, 1); c.value = text; if (font) c.font = font; c.alignment = { wrapText: true }; });

  /* Rules: B4 purse, B5 squad, B9 cap, B10 lowest base */
  header(R, [['Setting', 34], ['Value', 18], ['Notes', 70]]);
  const placeholder = { 'Purse per team': 'purse', 'Squad size': 'squadSize', 'Players per side': 'playersPerSide' };
  [
    ['Tournament', [a.meta.tournament, a.meta.season && `Season ${a.meta.season}`].filter(Boolean).join(' ') || a.meta.name || '', ''],
    ['Currency', cur, 'Shown in the notes only; amounts are plain numbers'],
    ['Purse per team', Number(r.purse) || 0, 'A team can have its own budget in Teams Summary (mini auctions)'],
    ['Squad size', Number(r.squadSize) || 0, 'Players every team must own, captain and vice-captain included'],
    ['Players per side', Number(r.playersPerSide) || 0, ''],
    ['Captain value', Number(r.captainPrice) || 0, 'Not taken from the purse'],
    ['Vice-captain value', Number(r.vcPrice) || 0, 'Not taken from the purse'],
    ['Highest price for one player', Number(r.maxPlayerPrice) || 0, '0 = no limit'],
  ].forEach(([k, v, n], i) => {
    const row = R.getRow(i + 2);
    row.values = [k, v, n];
    if (i >= 2) row.getCell(2).fill = fill(INPUT);
    if ((opts.placeholders || []).includes(placeholder[k])) {
      row.getCell(3).value = 'PLACEHOLDER: type the committee\'s number here; everything recalculates';
      row.getCell(3).font = { bold: true, color: { argb: 'FFC0392B' } };
    }
  });
  const poolTop = 23;
  const poolEnd = poolTop + r.categories.length - 1;
  R.getCell('A10').value = 'Lowest base price';
  R.getCell('B10').value = f(`MIN(C${poolTop}:C${poolEnd})`);
  R.getCell('B10').fill = fill(CALC);
  R.getCell('C10').value = 'Used in the max-bid formula';
  R.getCell('A12').value = 'Bid steps';
  R.getCell('A12').font = { bold: true };
  R.getCell('C12').value = 'While the bid is at least "Bid from", the next bid adds "Raise by". Keep "Bid from" in increasing order.';
  R.getRow(13).values = ['Bid from', 'Raise by'];
  R.getRow(13).font = { bold: true };
  slabs.forEach((s, i) => {
    R.getRow(14 + i).values = [from[i], Number(s.step)];
    R.getCell(14 + i, 1).fill = fill(INPUT);
    R.getCell(14 + i, 2).fill = fill(INPUT);
  });
  const slabRange = `Rules!$A$14:$B$${13 + slabs.length}`;
  R.getCell('A21').value = 'Pools';
  R.getCell('A21').font = { bold: true };
  R.getRow(22).values = ['Pool', 'Name', 'Base price'];
  R.getRow(22).font = { bold: true };
  r.categories.forEach((c, i) => {
    R.getRow(poolTop + i).values = [c.id, c.label, Number(c.base) || 0];
    R.getCell(poolTop + i, 3).fill = fill(INPUT);
  });
  const poolRange = `Rules!$A$${poolTop}:$C$${poolEnd}`;

  /* Ladder: every valid bid from the lowest base price up */
  header(L, [['Valid bids', 14]]);
  L.getCell('A2').value = f('Rules!$B$10');
  for (let i = 3; i <= 400; i++) L.getCell(`A${i}`).value = f(`A${i - 1}+VLOOKUP(A${i - 1},${slabRange},2,TRUE)`);

  /* Teams Summary: A team, F total points, H remaining, K still to buy, L max bid, O allotted */
  header(T, [['Team', 26], ['Code', 8], ['Captain', 20], ['Vice-captain', 20], ['Kept', 7], ['Total Points', 11], ['Used', 10], ['Remaining', 11],
    ['Players bought', 10], ['Squad now', 9], ['Still to buy', 9], ['Max bid', 10], ['Ranking', 9], ['Status', 15], ['Allotted', 8]]);
  teams.forEach(([id, t], i) => {
    const n = i + 2;
    T.getRow(n).values = [t.name, t.short || '', leader(id, 'C'), leader(id, 'VC'), kept(id).length];
    T.getCell(`F${n}`).value = t.purse != null && t.purse !== '' ? Number(t.purse) : f('Rules!$B$4');
    T.getCell(`G${n}`).value = f(`SUMIFS(Auction!$C:$C,Auction!$B:$B,A${n},Auction!$D:$D,"SOLD",Auction!$H:$H,"OK")`);
    T.getCell(`H${n}`).value = f(`F${n}-G${n}`);
    T.getCell(`I${n}`).value = f(`COUNTIFS(Auction!$B:$B,A${n},Auction!$D:$D,"SOLD",Auction!$H:$H,"OK")`);
    T.getCell(`O${n}`).value = f(`(C${n}<>"")+(D${n}<>"")+E${n}`);
    T.getCell(`J${n}`).value = f(`O${n}+I${n}`);
    T.getCell(`K${n}`).value = f(`MAX(0,Rules!$B$5-J${n})`);
    T.getCell(`L${n}`).value = f(`IF(K${n}<=0,0,MAX(0,MIN(H${n},H${n}-(K${n}-1)*Rules!$B$10,IF(Rules!$B$9>0,Rules!$B$9,H${n}))))`);
    T.getCell(`M${n}`).value = f(`RANK(H${n},H$2:H$${tLast},0)`);
    T.getCell(`N${n}`).value = f(`IF(K${n}<=0,"Squad full",IF(L${n}<Rules!$B$10,"Points too low","Buying"))`);
    for (const col of 'CDEF') T.getCell(`${col}${n}`).fill = fill(INPUT);
    for (const col of 'GHIJKLMNO') T.getCell(`${col}${n}`).fill = fill(CALC);
    T.getCell(`L${n}`).font = { bold: true };
  });
  T.getColumn('O').hidden = true;
  T.addConditionalFormatting({ ref: `N2:N${tLast}`, rules: [{ type: 'expression', formulae: ['$N2="Points too low"'], style: RED }] });
  const teamNames = `${TS}!$A$2:$A$${tLast}`;

  /* Players: A name, B base price, C sold price, D team, E status */
  header(P, [['Player Name', 26], ['Base Price', 10], ['Sold Price', 10], ['Team', 24], ['Status', 11], ['Role', 14], ['Pool', 8], ['Own base price', 10],
    ['Batting', 15], ['Bowling', 20], ['Locality', 10], ['Notes', 40], ['ID', 7]]);
  for (let i = 0; i < POOL_ROWS; i++) {
    const n = i + 2;
    const entry = pool[i];
    if (entry) {
      const [id, p] = entry;
      P.getCell(`A${n}`).value = p.name;
      P.getCell(`F${n}`).value = ROLES[roleId(p.role)].name;
      P.getCell(`G${n}`).value = p.category || '';
      P.getCell(`H${n}`).value = p.basePrice ?? null;
      P.getCell(`I${n}`).value = battingLabel(p);
      P.getCell(`J${n}`).value = bowlingLabel(p);
      P.getCell(`K${n}`).value = p.locality || '';
      P.getCell(`L${n}`).value = p.notes || '';
      P.getCell(`M${n}`).value = id;
    }
    P.getCell(`B${n}`).value = f(`IF(A${n}="","",IF(H${n}<>"",H${n},IFERROR(VLOOKUP(G${n},${poolRange},3,FALSE),Rules!$B$10)))`);
    P.getCell(`C${n}`).value = f(`IF(A${n}="","",IFERROR(INDEX(Auction!$C:$C,MATCH(A${n}&"|SOLD",Auction!$P:$P,0)),""))`);
    P.getCell(`D${n}`).value = f(`IF(A${n}="","",IFERROR(INDEX(Auction!$B:$B,MATCH(A${n}&"|SOLD",Auction!$P:$P,0)),""))`);
    P.getCell(`E${n}`).value = f(`IF(A${n}="","",IF(D${n}<>"","SOLD",IF(COUNTIF(Auction!$P:$P,A${n}&"|UNSOLD")>0,"UNSOLD",IF(COUNTIF(Auction!$A:$A,A${n})>0,"Check","Available"))))`);
    for (const col of 'AFGH') P.getCell(`${col}${n}`).fill = fill(INPUT);
    for (const col of 'BCDE') P.getCell(`${col}${n}`).fill = fill(CALC);
  }
  P.addConditionalFormatting({ ref: `E2:E${POOL_ROWS + 1}`, rules: [
    { type: 'expression', formulae: ['$E2="SOLD"'], style: GREEN },
    { type: 'expression', formulae: ['$E2="UNSOLD"'], style: RED },
  ] });
  const names = `Players!$A$2:$A$${POOL_ROWS + 1}`;

  /* Auction: A player, B team, C price, D status, E base, F role, G team's max bid, H check.
     Hidden helpers: P player|status, Q team#n (the n-th buy), R points left before, S still to buy before. */
  header(K, [['Player Name', 26], ['Winning Team', 24], ['Sold Price', 11], ['STATUS', 10], ['Base Price', 10], ['Role', 13], ['Team max bid', 12], ['Check', 36],
    [' ', 2], [' ', 2], [' ', 2], [' ', 2], [' ', 2], [' ', 2], [' ', 2], ['key', 4], ['squad key', 4], ['left before', 4], ['to buy before', 4]]);
  for (let n = 2; n <= LOTS + 1; n++) {
    const p = n - 1;
    K.getCell(`A${n}`).dataValidation = { type: 'list', allowBlank: true, formulae: [names], showErrorMessage: false };
    K.getCell(`B${n}`).dataValidation = { type: 'list', allowBlank: true, formulae: [teamNames] };
    K.getCell(`D${n}`).value = f(`IF(A${n}="","",IF(AND(B${n}<>"",N(C${n})>0),"SOLD","UNSOLD"))`);
    K.getCell(`E${n}`).value = f(`IF(A${n}="","",IFERROR(VLOOKUP(A${n},Players!$A:$B,2,FALSE),Rules!$B$10))`);
    K.getCell(`F${n}`).value = f(`IF(A${n}="","",IFERROR(VLOOKUP(A${n},Players!$A:$F,6,FALSE),""))`);
    K.getCell(`R${n}`).value = f(`IF(B${n}="","",IFERROR(INDEX(${TS}!$F:$F,MATCH(B${n},${TS}!$A:$A,0))-SUMIFS(C$1:C${p},B$1:B${p},B${n},D$1:D${p},"SOLD",H$1:H${p},"OK"),""))`);
    K.getCell(`S${n}`).value = f(`IF(B${n}="","",IFERROR(Rules!$B$5-INDEX(${TS}!$O:$O,MATCH(B${n},${TS}!$A:$A,0))-COUNTIFS(B$1:B${p},B${n},D$1:D${p},"SOLD",H$1:H${p},"OK"),""))`);
    K.getCell(`G${n}`).value = f(`IF(OR(B${n}="",R${n}=""),"",IF(S${n}<=0,0,MAX(0,MIN(R${n},R${n}-(S${n}-1)*Rules!$B$10,IF(Rules!$B$9>0,Rules!$B$9,R${n})))))`);
    K.getCell(`H${n}`).value = f(`IF(A${n}="","",IF(COUNTIFS(A$1:A${p},A${n},D$1:D${p},"SOLD",H$1:H${p},"OK")>0,"Already sold in an earlier row",`
      + `IF(D${n}="UNSOLD",IF(OR(B${n}<>"",C${n}<>""),"Sold? Enter both the team and the price","OK"),`
      + `IF(C${n}<E${n},"Below the base price",IF(S${n}<=0,"Squad already full",IF(C${n}>G${n},"Over the team's max bid of "&G${n},`
      + `IF(AND(COUNTIF(Ladder!$A:$A,C${n})=0,C${n}<>E${n}),"Not a valid bid step","OK")))))))`);
    K.getCell(`P${n}`).value = f(`IF(A${n}="","",A${n}&"|"&IF(H${n}="OK",D${n},"check"))`);
    K.getCell(`Q${n}`).value = f(`IF(AND(D${n}="SOLD",H${n}="OK"),B${n}&"#"&COUNTIFS(B$2:B${n},B${n},D$2:D${n},"SOLD",H$2:H${n},"OK"),"")`);
    for (const col of 'ABC') K.getCell(`${col}${n}`).fill = fill(INPUT);
    for (const col of 'DEFGH') K.getCell(`${col}${n}`).fill = fill(CALC);
  }
  for (const col of 'IJKLMNOPQRS') K.getColumn(col).hidden = true;
  K.addConditionalFormatting({ ref: `H2:H${LOTS + 1}`, rules: [
    { type: 'expression', formulae: ['AND($H2<>"",$H2<>"OK")'], style: RED },
    { type: 'expression', formulae: ['$H2="OK"'], style: GREEN },
  ] });
  K.addConditionalFormatting({ ref: `D2:D${LOTS + 1}`, rules: [
    { type: 'expression', formulae: ['$D2="SOLD"'], style: GREEN },
    { type: 'expression', formulae: ['$D2="UNSOLD"'], style: RED },
  ] });

  /* Live Auction: the last row of Auction, big, for the screen */
  LV.getColumn(1).width = 24; LV.getColumn(2).width = 34; LV.getColumn(3).width = 4; LV.getColumn(4).width = 22; LV.getColumn(5).width = 16; LV.getColumn(6).width = 22;
  LV.getCell('A1').value = `${a.meta.name || 'Auction'}`.toUpperCase();
  LV.getCell('A1').font = { bold: true, size: 22 };
  LV.getCell('F1').value = f('IF(B3="","",INDEX(Auction!D:D,COUNTA(Auction!A:A)))');
  LV.getCell('F1').font = { bold: true, size: 26 };
  LV.addConditionalFormatting({ ref: 'F1', rules: [{ type: 'expression', formulae: ['$F$1="SOLD"'], style: GREEN }, { type: 'expression', formulae: ['$F$1="UNSOLD"'], style: RED }] });
  const last = 'COUNTA(Auction!A:A)';
  [
    ['Current Player', `IF(${last}<2,"",IFERROR(INDEX(Auction!A:A,${last}),""))`], // row 1 is the header
    ['Role', `IF(B3="","",INDEX(Auction!F:F,${last}))`],
    ['Base Price', `IF(B3="","",INDEX(Auction!E:E,${last}))`],
    ['Winning Team', `IF(B3="","",INDEX(Auction!B:B,${last})&"")`],
    ['Final Price', `IF(B3="","",IF(INDEX(Auction!D:D,${last})="SOLD",INDEX(Auction!C:C,${last}),""))`],
    ['Check', `IF(B3="","",INDEX(Auction!H:H,${last}))`],
  ].forEach(([k, formula], i) => {
    LV.getCell(3 + i, 1).value = k;
    LV.getCell(3 + i, 1).font = { bold: true, size: 14 };
    LV.getCell(3 + i, 2).value = f(formula);
    LV.getCell(3 + i, 2).font = { bold: true, size: i === 0 ? 20 : 16 };
  });
  LV.getCell('D3').value = 'Bid now (type)';
  LV.getCell('E3').fill = fill(INPUT);
  LV.getCell('E3').font = { bold: true, size: 16 };
  LV.getCell('D4').value = 'Next bid';
  LV.getCell('E4').value = f(`IF(E3="",IF(B5="",Rules!$B$10,B5),E3+VLOOKUP(E3,${slabRange},2,TRUE))`);
  LV.getCell('E4').font = { bold: true, size: 16 };
  LV.getCell('D5').value = 'Then';
  LV.getCell('E5').value = f(`E4+VLOOKUP(E4,${slabRange},2,TRUE)`);
  ['Team', 'Remaining', 'Still to buy', 'Max bid'].forEach((h, i) => { const c = LV.getCell(11, [1, 2, 4, 5][i]); c.value = h; c.font = head.font; c.fill = head.fill; });
  teams.forEach((x, i) => {
    const n = 12 + i;
    const tr = i + 2;
    LV.getCell(n, 1).value = f(`${TS}!A${tr}`);
    LV.getCell(n, 2).value = f(`${TS}!H${tr}`);
    LV.getCell(n, 4).value = f(`${TS}!K${tr}`);
    LV.getCell(n, 5).value = f(`${TS}!L${tr}`);
    LV.getRow(n).font = { size: 14 };
  });

  /* Ranking Board */
  header(RB, [['Team', 26], ['Remaining Points', 16], ['Rank', 8], ['Players', 10], ['Max bid', 10]]);
  teams.forEach((x, i) => {
    const n = i + 2;
    RB.getCell(`A${n}`).value = f(`${TS}!A${n}`);
    RB.getCell(`B${n}`).value = f(`${TS}!H${n}`);
    RB.getCell(`C${n}`).value = f(`${TS}!M${n}`);
    RB.getCell(`D${n}`).value = f(`${TS}!J${n}&" / "&Rules!$B$5`);
    RB.getCell(`E${n}`).value = f(`${TS}!L${n}`);
    RB.getRow(n).font = { size: 14 };
  });

  /* One sheet per team */
  teamSheets.forEach(([id, t, S], i) => {
    const tr = i + 2;
    const team = `${TS}!$A$${tr}`;
    S.getColumn(1).width = 28; S.getColumn(2).width = 12; S.getColumn(3).width = 16;
    S.getCell('A1').value = f(team);
    S.getCell('A1').font = { bold: true, size: 14 };
    [['Total Points', 'F'], ['Used', 'G'], ['Remaining', 'H'], ['Still to buy', 'K'], ['Max bid', 'L']].forEach(([k, col], j) => {
      S.getCell(2 + j, 1).value = k;
      S.getCell(2 + j, 2).value = f(`${TS}!${col}${tr}`);
    });
    header(S, [['Player Name', 28], ['Price', 12], ['Role', 16]], 8);
    S.views = [{ state: 'frozen', ySplit: 8 }];
    S.getCell('A9').value = f(`IF(${TS}!C${tr}="","","C: "&${TS}!C${tr})`);
    S.getCell('A10').value = f(`IF(${TS}!D${tr}="","","VC: "&${TS}!D${tr})`);
    S.getCell('A11').value = kept(id).length ? `Kept: ${kept(id).map(([, p]) => p.name).join(', ')}` : '';
    const rows = Math.max(Number(r.squadSize) || 0, 1) + 5;
    for (let k = 1; k <= rows; k++) {
      const n = 11 + k;
      const m = `MATCH(${team}&"#"&${k},Auction!$Q:$Q,0)`;
      S.getCell(`A${n}`).value = f(`IFERROR(INDEX(Auction!$A:$A,${m}),"")`);
      S.getCell(`B${n}`).value = f(`IFERROR(INDEX(Auction!$C:$C,${m}),"")`);
      S.getCell(`C${n}`).value = f(`IFERROR(INDEX(Auction!$F:$F,${m}),"")`);
    }
  });

  wb.views = [{ activeTab: 1 }]; // open on Auction
  return wb;
}

// In the browser: load the bundled ExcelJS once and download the workbook.
export async function downloadTracker(auction, fileName) {
  if (!window.ExcelJS) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/exceljs.min.js', import.meta.url).href;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the Excel library'));
      document.head.append(s);
    });
  }
  const buf = await buildTracker(window.ExcelJS, auction).xlsx.writeBuffer();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}
