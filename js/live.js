// Live view. Roles: audience, member (team highlighted), captain (bids), and
// ?screen=1 for the projector stage (fixed 1920 x 1080 canvas, always night).

import { db } from './db.js';
import { basePrice, normalize, money, teamSummary, nextBid, bidBlocker, bidLimit, phoneBidding, canSeePurse, category } from './engine.js';
import { placeBid, myBidderSeat, viewGate, waitUntilOpen } from './actions.js';
import { whatIf, buyable } from './plan.js';
import { createCommentator, createVoice, LANGUAGES } from './commentary.js';
import { openWorkbook, renderWorkbook } from './workbook.js';
import { watchMedia, applyMedia, logoImg, bannerImg } from './media.js';
import { $, $$, esc, toast, param, getSession, setSession, mountHeader, pageUrl, watchConnection, deviceCommLang, setDeviceCommLang } from './ui.js';
import { badge, teamPurse, bidButton, soldStamp, startCountdowns, price } from './ds.js';
import { cardFor, livePanel, purses, otherTeams, comingLists, ticker, feed, squads, rulesSummary, lotInfo, maxBidExplainer, profilesView, profileLists, stageBoard, playerStatus, historyView, stageHistory, teamProfile } from './views.js';
import { seasonsOf } from './history.js';
import { armSound, soundReady, gavel, confetti } from './celebrate.js';

const aid = (param('a') || '').toUpperCase();
const stage = param('screen') === '1';
const session = getSession(aid);
let role = stage ? 'screen' : session.role || 'audience';
let myTeam = ['captain', 'vc', 'member'].includes(role) ? session.team : null;
const isBidder = () => role === 'captain' || role === 'vc';
const viewer = () => ({ role, team: myTeam });
let A = null;
let tab = null; // default: Rules before the auction starts, Squads after
let sending = false;
let lastResult = null;
let wb = null; // this captain's / vice-captain's private workbook
let belowDirty = false;
let media = {};
const voice = createVoice();
// Language: ?lang= on the link (handy for the stage), else this device's choice, else the tournament's.
const commLang = () => (LANGUAGES[param('lang')] ? param('lang') : '') || deviceCommLang() || A?.rules.commentaryLang || 'en';
const makeCommentator = () => createCommentator({ lang: commLang, onLine: (line) => voice.say(line) });
let commentator = makeCommentator();
function switchLang(l) {
  setDeviceCommLang(l === A.rules.commentaryLang ? '' : l);
  commentator = makeCommentator();
  commentator.update(A);
}

if (stage) {
  document.documentElement.setAttribute('data-theme', 'night');
  document.body.classList.add('stage-mode');
} else {
  mountHeader(`<a class="btn btn-sm" href="${pageUrl('results.html', { a: aid })}">Results</a>
    <a class="btn btn-sm" href="${pageUrl('index.html', { a: aid })}">Change role</a>`);
}

async function boot() {
  const gate = await viewGate(aid);
  if (!gate.meta) { $('#app').innerHTML = '<div class="card"><h2>Auction not found</h2><p><a href="index.html">Back to home</a></p></div>'; return; }
  if (!gate.ok) { waitUntilOpen(aid, gate.meta, $('#app')); return; }
  if (isBidder()) {
    const seat = await myBidderSeat(aid);
    if (!seat) {
      toast('This phone is not signed in as a captain or vice-captain. Join again with your code.', 'error');
      role = 'audience';
      myTeam = null;
      setSession(aid, { role });
    } else {
      myTeam = seat.team;
      role = seat.as === 'VC' ? 'vc' : 'captain';
      wb = openWorkbook(aid, `${seat.team}_${seat.as}`);
      await wb.resume();
    }
  }
  const draw = () => { if (stage) renderStage(); else renderPhone(); };
  watchMedia(aid, (m) => { media = m; if (A) { applyMedia(A, media); draw(); } });
  if (!stage) watchConnection(db, { text: 'Reconnecting to the auction… What you see may be out of date, and bids can\'t be sent until the connection is back.' });
  db.on(`auctions/${aid}`, (v) => {
    A = applyMedia(normalize(v), media);
    if (!A) { $('#app').innerHTML = '<div class="card"><h2>Auction not found</h2><p><a href="index.html">Back to home</a></p></div>'; return; }
    commentator.update(A);
    document.title = `${A.meta.name} - AuctionXI`;
    draw();
    showResult();
  });
  startCountdowns(db.now);
  if (stage) {
    const fit = () => {
      document.documentElement.style.setProperty('--stage-scale', Math.min(innerWidth / 1920, innerHeight / 1080));
    };
    addEventListener('resize', fit);
    fit();
    // The stage takes no clicks; V switches the voice on or off (the browser needs a key press first).
    // L cycles the commentary language.
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'v' && voice.supported) { voice.toggle(commLang()); renderStage(); }
      // G changes the voice: Indian female, Indian male, then each voice installed for the language.
      if (k === 'g' && voice.supported) { const o = voice.options(commLang()).map((x) => x.value); voice.choose(o[(o.indexOf(voice.choice) + 1) % o.length], commLang()); renderStage(); }
      if (k === 'l' && A) { const ls = Object.keys(LANGUAGES); switchLang(ls[(ls.indexOf(commLang()) + 1) % ls.length]); renderStage(); }
    });
  }
}

/* ---------------- stage ---------------- */

// A board of players longer than one screen turns its pages every 10 seconds.
armSound(() => { if (stage && A) renderStage(); });
// Some browsers list their voices a moment after the page loads: refresh the voice picker then.
voice.onVoices(() => { if (A) (stage ? renderStage() : renderPhone()); });
let boardPage = 0;
if (stage) setInterval(() => { if (A?.meta.stageView?.type === 'list') { boardPage++; renderStage(); } }, 10000);

// Commentary animates only when a new line arrives, plus one gold shine every 90 seconds.
const COMM_SHINE = 90000;
let commSeen = { stage: null, phone: null };
const commIsNew = (where) => {
  const l = commentator.lines[0];
  const key = l ? `${l.at}|${l.text}` : null;
  const fresh = key && commSeen[where] !== null && key !== commSeen[where];
  if (commSeen[where] === null || key) commSeen[where] = key || '';
  return fresh ? ' is-new' : '';
};
const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
setInterval(() => {
  const el = document.querySelector('.stage-comm, .comm-feature');
  if (el && !document.hidden) replay(el, 'is-shine');
}, COMM_SHINE);
// Once a minute the player up for bidding gets a short spotlight (a glow and a gentle zoom of the
// photo), so a long bidding war still draws the eye. Not while nobody is bidding.
setInterval(() => {
  const el = document.querySelector('.ax-card-live');
  if (el && !document.hidden) replay(el, 'is-spot');
}, 60000);

function renderStage() {
  const { meta, live, rules } = A;
  const { lot, total } = lotInfo(A);
  const sold = Object.values(A.sales).filter((s) => !s.allotted && !s.retained);
  const unsold = Object.keys(A.unsold).filter((pid) => !A.sales[pid]).length;
  const spent = sold.reduce((t, s) => t + Number(s.price), 0);
  const hasLot = live && A.players[live.playerId];
  const n = Object.keys(A.teams).length;
  $('#app').innerHTML = `
    <div class="stage-frame"><div class="stage">
      <header class="stage-top">
        ${logoImg(A, { size: 112, cls: 'stage-logo' })}
        <div class="stage-brand">
          <span class="stage-label">${meta.mock ? '<span style="color:var(--gold)">Mock auction</span> · ' : ''}AuctionXI${total && lot ? ` · Lot ${lot} of ${total}` : ''}${hasLot && live.status === 'bidding' && live.drawn ? ` · ${live.drawn === 'chit' ? 'Chit' : `Random draw${live.drawnPool ? ` from ${esc(category(rules, live.drawnPool)?.label || live.drawnPool)}` : ''}`}` : ''}</span>
          <h1 class="stage-title">${esc(meta.name)}</h1>
        </div>
        <div class="stage-tally">
          <div><span class="stage-label">Sold</span><b>${sold.length}</b></div>
          <div><span class="stage-label">Unsold</span><b>${unsold}</b></div>
          <div><span class="stage-label">Spent</span>${price(spent, rules, { size: 'lg' })}</div>
        </div>
      </header>
      <div class="stage-main">
        ${meta.stageView?.type === 'list' ? stageBoard(A, meta.stageView.which, boardPage)
          : meta.stageView?.type === 'player' && A.players[meta.stageView.id] ? `${cardFor(A, meta.stageView.id, 'stage')}${stageProfileSide(meta.stageView.id)}`
          : meta.stageView?.type === 'history' ? stageHistory(A, meta.stageView.season)
          : meta.stageView?.type === 'team' && A.teams[meta.stageView.id] ? teamProfile(A, meta.stageView.id, { stage: true })
          : hasLot ? `${cardFor(A, live.playerId, 'stage')}${livePanel(A, 'stage', viewer())}`
          : `<div class="stage-wait ${A.media?.banner ? 'has-banner' : ''}" style="grid-column:1/-1">${bannerImg(A, { cls: 'stage-banner' })}<div><h2>${meta.status === 'completed' ? 'Auction complete' : meta.status === 'live' ? 'Next player coming up' : 'Starting soon'}</h2>
             <p>${esc([meta.tournament, meta.season && `Season ${meta.season}`, meta.venue, meta.date, meta.time].filter(Boolean).join(' · '))}</p>
             ${meta.status === 'setup' ? stageRules() : ''}</div></div>`}
      </div>
      ${A.meta.sfx !== false && !soundReady() ? '<div class="stage-sound-hint">Click anywhere once to turn on the gavel sound</div>' : ''}
      ${A.rules.commentary === false ? '<div></div>' : `<div class="stage-comm${commIsNew('stage')}"><span class="stage-label"><span class="comm-mic"></span>Commentary${voice.on ? ` · ${esc(voice.current(commLang()) || 'voice on')}` : ''}</span><p>${esc(commentator.lines[0]?.text || 'Commentary appears here as the auction runs.')}</p></div>`}
      <section class="stage-teams" style="--n:${Math.min(Math.max(n, 1), 8)}">${purses(A, { size: 'stage', viewer: viewer() })}</section>
      <div class="stage-ticker">${ticker(A, { size: 'stage', scroll: true }) || '<div style="height:64px"></div>'}</div>
    </div></div>`;
}

// Beside a player's profile on the stage (shown by the organisers outside bidding).
function stageProfileSide(pid) {
  const r = A.rules;
  const st = playerStatus(A, pid);
  const s = A.sales[pid];
  const label = { waiting: 'On the waiting list', sold: `Sold to ${A.teams[s?.team]?.name || ''}`, retained: `In ${A.teams[s?.team]?.name || ''}`, unsold: 'Unsold so far', upcoming: 'Up for auction' }[st] || 'Up for auction';
  return `<div class="stage-profile-side"><span class="stage-label">Player profile</span>
    <h2 style="font-size:48px;line-height:52px;margin:0">${esc(label)}</h2>
    ${st === 'sold' ? price(s.price, r, { size: 'stage', tone: 'gold' }) : `<div><span class="stage-label">Base price</span><div>${price(basePrice(A.players[pid], r), r, { size: 'lg' })}</div></div>`}</div>`;
}

// Key rules on the stage while the hall waits for the start.
function stageRules() {
  const r = A.rules;
  const mb = maxBidExplainer(r);
  const res = Math.max(0, r.squadSize - r.playersPerSide);
  const lines = [
    `${r.playersPerSide}-a-side · every team buys exactly ${r.squadSize} players${res ? ` (${res} reserve${res === 1 ? '' : 's'})` : ''}`,
    `Purse ${money(r.purse, r)} · base price ${money(r.categories[0]?.base, r)} · captain value ${money(r.captainPrice, r)}${r.leaders === 'captain_vc' ? ` · vice-captain value ${money(r.vcPrice, r)}` : ''} (not from the purse)`,
    mb.rule,
  ];
  return `<div style="margin-top:var(--space-8);text-align:left;max-width:1400px">${lines.map((l) => `<p style="font-size:30px;line-height:40px;color:var(--ink)">${esc(l)}</p>`).join('')}</div>`;
}

/* ---------------- phones ---------------- */

function renderPhone() {
  const { meta, live, rules } = A;
  const hasLot = live && A.players[live.playerId];
  const team = myTeam && A.teams[myTeam];
  // A captain's (or bidding vice-captain's) page: my team, the other teams, the player on the
  // block, then who is still to come and who went unsold.
  const captainCorner = isBidder() && !!team;
  const roleLabel = { audience: 'Audience', member: 'Team member', captain: 'Captain', vc: 'Vice-captain' }[role] || role;
  const current = tab || (meta.status === 'setup' ? 'rules' : 'squads');
  if (!$('#p-top')) {
    // #below stays in place between updates so typing in the workbook is never lost.
    $('#app').innerHTML = '<div id="p-top"></div><section id="below"></section>';
    $('#below').addEventListener('focusout', () => setTimeout(() => {
      if (belowDirty && !$('#below').contains(document.activeElement)) renderBelow();
    }, 0));
  }
  bannerBar(meta.status !== 'setup');
  $('#p-top').innerHTML = `
    <div class="page-head">
      <div class="brand-row">
        ${logoImg(A, { size: 56 })}
        <div style="min-width:0"><h1 style="margin:0">${esc(meta.name)}</h1>
        <small>${esc([meta.tournament, meta.season && `Season ${meta.season}`, meta.kind === 'mini' ? 'Mini auction' : null, meta.venue, meta.date, meta.time].filter(Boolean).join(' · '))}</small></div>
      </div>
      ${meta.mock ? badge('unsold', { text: 'Mock auction' }) : ''}
      ${badge(meta.status === 'live' ? 'live' : meta.status === 'completed' ? 'sold' : 'upcoming', { text: meta.status === 'live' ? `Live · Round ${meta.round || 1}` : meta.status === 'completed' ? 'Completed' : 'Not started' })}
      <span class="muted">${esc(roleLabel)}${team ? ` · ${esc(team.name)}` : ''}</span>
    </div>
    ${isBidder() && team ? teamPurse(team, teamSummary(A, myTeam), rules, { variant: 'card', leading: live?.status === 'bidding' && live.bid?.team === myTeam, maxBid: hasLot && live.status === 'bidding' ? bidLimit(A, myTeam, A.players[live.playerId]).max : undefined, hidePurse: !canSeePurse(rules, viewer(), myTeam) }) : ''}
    ${captainCorner ? `<div style="margin-top:var(--space-4)">${otherTeams(A, viewer())}</div>` : ''}
    <div class="live-grid live-focus" style="margin-top:var(--space-4)">
      <div class="live-player">${hasLot ? cardFor(A, live.playerId) : `<div class="card"><h2>${meta.status === 'setup' ? 'The auction has not started yet' : meta.status === 'completed' ? 'Auction complete' : 'Next player coming up'}</h2><p class="muted">This page updates live.</p></div>`}</div>
      <div class="stack" style="gap:var(--space-4)">${hasLot ? livePanel(A, '', viewer()) : ''}${A.rules.commentary === false ? '' : phoneComm()}</div>
    </div>
    ${isBidder() && team ? `<div class="dock">${myLimit()}${captainButton()}</div>` : ''}
    ${captainCorner ? (meta.status === 'live' ? comingLists(A) : '') : `<h2 style="margin-top:var(--space-5)">Teams</h2>
    <div class="purses">${purses(A, { viewer: viewer() })}</div>`}
    <div style="margin-top:var(--space-4)">${ticker(A, { scroll: true }) || ''}</div>
    <nav class="tabs" style="margin-top:var(--space-5)">
      ${[['squads', 'Squads'], ['pool', 'Players'], ...(A.rules.commentary === false ? [] : [['comm', 'Commentary']]), ['feed', 'Activity'], ...(seasonsOf(A).length ? [['hist', 'Past seasons']] : []), ['rules', 'Rules'], ...(wb ? [['wb', 'My workbook']] : [])].map(([k, l]) => `<button data-tab="${k}" class="${current === k ? 'active' : ''}">${l}</button>`).join('')}
    </nav>`;
  renderBelow();
  $$('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; belowDirty = true; $('#below').innerHTML = ''; renderPhone(); }));
  if ($('#voice-btn')) $('#voice-btn').onclick = () => { voice.toggle(commLang()); renderPhone(); };
  if ($('#lang-sel')) $('#lang-sel').onchange = (e) => { switchLang(e.target.value); renderPhone(); };
  if ($('#voice-sel')) $('#voice-sel').onchange = (e) => { voice.choose(e.target.value, commLang()); renderPhone(); };
  const btn = $('[data-bid-button]');
  if (btn) btn.onclick = bid;
}

// The commentary as a feature box next to the bid: the latest line large, two before it small,
// the language, read aloud and the voice to read with.
function phoneComm() {
  const lines = commentator.lines.slice(0, 3);
  const lg = commLang();
  return `<div class="comm-feature${commIsNew('phone')}">
    <div class="section-title" style="margin:0"><span class="stage-label"><span class="comm-mic"></span>Commentary</span><span class="spacer"></span>
      <select id="lang-sel" style="width:auto;min-height:32px" aria-label="Commentary language">${Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}" ${k === lg ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${voice.supported ? `<button class="btn-sm" id="voice-btn">${voice.on ? 'Stop voice' : 'Read aloud'}</button>` : ''}</div>
    <p class="comm-line">${lines[0] ? `${lines[0].kind === 'ai' ? badge('upcoming', { text: 'AI' }) + ' ' : ''}${esc(lines[0].text)}` : '<span class="muted">Lines appear as the auction runs.</span>'}</p>
    ${lines.slice(1).map((l) => `<p class="comm-older">${esc(l.text)}</p>`).join('')}
    ${voice.supported ? `<label class="comm-voice">Voice <select id="voice-sel" style="width:auto;min-height:32px">${voice.options(lg).map((o) => `<option value="${esc(o.value)}" ${o.value === voice.choice ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
      ${voice.current(lg) ? `<small class="muted">${esc(voice.current(lg))}</small>` : ''}</label>` : ''}
    ${voice.on && !voice.hasVoice(lg) ? '<p class="hint">This phone has no Marathi or Hindi voice installed, so lines are shown but not read.</p>' : ''}
  </div>`;
}

// The league banner as a full-width bar under the header: tall before the auction, slim once it
// runs, so the player stays in focus. The image is only replaced when it changes (no flicker).
function bannerBar(live) {
  let bar = $('#banner-bar');
  const src = A.media?.banner || '';
  if (!src) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'banner-bar';
    bar.innerHTML = '<img alt="">';
    $('header.top').after(bar);
  }
  const img = bar.querySelector('img');
  if (img.getAttribute('src') !== src) { img.src = src; img.alt = `${A.meta.tournament || A.meta.name} banner`; }
  bar.classList.toggle('is-live', live);
}

function captainButton() {
  const { live, rules } = A;
  if (!phoneBidding(rules)) {
    return bidButton({ state: 'closed', rules, reason: 'Room bidding: raise your paddle. The auctioneer records bids.' });
  }
  if (!live || live.status !== 'bidding') return bidButton({ state: 'closed', rules });
  const amount = nextBid(live, rules);
  if (sending) return bidButton({ state: 'sending', amount, rules });
  if (live.bid?.team === myTeam) return bidButton({ state: 'leading', amount: live.bid.amount, rules });
  const why = bidBlocker(A, myTeam, amount);
  return why ? bidButton({ state: 'blocked', amount, rules, reason: why }) : bidButton({ state: 'ready', amount, rules });
}

async function bid() {
  if (sending) return;
  sending = true;
  renderPhone();
  try {
    const amt = await placeBid(aid, A, myTeam);
    navigator.vibrate?.(40);
    toast(`Bid placed: ${money(amt, A.rules)}`, 'ok');
  } catch (e) {
    navigator.vibrate?.([30, 60, 30]);
    toast(e.message || 'Bid not accepted', 'error');
  } finally {
    sending = false;
    renderPhone();
  }
}

const currentTab = () => tab || (A.meta.status === 'setup' ? 'rules' : 'squads');

function renderBelow() {
  const el = $('#below');
  const t = currentTab() === 'wb' && !wb ? 'squads' : currentTab();
  // Never redraw under the viewer's fingers; catch up when they leave the field.
  const f = document.activeElement;
  if (el.contains(f) && f.matches('input, textarea, select')) { belowDirty = true; return; }
  if (t === 'wb') {
    belowDirty = false;
    renderWorkbook(el, { get a() { return A; }, wb, team: myTeam, seatLabel: `${A.teams[myTeam]?.name || myTeam} ${role === 'vc' ? 'vice-captain' : 'captain'}`, rerender: renderPhone });
    return;
  }
  belowDirty = false;
  el.innerHTML = below(t);
  const q = $('#pf-q', el);
  if (q) q.oninput = () => { profileQuery = q.value; $('#pf-lists', el).innerHTML = profileLists(A, profileQuery); };
}
let profileQuery = '';

// The captain's own limit for the player on the block, from the workbook.
function myLimit() {
  return limitLine() + impactLine();
}

// What winning the player on the block would leave this team (from the public squad and points).
function impactLine() {
  const live = A.live;
  if (live?.status !== 'bidding' || !myTeam || !buyable(A, live.playerId)) return '';
  const lead = live.bid?.team === myTeam;
  const price = lead ? Number(live.bid.amount) : (nextBid(live, A.rules) ?? basePrice(A.players[live.playerId], A.rules));
  const w = whatIf(A, myTeam, live.playerId, price);
  if (!w.allowed) return '';
  return `<p class="hint" style="margin:0 0 var(--space-2)">${lead ? 'If it ends at' : 'Win at'} ${esc(money(price, A.rules))}: ${esc(money(w.after.remaining, A.rules))} left for ${w.after.toBuy} more player${w.after.toBuy === 1 ? '' : 's'}, max bid then ${esc(money(w.after.maxBid, A.rules))}.</p>`;
}

function limitLine() {
  const live = A.live;
  const mine = wb?.book && live?.status === 'bidding' && wb.book.players[live.playerId];
  if (!mine || mine.max == null) return '';
  const over = live.bid?.team !== myTeam && nextBid(live, A.rules) > mine.max;
  return `<p class="${over ? 'notice notice-warn' : 'hint'}" style="margin:0 0 var(--space-2)">${over
    ? `Next bid ${esc(money(nextBid(live, A.rules), A.rules))} is over your limit of ${esc(money(mine.max, A.rules))} (from your workbook).`
    : `Your limit for this player: ${esc(money(mine.max, A.rules))} (from your workbook).`}${mine.note ? ` ${esc(mine.note)}` : ''}</p>`;
}

function below(tab) {
  if (tab === 'feed') return `<div class="card">${feed(A, 100)}</div>`;
  if (tab === 'pool') return profilesView(A, profileQuery);
  if (tab === 'hist') return historyView(A);
  if (tab === 'rules') return rulesSummary(A);
  if (tab === 'comm') return `<div class="card"><div class="feed" style="max-height:none">${commentator.lines.map((l) => `<div>${l.kind === 'ai' ? badge('upcoming', { text: 'AI' }) : ''}<span>${esc(l.text)}</span><time>${new Date(l.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time></div>`).join('') || '<p class="muted">Nothing yet.</p>'}</div></div>`;
  return squads(A, { viewer: viewer() });
}

/* ---------------- SOLD / UNSOLD stamp ---------------- */

function showResult() {
  const live = A.live;
  const isResult = live && ['sold', 'unsold'].includes(live.status);
  const key = isResult ? `${live.playerId}:${live.status}:${live.startedAt}` : '';
  const first = lastResult === null;
  const changed = key !== lastResult;
  lastResult = key;
  if (first || !changed || !isResult) return; // never replay on page load
  const sold = live.status === 'sold';
  $('#overlay').innerHTML = `<div class="overlay">${soldStamp({
    result: live.status, player: A.players[live.playerId]?.name, team: sold ? A.teams[live.bid.team] : null,
    amount: sold ? live.bid.amount : null, rules: A.rules, size: stage ? '' : 'ui',
  })}</div>`;
  if (!stage && sold && live.bid.team === myTeam) navigator.vibrate?.(120);
  // Gavel and confetti (Control room → "Gavel and confetti on SOLD"); phones play the gavel only
  // when they have the commentary read aloud.
  if (sold && A.meta.sfx !== false) {
    const t = A.teams[live.bid.team];
    const others = Object.entries(A.sales).filter(([pid, x]) => pid !== live.playerId && !x.allotted && !x.retained).map(([, x]) => Number(x.price) || 0);
    const record = others.length > 0 && Number(live.bid.amount) > Math.max(...others);
    confetti({ colors: [t?.color || '#f2b84b'], count: stage ? 160 : 70, big: record });
    if (stage || voice.on) gavel({ record });
  }
  setTimeout(() => { $('#overlay').innerHTML = ''; }, sold ? 4000 : 3000);
}

if (!aid) location.href = 'index.html';
else boot();
