// The offline tracker: an Excel workbook to run or shadow the auction by hand, with no app and no
// internet. Teams, captains, purses and the player pool come from the auction; every number after
// that (spent, purse left, still to buy, max bid, valid bid steps, squads) is an Excel formula
// driven by the Rules sheet, so it follows the tournament's rules as entries are typed.
// Works in Excel 2010+, Excel online, Google Sheets and LibreOffice.

import { withDefaults, isAllotted, ROLES, roleId, battingLabel, bowlingLabel } from './engine.js';

const GOLD = 'FFF2B84B';
const INK = 'FF14171B';
const INPUT = 'FFFFF6DC'; // cells the organiser types into
const CALC = 'FFF1F3F5'; // formulas: leave alone
const head = { font: { bold: true, color: { argb: INK } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } } };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function header(ws, cols) {
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  ws.getRow(1).eachCell((c) => { c.font = head.font; c.fill = head.fill; c.alignment = { vertical: 'middle', wrapText: true }; });
  ws.getRow(1).height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

const f = (formula) => ({ formula });

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
  const leaders = (tid, as) => all.find(([, p]) => p.allottedTeam === tid && p.allottedAs === as)?.[1]?.name || '';
  const kept = (tid) => all.filter(([, p]) => p.allottedTeam === tid && p.allottedAs === 'R');
  const POOL_ROWS = Math.max(pool.length + 40, 120); // room to add names in Excel
  const LOTS = Math.max(pool.length * 2, 150);
  const slabs = [...r.increments].sort((x, y) => (x.upto || Infinity) - (y.upto || Infinity));
  const from = slabs.map((s, i) => (i === 0 ? 0 : Number(slabs[i - 1].upto) || 0));

  /* Guide */
  const g = wb.addWorksheet('Guide', { properties: { tabColor: { argb: GOLD } } });
  g.getColumn(1).width = 110;
  [
    [`${a.meta.name || 'Auction'}: offline tracker`, { bold: true, size: 16 }],
    [[a.meta.tournament, a.meta.season && `Season ${a.meta.season}`, a.meta.date, a.meta.time, a.meta.venue].filter(Boolean).join(' · ')],
    [''],
    ['Use it to run the auction by hand, or to follow along beside the app. It needs no internet.', { bold: true }],
    ['1. Rules: check the purse, squad size, base prices and bid steps. Yellow cells can be changed; everything else recalculates.'],
    ['2. Teams: captains and vice-captains are already in their teams. Purse left, still to buy and max bid update by themselves.'],
    ['3. Players: the auction pool. Add late registrations in the empty yellow rows.'],
    ['4. Tracker: one row per player brought up. Pick the player, choose Sold or Unsold, the team and the final price.'],
    ['   The Check column says OK, or what is wrong: below base price, over the team\'s max bid, not a valid bid step, squad full, already sold.'],
    ['   Only rows marked OK count towards purses and squads. Fix a red row and it counts.'],
    ['5. Squads: every team\'s players fill in as they are sold.'],
    ['6. Calculator: type the current bid to see the next valid bids.'],
    [''],
    [`Max bid = purse left - (players still to buy - 1) x lowest base price, and never more than the purse left${r.maxPlayerPrice ? ` or ${r.maxPlayerPrice}` : ''}.`],
    ['Formula cells are grey. Do not type over them; if one is overwritten, copy it again from the row above.'],
  ].forEach(([text, font], i) => { const c = g.getCell(i + 1, 1); c.value = text; if (font) c.font = font; c.alignment = { wrapText: true }; });

  /* Rules */
  const R = wb.addWorksheet('Rules');
  header(R, [['Setting', 34], ['Value', 18], ['Notes', 70]]);
  const settings = [
    ['Tournament', [a.meta.tournament, a.meta.season && `Season ${a.meta.season}`].filter(Boolean).join(' ') || a.meta.name || '', ''],
    ['Currency', cur, 'Shown in the notes only; amounts are plain numbers'],
    ['Purse per team', Number(r.purse) || 0, 'A team can have its own budget in Teams (mini auctions)'],
    ['Squad size', Number(r.squadSize) || 0, 'Players every team must own, captain and vice-captain included'],
    ['Players per side', Number(r.playersPerSide) || 0, ''],
    ['Captain value', Number(r.captainPrice) || 0, 'Not taken from the purse'],
    ['Vice-captain value', Number(r.vcPrice) || 0, 'Not taken from the purse'],
    ['Highest price for one player', Number(r.maxPlayerPrice) || 0, '0 = no limit'],
  ];
  const placeholder = { 'Purse per team': 'purse', 'Squad size': 'squadSize', 'Players per side': 'playersPerSide' };
  settings.forEach(([k, v, n], i) => {
    const row = R.getRow(i + 2);
    row.values = [k, v, n];
    if (i >= 2) row.getCell(2).fill = fill(INPUT);
    if ((opts.placeholders || []).includes(placeholder[k])) {
      row.getCell(3).value = 'PLACEHOLDER: type the committee\'s number here; everything recalculates';
      row.getCell(3).font = { bold: true, color: { argb: 'FFC0392B' } };
    }
  });
  // B4 purse, B5 squad, B9 cap, B10 lowest base
  R.getCell('A10').value = 'Lowest base price';
  R.getCell('C10').value = 'Used in the max-bid formula';
  const poolTop = 23;
  const poolEnd = poolTop + r.categories.length - 1;
  R.getCell('B10').value = f(`MIN(C${poolTop}:C${poolEnd})`);
  R.getCell('B10').fill = fill(CALC);

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
  const L = wb.addWorksheet('Ladder', { state: 'hidden' });
  header(L, [['Valid bids', 14]]);
  L.getCell('A2').value = f('Rules!$B$10');
  for (let i = 3; i <= 400; i++) L.getCell(`A${i}`).value = f(`A${i - 1}+VLOOKUP(A${i - 1},${slabRange},2,TRUE)`);

  /* Teams */
  const T = wb.addWorksheet('Teams');
  header(T, [['Team ID', 9], ['Team', 26], ['Code', 8], ['Captain', 20], ['Vice-captain', 20], ['Kept players', 10], ['Purse', 11], ['Spent', 11], ['Purse left', 11],
    ['Bought', 9], ['Squad now', 10], ['Still to buy', 10], ['Max bid', 11], ['Status', 16], ['Allotted', 9]]);
  teams.forEach(([id, t], i) => {
    const n = i + 2;
    T.getRow(n).values = [id, t.name, t.short || '', leaders(id, 'C'), leaders(id, 'VC'), kept(id).length];
    T.getCell(`G${n}`).value = t.purse != null && t.purse !== '' ? Number(t.purse) : f('Rules!$B$4');
    T.getCell(`H${n}`).value = f(`SUMIFS(Tracker!$H:$H,Tracker!$G:$G,B${n},Tracker!$F:$F,"Sold",Tracker!$J:$J,"OK")`);
    T.getCell(`I${n}`).value = f(`G${n}-H${n}`);
    T.getCell(`J${n}`).value = f(`COUNTIFS(Tracker!$G:$G,B${n},Tracker!$F:$F,"Sold",Tracker!$J:$J,"OK")`);
    T.getCell(`O${n}`).value = f(`(D${n}<>"")+(E${n}<>"")+F${n}`);
    T.getCell(`K${n}`).value = f(`O${n}+J${n}`);
    T.getCell(`L${n}`).value = f(`MAX(0,Rules!$B$5-K${n})`);
    T.getCell(`M${n}`).value = f(`IF(L${n}<=0,0,MAX(0,MIN(I${n},I${n}-(L${n}-1)*Rules!$B$10,IF(Rules!$B$9>0,Rules!$B$9,I${n}))))`);
    T.getCell(`N${n}`).value = f(`IF(L${n}<=0,"Squad full",IF(M${n}<Rules!$B$10,"Purse too low","Buying"))`);
    for (const col of 'DEFG') T.getCell(`${col}${n}`).fill = fill(INPUT);
    for (const col of 'HIJKLMNO') T.getCell(`${col}${n}`).fill = fill(CALC);
    T.getCell(`M${n}`).font = { bold: true };
  });
  const tLast = teams.length + 1;
  const teamNames = `Teams!$B$2:$B$${tLast}`;
  T.getCell(`A${tLast + 2}`).value = 'Kept players: players a team keeps from last season (mini auction), besides the captain and vice-captain.';

  /* Players */
  const P = wb.addWorksheet('Players');
  header(P, [['ID', 8], ['Name', 26], ['Role', 14], ['Pool', 8], ['Own base price', 11], ['Base price', 11], ['Batting', 16], ['Bowling', 20], ['Age', 6],
    ['Locality', 14], ['Notes', 28], ['Status', 11], ['Sold to', 22], ['Price', 10]]);
  for (let i = 0; i < POOL_ROWS; i++) {
    const n = i + 2;
    const entry = pool[i];
    if (entry) {
      const [id, p] = entry;
      P.getRow(n).values = [id, p.name, ROLES[roleId(p.role)].name, p.category || '', p.basePrice ?? null, null, battingLabel(p), bowlingLabel(p), p.age ?? null, p.locality || '', p.notes || ''];
    }
    P.getCell(`F${n}`).value = f(`IF(B${n}="","",IF(E${n}<>"",E${n},IFERROR(VLOOKUP(D${n},${poolRange},3,FALSE),Rules!$B$10)))`);
    P.getCell(`M${n}`).value = f(`IF(B${n}="","",IFERROR(INDEX(Tracker!$G:$G,MATCH(B${n}&"|Sold",Tracker!$P:$P,0)),""))`);
    P.getCell(`N${n}`).value = f(`IF(M${n}="","",INDEX(Tracker!$H:$H,MATCH(B${n}&"|Sold",Tracker!$P:$P,0)))`);
    P.getCell(`L${n}`).value = f(`IF(B${n}="","",IF(M${n}<>"","Sold",IF(COUNTIFS(Tracker!$B:$B,B${n},Tracker!$P:$P,B${n}&"|Unsold")>0,"Unsold",IF(COUNTIF(Tracker!$B:$B,B${n})>0,"Check tracker","Available"))))`);
    for (const col of 'BCDE') P.getCell(`${col}${n}`).fill = fill(INPUT);
    for (const col of 'FLMN') P.getCell(`${col}${n}`).fill = fill(CALC);
  }
  const names = `Players!$B$2:$B$${POOL_ROWS + 1}`;

  /* Tracker */
  const K = wb.addWorksheet('Tracker', { properties: { tabColor: { argb: GOLD } } });
  header(K, [['Lot', 6], ['Player', 26], ['Role', 13], ['Pool', 7], ['Base price', 10], ['Result', 10], ['Team', 24], ['Final price', 11], ['Team max bid', 12], ['Check', 34],
    [' ', 2], [' ', 2], [' ', 2], [' ', 2], [' ', 2], ['key', 4], ['squad key', 4], ['left before', 4], ['to buy before', 4]]);
  for (let n = 2; n <= LOTS + 1; n++) {
    const p = n - 1;
    K.getCell(`A${n}`).value = n - 1;
    K.getCell(`B${n}`).dataValidation = { type: 'list', allowBlank: true, formulae: [names], showErrorMessage: false };
    K.getCell(`F${n}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Sold,Unsold"'] };
    K.getCell(`G${n}`).dataValidation = { type: 'list', allowBlank: true, formulae: [teamNames] };
    K.getCell(`C${n}`).value = f(`IF(B${n}="","",IFERROR(VLOOKUP(B${n},Players!$B:$D,2,FALSE),""))`);
    K.getCell(`D${n}`).value = f(`IF(B${n}="","",IFERROR(VLOOKUP(B${n},Players!$B:$D,3,FALSE),""))`);
    K.getCell(`E${n}`).value = f(`IF(B${n}="","",IFERROR(VLOOKUP(B${n},Players!$B:$F,5,FALSE),Rules!$B$10))`);
    K.getCell(`P${n}`).value = f(`IF(B${n}="","",B${n}&"|"&IF(J${n}="OK",F${n},"check"))`);
    K.getCell(`Q${n}`).value = f(`IF(AND(F${n}="Sold",G${n}<>"",J${n}="OK"),G${n}&"#"&COUNTIFS(G$2:G${n},G${n},F$2:F${n},"Sold",J$2:J${n},"OK"),"")`);
    K.getCell(`R${n}`).value = f(`IF(G${n}="","",IFERROR(INDEX(Teams!$G:$G,MATCH(G${n},Teams!$B:$B,0))-SUMIFS(H$1:H${p},G$1:G${p},G${n},F$1:F${p},"Sold",J$1:J${p},"OK"),""))`);
    K.getCell(`S${n}`).value = f(`IF(G${n}="","",IFERROR(Rules!$B$5-INDEX(Teams!$O:$O,MATCH(G${n},Teams!$B:$B,0))-COUNTIFS(G$1:G${p},G${n},F$1:F${p},"Sold",J$1:J${p},"OK"),""))`);
    K.getCell(`I${n}`).value = f(`IF(OR(G${n}="",R${n}=""),"",IF(S${n}<=0,0,MAX(0,MIN(R${n},R${n}-(S${n}-1)*Rules!$B$10,IF(Rules!$B$9>0,Rules!$B$9,R${n})))))`);
    K.getCell(`J${n}`).value = f(`IF(B${n}="","",IF(COUNTIFS(B$1:B${p},B${n},F$1:F${p},"Sold",J$1:J${p},"OK")>0,"Already sold in an earlier lot",IF(F${n}="","Choose Sold or Unsold",`
      + `IF(F${n}="Unsold",IF(OR(G${n}<>"",H${n}<>""),"Unsold: clear the team and price","OK"),IF(G${n}="","Choose the team",IF(H${n}="","Enter the final price",`
      + `IF(H${n}<E${n},"Below the base price",IF(S${n}<=0,"Squad already full",IF(H${n}>I${n},"Over the team's max bid of "&I${n},`
      + `IF(AND(COUNTIF(Ladder!$A:$A,H${n})=0,H${n}<>E${n}),"Not a valid bid step","OK"))))))))))`);
    for (const col of 'BFGH') K.getCell(`${col}${n}`).fill = fill(INPUT);
    for (const col of 'CDEIJ') K.getCell(`${col}${n}`).fill = fill(CALC);
  }
  for (const col of 'KLMNOPQRS') K.getColumn(col).hidden = true;
  K.addConditionalFormatting({
    ref: `J2:J${LOTS + 1}`,
    rules: [
      { type: 'expression', formulae: ['AND($J2<>"",$J2<>"OK")'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } }, font: { color: { argb: 'FF9B1C1C' }, bold: true } } },
      { type: 'expression', formulae: ['$J2="OK"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDCF3EC' } }, font: { color: { argb: 'FF0B7A62' } } } },
    ],
  });
  T.addConditionalFormatting({
    ref: `N2:N${tLast}`,
    rules: [{ type: 'expression', formulae: ['$N2="Purse too low"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8D7DA' } } } }],
  });

  /* Squads */
  const S = wb.addWorksheet('Squads');
  S.getColumn(1).width = 14;
  S.getCell('A1').value = 'Team';
  const rows = Math.max(Number(r.squadSize) || 0, 1) + 4;
  teams.forEach(([id], i) => {
    const col = i + 2;
    const tr = i + 2; // row on Teams
    S.getColumn(col).width = 26;
    S.getCell(1, col).value = f(`Teams!B${tr}`);
    S.getCell(2, col).value = f(`IF(Teams!D${tr}="","","C: "&Teams!D${tr})`);
    S.getCell(3, col).value = f(`IF(Teams!E${tr}="","","VC: "&Teams!E${tr})`);
    S.getCell(4, col).value = kept(id).map(([, p]) => p.name).join(', ') ? `Kept: ${kept(id).map(([, p]) => p.name).join(', ')}` : '';
    const L1 = S.getColumn(1).letter;
    for (let k = 1; k <= rows; k++) {
      const rr = 4 + k;
      const c = S.getCell(rr, col).address.replace(/\d+$/, '');
      const key = `${c}$1&"#"&$${L1}${rr}`;
      S.getCell(rr, col).value = f(`IFERROR(INDEX(Tracker!$B:$B,MATCH(${key},Tracker!$Q:$Q,0))&"  ("&INDEX(Tracker!$H:$H,MATCH(${key},Tracker!$Q:$Q,0))&")","")`);
    }
    const sum = 5 + rows;
    S.getCell(sum, col).value = f(`"Spent "&Teams!H${tr}&" · left "&Teams!I${tr}`);
    S.getCell(sum + 1, col).value = f(`"To buy "&Teams!L${tr}&" · max bid "&Teams!M${tr}`);
    S.getCell(sum + 1, col).font = { bold: true };
  });
  S.getCell('A2').value = 'Captain';
  S.getCell('A3').value = 'Vice-captain';
  for (let k = 1; k <= rows; k++) S.getCell(4 + k, 1).value = k;
  S.getCell(5 + rows, 1).value = 'Purse';
  S.getRow(1).eachCell((c) => { c.font = head.font; c.fill = head.fill; });
  S.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  /* Calculator */
  const C = wb.addWorksheet('Calculator');
  C.getColumn(1).width = 28; C.getColumn(2).width = 14;
  C.getCell('A1').value = 'Current bid (type here)';
  C.getCell('B1').fill = fill(INPUT);
  C.getCell('A2').value = 'Next bid';
  C.getCell('B2').value = f(`IF(B1="",Rules!$B$10,B1+VLOOKUP(B1,${slabRange},2,TRUE))`);
  C.getCell('B2').font = { bold: true, size: 14 };
  C.getCell('A4').value = 'The bids after that';
  for (let k = 0; k < 12; k++) C.getCell(5 + k, 2).value = f(k === 0 ? `B2+VLOOKUP(B2,${slabRange},2,TRUE)` : `B${4 + k}+VLOOKUP(B${4 + k},${slabRange},2,TRUE)`);

  wb.views = [{ activeTab: 5 }]; // open on the Tracker
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
