// The offline slide deck: a PowerPoint of one auction to present by hand, with no app or internet.
// Cover (banner, logo), format and rules, the bid steps, house rules, teams with captains, a
// clickable players index (jump to whoever the chit names), one slide per player grouped by pool
// with the next valid bids, and squad slides once players are sold.
// Opens in PowerPoint, Keynote, Google Slides and LibreOffice.

import {
  withDefaults, ROLES, roleId, battingLabel, bowlingLabel, money, basePrice, category, minBase,
  hasVC, vcCanBid, increment, leadersOf, inAuction, isWaiting,
} from './engine.js';

const C = { bg: '0D0F12', surface: '15181D', raised: '1D2128', line: '2A3038', ink: 'F3F1EC', muted: 'A3AAB3', gold: 'F2B84B', sold: '3DD6B0' };
const FONT = 'Arial';
const W = 13.333;
const H = 7.5;

// Width and height of a PNG or JPEG data URL (to fit pictures without stretching them).
export function imageSize(dataUrl) {
  try {
    const b64 = String(dataUrl).split(',')[1] || '';
    const bin = typeof atob === 'function' ? atob(b64.slice(0, 120000)) : Buffer.from(b64.slice(0, 120000), 'base64').toString('binary');
    const at = (i) => bin.charCodeAt(i);
    if (at(0) === 0x89 && bin.slice(1, 4) === 'PNG') return { w: (at(16) << 24 | at(17) << 16 | at(18) << 8 | at(19)) >>> 0, h: (at(20) << 24 | at(21) << 16 | at(22) << 8 | at(23)) >>> 0 };
    if (at(0) === 0xff && at(1) === 0xd8) {
      let i = 2;
      while (i < bin.length) {
        if (at(i) !== 0xff) { i++; continue; }
        const m = at(i + 1);
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: at(i + 5) << 8 | at(i + 6), w: at(i + 7) << 8 | at(i + 8) };
        i += 2 + (at(i + 2) << 8 | at(i + 3));
      }
    }
  } catch { /* fall through */ }
  return null;
}

// Fit a picture inside a box, centred, keeping its shape.
function fit(data, box) {
  const s = imageSize(data);
  if (!s || !s.w || !s.h) return { ...box };
  const k = Math.min(box.w / s.w, box.h / s.h);
  const w = s.w * k;
  const h = s.h * k;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

const initials = (name) => String(name || '?').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const num = (n) => Number(n).toLocaleString('en-IN');
const chunk = (list, n) => list.reduce((out, x, i) => { if (i % n === 0) out.push([]); out[out.length - 1].push(x); return out; }, []);

// PptxGenJS is passed in: the browser loads vendor/pptxgen.bundle.js, the checks use the npm package.
export function buildDeck(PptxGenJS, auction) {
  const a = { ...auction, rules: withDefaults(auction.rules) };
  const r = a.rules;
  const m = a.meta || {};
  const media = a.media || {};
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = m.name || 'Auction';
  pptx.company = 'AuctionXI';
  const footer = [m.tournament, m.season && `Season ${m.season}`].filter(Boolean).join(' · ') || m.name || '';
  pptx.defineSlideMaster({
    title: 'AX',
    background: { color: C.bg },
    objects: [{ text: { text: footer, options: { x: 0.5, y: H - 0.45, w: 8, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted } } }],
    slideNumber: { x: W - 1.0, y: H - 0.45, w: 0.5, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted, align: 'right' },
  });
  const slide = () => pptx.addSlide({ masterName: 'AX' });
  const eyebrow = (s, text, y = 0.45) => s.addText(text.toUpperCase(), { x: 0.6, y, w: 9, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.gold, charSpacing: 3 });
  const title = (s, text, y = 0.8, size = 34) => s.addText(text, { x: 0.6, y, w: W - 1.2, h: 0.8, fontFace: FONT, fontSize: size, bold: true, color: C.ink });
  const logo = (s, box) => { if (media.logo) s.addImage({ data: media.logo, ...fit(media.logo, box) }); };
  const card = (s, x, y, w, h, fillColor = C.surface) => s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fillColor }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
  const amt = (n) => money(n, r);

  const teams = Object.entries(a.teams);
  const pool = Object.entries(a.players).filter(([, p]) => inAuction(p));
  const waiting = Object.entries(a.players).filter(([, p]) => isWaiting(p)).sort(([, x], [, y]) => x.name.localeCompare(y.name));
  const catIndex = (id) => { const i = r.categories.findIndex((c) => c.id === id); return i < 0 ? 99 : i; };
  pool.sort(([, x], [, y]) => catIndex(x.category) - catIndex(y.category) || x.name.localeCompare(y.name));
  const pools = r.categories.filter((c) => pool.some(([, p]) => p.category === c.id));
  const houseRules = (r.houseRules || []).filter((h) => h.a);
  const hrSlides = chunk(houseRules, 6);
  const idxSlides = chunk([...pool, ...waiting], 30);
  const teamSlides = chunk(teams, 8);
  // Slide numbers, so the index can link to each player.
  let next = 1 + 1 + 1 + hrSlides.length + teamSlides.length; // cover, rules, bid steps, house rules, teams
  const indexAt = next + 1;
  next += idxSlides.length;
  const slideOf = {};
  for (const c of pools) {
    next += 1; // pool divider
    for (const [id, p] of pool) if (p.category === c.id) slideOf[id] = ++next;
  }
  for (const [id] of pool) if (!slideOf[id]) slideOf[id] = ++next; // a player in no known pool
  const idxPage = (id) => Math.max(0, idxSlides.findIndex((part) => part.some(([x]) => x === id))); // the index page listing this player
  if (waiting.length) { next += 1; for (const [id] of waiting) slideOf[id] = ++next; } // divider, then the waiting list

  /* 1. Cover */
  {
    const s = pptx.addSlide();
    s.background = { color: C.bg };
    const hasBanner = !!media.banner;
    if (hasBanner) s.addImage({ data: media.banner, ...fit(media.banner, { x: 0.6, y: 0.4, w: W - 1.2, h: 4.4 }) });
    logo(s, { x: 0.6, y: hasBanner ? 5.0 : 0.6, w: 1.6, h: 1.6 });
    const tx = media.logo ? 2.5 : 0.6;
    s.addText(m.name || 'Player auction', { x: tx, y: hasBanner ? 4.95 : 2.4, w: W - tx - 0.6, h: 1.0, fontFace: FONT, fontSize: hasBanner ? 34 : 48, bold: true, color: C.ink });
    s.addText([m.tournament, m.season && `Season ${m.season}`].filter(Boolean).join(' · '), { x: tx, y: hasBanner ? 5.85 : 3.5, w: W - tx - 0.6, h: 0.5, fontFace: FONT, fontSize: 20, color: C.gold });
    s.addText([m.date, m.time, m.venue].filter(Boolean).join(' · '), { x: tx, y: hasBanner ? 6.35 : 4.1, w: W - tx - 0.6, h: 0.5, fontFace: FONT, fontSize: 16, color: C.muted });
  }

  /* 2. Format and rules */
  {
    const s = slide();
    eyebrow(s, 'Format and rules');
    title(s, 'How this auction works');
    const leadersN = hasVC(r) ? 2 : 1;
    const toBuy = Math.max(0, r.squadSize - leadersN);
    const base = minBase(r);
    const firstMax = toBuy ? Math.max(0, Math.min(r.purse, r.purse - (toBuy - 1) * base)) : 0;
    const res = Math.max(0, r.squadSize - r.playersPerSide);
    const lines = [
      ['Format', `${r.playersPerSide}-a-side${r.overs ? `, ${r.overs} overs` : ''}. Every team buys exactly ${r.squadSize} players${res ? ` (${res} reserve${res === 1 ? '' : 's'})` : ''}, ${hasVC(r) ? 'captain and vice-captain' : 'captain'} included`],
      ['Purse', `${amt(r.purse)} per team, only for buying players`],
      [hasVC(r) ? 'Captain and vice-captain' : 'Captain', `Already in their teams, never auctioned. Value ${amt(r.captainPrice)}${hasVC(r) ? ` / ${amt(r.vcPrice)}` : ''}, not taken from the purse`],
      ['Base price', pools.length > 1 || r.categories.length > 1 ? r.categories.map((c) => `${c.label} ${amt(c.base)}`).join(' · ') : amt(base)],
      ['Who bids', vcCanBid(r) ? 'Captain or vice-captain' : 'Captain'],
      ['Max bid', `Purse left - (players still to buy - 1) x ${amt(base)}. At the start: ${amt(r.purse)} - ${toBuy - 1} x ${amt(base)} = ${amt(firstMax)}${r.maxPlayerPrice ? `. No player above ${amt(r.maxPlayerPrice)}` : ''}`],
    ];
    s.addTable(lines.map(([k, v]) => [
      { text: k, options: { bold: true, color: C.gold, fontSize: 18 } },
      { text: v, options: { color: C.ink, fontSize: 18 } },
    ]), { x: 0.6, y: 1.8, w: W - 1.2, colW: [3.2, W - 4.4], fontFace: FONT, border: { type: 'solid', color: C.line, pt: 0.75 }, fill: { color: C.surface }, margin: 0.12, valign: 'middle' });
  }

  /* 3. Bid steps */
  {
    const s = slide();
    eyebrow(s, 'Bid steps');
    title(s, 'How much each bid goes up');
    const slabs = [...r.increments].sort((x, y) => (x.upto || Infinity) - (y.upto || Infinity));
    const rows = slabs.map((sl, i) => {
      const lo = i === 0 ? minBase(r) : Number(slabs[i - 1].upto);
      return [
        { text: sl.upto ? `${amt(lo)} to ${amt(sl.upto)}` : `${amt(lo)} and above`, options: { color: C.ink } },
        { text: `+ ${amt(sl.step)}`, options: { color: C.gold, bold: true, align: 'right' } },
      ];
    });
    s.addTable([[{ text: 'Current bid', options: { bold: true, color: C.muted } }, { text: 'Next bid adds', options: { bold: true, color: C.muted, align: 'right' } }], ...rows],
      { x: 0.6, y: 1.8, w: 6.2, colW: [4.0, 2.2], fontFace: FONT, fontSize: 22, border: { type: 'solid', color: C.line, pt: 0.75 }, fill: { color: C.surface }, margin: 0.14 });
    const ladder = [minBase(r)];
    while (ladder.length < 36) ladder.push(ladder.at(-1) + increment(ladder.at(-1), r));
    s.addText(`The bids, in order${/^[a-z]/i.test(r.currency) ? ` (${r.currency})` : ''}`, { x: 7.3, y: 1.8, w: 5.4, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.muted });
    s.addTable(chunk(ladder, 6).map((row) => row.map((x) => ({ text: num(x), options: { align: 'center', color: C.ink } }))),
      { x: 7.3, y: 2.25, w: 5.4, fontFace: FONT, fontSize: 16, border: { type: 'solid', color: C.line, pt: 0.5 }, fill: { color: C.surface }, margin: 0.06 });
  }

  /* 4. House rules */
  hrSlides.forEach((part, i) => {
    const s = slide();
    eyebrow(s, `House rules${hrSlides.length > 1 ? ` (${i + 1}/${hrSlides.length})` : ''}`);
    title(s, 'Our rules');
    s.addText(part.map((h) => ({ text: h.q ? `${h.q}  ${h.a}` : h.a, options: { bullet: { code: '25A0' }, color: C.ink, paraSpaceAfter: 10 } })),
      { x: 0.6, y: 1.8, w: W - 1.2, h: H - 2.6, fontFace: FONT, fontSize: 18, valign: 'top' });
  });

  /* 5. Teams */
  teamSlides.forEach((part, i) => {
    const s = slide();
    eyebrow(s, `Teams${teamSlides.length > 1 ? ` (${i + 1}/${teamSlides.length})` : ''}`);
    title(s, `${teams.length} teams`);
    const cols = Math.min(4, part.length);
    const cw = (W - 1.2 - (cols - 1) * 0.25) / cols;
    const ch = 2.35;
    part.forEach(([id, t], k) => {
      const x = 0.6 + (k % cols) * (cw + 0.25);
      const y = 1.85 + Math.floor(k / cols) * (ch + 0.25);
      card(s, x, y, cw, ch);
      s.addShape(pptx.ShapeType.rect, { x, y: y + 0.15, w: 0.08, h: ch - 0.3, fill: { color: String(t.color || C.gold).replace('#', '').slice(0, 6) }, line: { color: String(t.color || C.gold).replace('#', '').slice(0, 6) } });
      const l = leadersOf(a, id);
      const kept = Object.values(a.players).filter((p) => p.allottedTeam === id && p.allottedAs === 'R').map((p) => p.name);
      s.addText([
        { text: t.name, options: { fontSize: 18, bold: true, color: C.ink, breakLine: true } },
        { text: (t.short || '').toUpperCase(), options: { fontSize: 11, color: C.gold, bold: true, charSpacing: 2, breakLine: true } },
        { text: `C: ${l.C?.name || t.captainName || '—'}`, options: { fontSize: 14, color: C.ink, breakLine: true } },
        ...(hasVC(r) ? [{ text: `VC: ${l.VC?.name || t.vcName || '—'}`, options: { fontSize: 14, color: C.ink, breakLine: true } }] : []),
        ...(kept.length ? [{ text: `Kept: ${kept.join(', ')}`, options: { fontSize: 11, color: C.muted, breakLine: true } }] : []),
        { text: `Purse ${amt(t.purse != null && t.purse !== '' ? t.purse : r.purse)}`, options: { fontSize: 12, color: C.muted } },
      ], { x: x + 0.25, y: y + 0.12, w: cw - 0.4, h: ch - 0.24, fontFace: FONT, valign: 'top', paraSpaceAfter: 3 });
    });
  });

  /* 6. Players index: click a name to jump to the player */
  idxSlides.forEach((part, i) => {
    const s = slide();
    eyebrow(s, `Players${idxSlides.length > 1 ? ` (${i + 1}/${idxSlides.length})` : ''}`);
    title(s, `${pool.length} players in the auction${waiting.length ? ` and ${waiting.length} on the waiting list` : ''}`, 0.8, 24);
    s.addText('In the slide show, click a name, or type its slide number and press Enter.', { x: 0.6, y: 1.45, w: W - 1.2, h: 0.3, fontFace: FONT, fontSize: 12, color: C.muted });
    // One box per player, so the whole row is clickable (in the slide show).
    part.forEach(([id, p], k) => {
      const x = 0.6 + Math.floor(k / 10) * 4.1;
      const y = 1.85 + (k % 10) * 0.47;
      const link = { slide: slideOf[id], tooltip: `Go to ${p.name}` };
      card(s, x, y, 4.0, 0.42);
      s.addText([
        { text: `${id}  `, options: { color: C.gold, bold: true, hyperlink: link } },
        { text: `${p.name}`, options: { color: C.ink, hyperlink: link } },
        { text: `  ${ROLES[roleId(p.role)].code}${r.categories.length > 1 && !isWaiting(p) ? ` · ${category(r, p.category)?.label || p.category}` : ''}${isWaiting(p) ? ' · waiting' : ''}`, options: { color: C.muted, fontSize: 11, hyperlink: link } },
      ], { x: x + 0.1, y, w: 3.25, h: 0.42, fontFace: FONT, fontSize: 13, valign: 'middle', fit: 'shrink', hyperlink: link });
      s.addText(`${slideOf[id]}`, { x: x + 3.3, y, w: 0.6, h: 0.42, fontFace: FONT, fontSize: 12, bold: true, color: C.muted, align: 'right', valign: 'middle', hyperlink: link });
    });
  });

  /* 7. Players, pool by pool */
  let lot = 0;
  const playerSlide = (id, p) => {
    if (!isWaiting(p)) lot++;
    const s = slide();
    const c = category(r, p.category);
    const base = basePrice(p, r);
    const photo = p.photoData || null;
    const box = photo ? fit(photo, { x: 0.6, y: 0.6, w: 4.2, h: 5.6 }) : { x: 0.6, y: 0.6, w: 4.2, h: 5.6 };
    if (photo) s.addImage({ data: photo, ...box });
    else {
      card(s, 0.6, 0.6, 4.2, 5.6, C.raised);
      s.addText(initials(p.name), { x: 0.6, y: 0.6, w: 4.2, h: 5.6, fontFace: FONT, fontSize: 96, bold: true, color: C.line, align: 'center', valign: 'middle' });
    }
    // Small base-price tag on the lower left of the photo.
    s.addText([
      { text: 'Base price: ', options: { fontSize: 11, color: C.muted } },
      { text: amt(base), options: { fontSize: 13, bold: true, color: C.gold } },
    ], { x: box.x + 0.12, y: box.y + box.h - 0.47, w: 1.75, h: 0.35, fontFace: FONT, fill: { color: C.bg, transparency: 15 }, align: 'center', valign: 'middle' });
    const x = 5.3;
    const w = W - x - 0.6;
    s.addText(isWaiting(p) ? `WAITING LIST  ·  ${id}` : `${(c?.label || 'Player').toUpperCase()}  ·  ${id}  ·  ${lot} OF ${pool.length}`, { x, y: 0.6, w, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.gold, charSpacing: 3 });
    s.addText(p.name, { x, y: 1.0, w, h: 1.0, fontFace: FONT, fontSize: 44, bold: true, color: C.ink, fit: 'shrink' });
    s.addText(ROLES[roleId(p.role)].name, { x, y: 2.0, w: 3.0, h: 0.45, fontFace: FONT, fontSize: 16, bold: true, color: C.bg, fill: { color: C.gold }, align: 'center', valign: 'middle' });
    s.addText([p.age ? `Age ${p.age}` : null, battingLabel(p), bowlingLabel(p), p.locality].filter(Boolean).join('  ·  '), { x, y: 2.6, w, h: 0.45, fontFace: FONT, fontSize: 16, color: C.muted });
    // Up to six numbers, three to a row: batting, then bowling.
    const sr = p.strikeRate != null && p.strikeRate !== '' ? Math.round(Number(p.strikeRate)) : null;
    const eco = p.economy != null && p.economy !== '' ? Number(p.economy).toFixed(1) : null;
    const stats = [['Matches', p.matches], ['Runs', p.runs], ['Strike rate', sr], ['Highest', p.highest], ['Wickets', p.wickets], ['Economy', eco]]
      .filter(([, v]) => v != null && v !== '');
    stats.forEach(([k, v], i) => {
      const sx = x + (i % 3) * 2.45;
      const sy = 3.1 + Math.floor(i / 3) * 0.95;
      card(s, sx, sy, 2.3, 0.85);
      s.addText([{ text: k.toUpperCase(), options: { fontSize: 10, color: C.muted, bold: true, charSpacing: 2, breakLine: true } }, { text: String(v), options: { fontSize: 24, bold: true, color: C.ink } }],
        { x: sx + 0.15, y: sy + 0.02, w: 2.05, h: 0.8, fontFace: FONT, valign: 'middle' });
    });
    const statRows = Math.ceil(stats.length / 3);
    const noteText = [p.notes, p.scout && `Scout: ${p.scout}`].filter(Boolean).join('\n');
    if (noteText) s.addText(noteText, { x, y: 3.1 + statRows * 0.95, w, h: 6.2 - (3.1 + statRows * 0.95), fontFace: FONT, fontSize: 14, italic: true, color: C.ink, valign: 'top', fit: 'shrink' });
    if (p.cricheroesUrl) s.addText('CricHeroes profile', { x: W - 4.65, y: 0.12, w: 2.0, h: 0.36, fontFace: FONT, fontSize: 11, bold: true, color: C.gold, align: 'center', valign: 'middle', fill: { color: C.surface }, line: { color: C.gold, width: 0.75 }, hyperlink: { url: p.cricheroesUrl, tooltip: 'Open the CricHeroes profile' } });
    const ladder = [base];
    while (ladder.length < 9) ladder.push(ladder.at(-1) + increment(ladder.at(-1), r));
    s.addText('Back to players list', { x: W - 2.5, y: 0.12, w: 1.9, h: 0.36, fontFace: FONT, fontSize: 11, bold: true, color: C.ink, align: 'center', valign: 'middle', fill: { color: C.surface }, line: { color: C.line, width: 0.75 }, hyperlink: { slide: indexAt + idxPage(id), tooltip: 'Back to the players list' } });
    s.addNotes([`${p.name} (${id})`, `${ROLES[roleId(p.role)].name}, ${c?.label || ''}`, battingLabel(p), bowlingLabel(p),
      stats.map(([k, v]) => `${k} ${v}`).join(', '), p.notes, p.cricheroesUrl, `Base price ${amt(base)}. Bids: ${ladder.map(amt).join(', ')}`].filter(Boolean).join('\n'));
  };
  for (const c of pools) {
    const s = slide();
    const n = pool.filter(([, p]) => p.category === c.id).length;
    eyebrow(s, 'Next up', 2.4);
    s.addText(c.label, { x: 0.6, y: 2.8, w: W - 1.2, h: 1.4, fontFace: FONT, fontSize: 64, bold: true, color: C.ink });
    s.addText(`${n} player${n === 1 ? '' : 's'} · base price ${amt(c.base)}`, { x: 0.6, y: 4.2, w: W - 1.2, h: 0.6, fontFace: FONT, fontSize: 22, color: C.gold });
    for (const [id, p] of pool) if (p.category === c.id) playerSlide(id, p);
  }
  for (const [id, p] of pool) if (!pools.some((c) => c.id === p.category)) playerSlide(id, p);
  if (waiting.length) {
    const s = slide();
    eyebrow(s, 'If a place opens up', 2.4);
    s.addText('Waiting list', { x: 0.6, y: 2.8, w: W - 1.2, h: 1.4, fontFace: FONT, fontSize: 64, bold: true, color: C.ink });
    s.addText(`${waiting.length} player${waiting.length === 1 ? '' : 's'}`, { x: 0.6, y: 4.2, w: W - 1.2, h: 0.6, fontFace: FONT, fontSize: 22, color: C.gold });
    for (const [id, p] of waiting) playerSlide(id, p);
  }

  /* 8. Squads, once players are sold */
  const sales = a.sales || {};
  if (Object.values(sales).some((x) => !x.allotted && !x.retained)) {
    teams.forEach(([id, t]) => {
      const s = slide();
      const mine = Object.entries(sales).filter(([, x]) => x.team === id).map(([pid, x]) => ({ ...(a.players[pid] || { name: pid }), ...x }))
        .sort((x, y) => Number(!!(y.allotted || y.retained)) - Number(!!(x.allotted || x.retained)) || y.price - x.price);
      const spent = mine.filter((x) => !x.allotted && !x.retained).reduce((sum, x) => sum + Number(x.price), 0);
      eyebrow(s, 'Squad');
      title(s, t.name);
      s.addTable(mine.map((x) => [
        { text: x.name, options: { color: C.ink, bold: !!(x.allotted || x.retained) } },
        { text: x.allottedAs === 'C' ? 'Captain' : x.allottedAs === 'VC' ? 'Vice-captain' : x.allottedAs === 'R' ? 'Kept' : ROLES[roleId(x.role)].name, options: { color: C.muted } },
        { text: x.allotted || x.retained ? '' : amt(x.price), options: { color: C.gold, bold: true, align: 'right' } },
      ]), { x: 0.6, y: 1.8, w: 8.5, colW: [4.5, 2.4, 1.6], fontFace: FONT, fontSize: 16, border: { type: 'solid', color: C.line, pt: 0.75 }, fill: { color: C.surface }, margin: 0.08 });
      s.addText([{ text: 'SPENT', options: { fontSize: 12, bold: true, color: C.muted, breakLine: true } }, { text: amt(spent), options: { fontSize: 32, bold: true, color: C.ink, breakLine: true } },
        { text: 'PLAYERS', options: { fontSize: 12, bold: true, color: C.muted, breakLine: true } }, { text: `${mine.length} / ${r.squadSize}`, options: { fontSize: 32, bold: true, color: C.ink } }],
      { x: 9.6, y: 1.8, w: 3.1, h: 2.6, fontFace: FONT, valign: 'top' });
    });
  }

  /* 9. Close */
  {
    const s = slide();
    logo(s, { x: (W - 1.8) / 2, y: 1.4, w: 1.8, h: 1.8 });
    s.addText('Let the bidding begin', { x: 0.6, y: 3.4, w: W - 1.2, h: 1.0, fontFace: FONT, fontSize: 44, bold: true, color: C.ink, align: 'center' });
    s.addText(m.name || '', { x: 0.6, y: 4.4, w: W - 1.2, h: 0.6, fontFace: FONT, fontSize: 20, color: C.gold, align: 'center' });
  }
  return pptx;
}

// Photos given as web links (photo_url) are fetched once so they can go into the file; any that
// cannot be fetched are shown as initials.
async function inlinePhotos(a) {
  const players = {};
  await Promise.all(Object.entries(a.players).map(async ([id, p]) => {
    players[id] = p;
    if (p.photoData || !p.photoUrl) return;
    try {
      const { photoUrl } = await import('./engine.js');
      const blob = await (await fetch(photoUrl(p.photoUrl), { mode: 'cors' })).blob();
      if (!/^image\/(png|jpe?g)/.test(blob.type)) return;
      const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      players[id] = { ...p, photoData: data };
    } catch { /* keep initials */ }
  }));
  return { ...a, players };
}

// In the browser: load the bundled PptxGenJS once and download the deck.
export async function downloadDeck(auction, fileName) {
  if (!window.PptxGenJS) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/pptxgen.bundle.js', import.meta.url).href;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the slides library'));
      document.head.append(s);
    });
  }
  const pptx = buildDeck(window.PptxGenJS, await inlinePhotos(auction));
  await pptx.writeFile({ fileName });
}
