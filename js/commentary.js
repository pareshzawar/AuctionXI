// Live commentary, generated in the browser from what happens in the auction, in English,
// Hinglish or Marathi. No AI service or key: lines come from templates filled with the auction's
// own facts. Every device picks the same template for the same event (seeded by the event), so the
// stage, phones and console read alike. Uses only public facts; a team's money is mentioned only
// when the tournament shows purses to everyone.

import { money, category, roleId, teamSummary, basePrice, isAllotted } from './engine.js';

const MAX_LINES = 60;

export const LANGUAGES = { en: 'English', hi: 'Hinglish', mr: 'मराठी (Marathi)' };

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (list, seed) => list[hash(seed) % list.length];

/* ---------------- phrasebook ---------------- */
// Each entry gets the facts of one event and a seed, and returns one line.

const ROLE_WORDS = {
  en: { bat: 'batter', bowl: 'bowler', ar: 'all-rounder', wk: 'wicket-keeper' },
  hi: { bat: 'batter', bowl: 'bowler', ar: 'all-rounder', wk: 'wicket-keeper' },
  mr: { bat: 'फलंदाज', bowl: 'गोलंदाज', ar: 'अष्टपैलू', wk: 'यष्टिरक्षक' },
};

const PHRASES = {
  en: {
    stats: ({ mat, runs, wkts, wicketTaker }) => (wicketTaker ? `${wkts} wickets in ${mat} matches` : `${runs} runs${wkts ? ` and ${wkts} wickets` : ''} in ${mat} matches`),
    start: (f, k) => pick([
      `${f.name} is under way. ${f.teams} teams, ${f.toBuy} players each to buy.`,
      `Welcome to ${f.name}. ${f.teams} teams, squads of ${f.size}, and ${f.pool} players in the pool.`,
    ], k),
    up: (f, k) => {
      const how = f.how === 'chit' ? 'From the chits: ' : f.how === 'random' ? 'The draw brings up ' : 'Next up, ';
      return pick([`${how}${f.intro}. Bidding opens at ${f.base}.`, `${how}${f.intro}. Base price ${f.base}.`, `${how}${f.intro}. Who starts at ${f.base}?`], k);
    },
    squad: (f) => (f.full ? `${f.t} have a full squad of ${f.size}.` : `${f.t} now have ${f.count} of ${f.size}.`),
    purse: (f) => ` ${f.left} left in the purse.`,
    soldRecord: (f) => `Sold to ${f.t} for ${f.amt}. ${f.p} is the most expensive player of the auction so far.`,
    soldBase: (f, k) => pick([`${f.p} goes to ${f.t} at the base price, ${f.amt}. Good value.`, `${f.t} get ${f.p} for the base price.`], k),
    sold: (f, k) => pick([`Sold. ${f.p} joins ${f.t} for ${f.amt}.`, `${f.p} to ${f.t}, ${f.amt}.`, `Hammer down: ${f.p}, ${f.t}, ${f.amt}.`], k),
    unsoldAgain: (f, k) => pick([`No bids for ${f.p}. Back in the pool for the next round.`, `${f.p} goes unsold for now. Another chance in the next round.`], k),
    unsold: (f) => `No bids for ${f.p}. Unsold.`,
    undo: (f) => `Correction: the sale of ${f.p} to ${f.t} has been reversed.`,
    round: (f) => `Round ${f.r}. The unsold players are back for another chance.`,
    end: (f) => `That is the end of the auction. ${f.count} players sold${f.top ? `; the top buy was ${f.top.p} to ${f.top.t} for ${f.top.amt}` : ''}.`,
    bidFirst: (f, k) => pick([`${f.t} open the bidding at ${f.amt}.`, `${f.t} make the first move, ${f.amt}.`, `First bid: ${f.t}, ${f.amt}.`], k),
    bidRecord: (f) => `${f.amt} from ${f.t}. That beats the highest price of the auction so far.`,
    bidWar: (f, k) => pick([`${f.t} and ${f.other} will not let go. ${f.amt} with ${f.t}.`, `Bidding war between ${f.t} and ${f.other}. ${f.amt}.`, `${f.other} against ${f.t} again. Now ${f.amt}.`], k),
    bidMultiple: (f) => `${f.t} take it to ${f.amt}, ${f.x} times the base price.`,
    bidJoin: (f, k) => pick([`${f.t} join in at ${f.amt}.`, `Here come ${f.t}, ${f.amt}.`], k),
    bid: (f, k) => pick([`${f.t} raise to ${f.amt}.`, `${f.amt} from ${f.t}.`, `${f.t} come back with ${f.amt}.`, `${f.t} go ${f.amt}.`], k),
    voiceOn: 'Commentary on.',
  },
  hi: {
    stats: ({ mat, runs, wkts, wicketTaker }) => (wicketTaker ? `${mat} matches mein ${wkts} wickets` : `${mat} matches mein ${runs} runs${wkts ? ` aur ${wkts} wickets` : ''}`),
    start: (f, k) => pick([
      `${f.name} shuru ho gaya hai. ${f.teams} teams, har team ko ${f.toBuy} players lene hain.`,
      `Swagat hai ${f.name} mein. ${f.teams} teams, ${f.size} players ka squad, aur pool mein ${f.pool} players.`,
    ], k),
    up: (f, k) => {
      const how = f.how === 'chit' ? 'Chit se naam nikla: ' : f.how === 'random' ? 'Draw mein aaye hain ' : 'Ab baari hai ';
      return pick([`${how}${f.intro}. Bidding shuru ${f.base} se.`, `${how}${f.intro}. Base price ${f.base}.`, `${how}${f.intro}. ${f.base} se kaun shuru karega?`], k);
    },
    squad: (f) => (f.full ? `${f.t} ka squad poora, ${f.size} players.` : `${f.t} ke paas ab ${f.count}/${f.size} players.`),
    purse: (f) => ` Purse mein ${f.left} bache.`,
    soldRecord: (f) => `${f.t} ne ${f.amt} mein khareed liya. ${f.p} ab tak ke sabse mehenge player.`,
    soldBase: (f, k) => pick([`${f.p} base price ${f.amt} pe ${f.t} mein. Badhiya deal.`, `${f.t} ko ${f.p} sirf base price mein mil gaye.`], k),
    sold: (f, k) => pick([`Sold. ${f.p} ab ${f.t} ke, ${f.amt} mein.`, `${f.p} gaye ${f.t} mein, ${f.amt}.`, `Hathoda gira: ${f.p}, ${f.t}, ${f.amt}.`], k),
    unsoldAgain: (f, k) => pick([`${f.p} ke liye koi bid nahi. Agle round mein phir mauka.`, `${f.p} abhi unsold. Agle round mein wapas aayenge.`], k),
    unsold: (f) => `${f.p} ke liye koi bid nahi. Unsold.`,
    undo: (f) => `Correction: ${f.p} ki ${f.t} wali sale cancel ho gayi hai.`,
    round: (f) => `Round ${f.r}. Unsold players phir se auction mein.`,
    end: (f) => `Auction khatam. ${f.count} players bike${f.top ? `; sabse badi boli ${f.top.p} ki, ${f.top.t} ne ${f.top.amt} mein li` : ''}.`,
    bidFirst: (f, k) => pick([`${f.t} ne bidding shuru ki, ${f.amt}.`, `Pehli boli ${f.t} ki, ${f.amt}.`, `${f.t} ne pehla kadam uthaya, ${f.amt}.`], k),
    bidRecord: (f) => `${f.amt}, ${f.t} se. Is auction ki ab tak ki sabse oonchi boli se bhi zyada.`,
    bidWar: (f, k) => pick([`${f.t} aur ${f.other} mein jung chal rahi hai. ${f.amt} ${f.t} ki taraf se.`, `${f.t} aur ${f.other} peeche hatne ko taiyaar nahi. ${f.amt}.`, `${f.other} ke saamne phir ${f.t}. Ab ${f.amt}.`], k),
    bidMultiple: (f) => `${f.t} ne ${f.amt} tak pahuncha diya, base price ka ${f.x} guna.`,
    bidJoin: (f, k) => pick([`${f.t} bhi aa gaye, ${f.amt}.`, `Ab ${f.t} bhi maidan mein, ${f.amt}.`], k),
    bid: (f, k) => pick([`${f.t} ne badha ke ${f.amt} kiya.`, `${f.amt}, ${f.t} se.`, `${f.t} wapas aaye ${f.amt} ke saath.`, `${f.t}: ${f.amt}.`], k),
    voiceOn: 'Commentary chalu.',
  },
  mr: {
    stats: ({ mat, runs, wkts, wicketTaker }) => (wicketTaker ? `${mat} सामन्यांत ${wkts} बळी` : `${mat} सामन्यांत ${runs} धावा${wkts ? ` आणि ${wkts} बळी` : ''}`),
    start: (f, k) => pick([
      `${f.name} सुरू झाला आहे. ${f.teams} संघ, प्रत्येक संघाला ${f.toBuy} खेळाडू घ्यायचे आहेत.`,
      `${f.name} मध्ये आपले स्वागत. ${f.teams} संघ, ${f.size} खेळाडूंचा संघ, आणि पूलमध्ये ${f.pool} खेळाडू.`,
    ], k),
    up: (f, k) => {
      const how = f.how === 'chit' ? 'चिठ्ठीतून नाव आलं: ' : f.how === 'random' ? 'ड्रॉमधून आले ' : 'आता पुढचे खेळाडू, ';
      return pick([`${how}${f.intro}. बोली ${f.base} पासून सुरू.`, `${how}${f.intro}. मूळ किंमत ${f.base}.`, `${how}${f.intro}. ${f.base} पासून कोण सुरुवात करणार?`], k);
    },
    squad: (f) => (f.full ? `${f.t} चा संघ पूर्ण, ${f.size} खेळाडू.` : `${f.t} कडे आता ${f.count}/${f.size} खेळाडू.`),
    purse: (f) => ` पर्समध्ये ${f.left} शिल्लक.`,
    soldRecord: (f) => `${f.t} ने ${f.amt} ला घेतलं. ${f.p} आतापर्यंतचे सर्वात महागडे खेळाडू.`,
    soldBase: (f, k) => pick([`${f.p} मूळ किमतीत, ${f.amt} ला ${f.t} कडे. चांगला सौदा.`, `${f.t} ला ${f.p} फक्त मूळ किमतीत मिळाले.`], k),
    sold: (f, k) => pick([`विकले गेले. ${f.p} आता ${f.t} चे, ${f.amt} ला.`, `${f.p} ${f.t} कडे, ${f.amt}.`, `हातोडा पडला: ${f.p}, ${f.t}, ${f.amt}.`], k),
    unsoldAgain: (f, k) => pick([`${f.p} साठी एकही बोली नाही. पुढच्या फेरीत पुन्हा संधी.`, `${f.p} सध्या न विकले गेलेले. पुढच्या फेरीत परत येतील.`], k),
    unsold: (f) => `${f.p} साठी एकही बोली नाही. न विकले गेले.`,
    undo: (f) => `दुरुस्ती: ${f.p} ची ${f.t} कडे झालेली विक्री रद्द केली आहे.`,
    round: (f) => `फेरी ${f.r}. न विकलेले खेळाडू पुन्हा लिलावात.`,
    end: (f) => `लिलाव संपला. ${f.count} खेळाडू विकले गेले${f.top ? `; सर्वात मोठी बोली ${f.top.p} साठी, ${f.top.t} ने ${f.top.amt} ला घेतलं` : ''}.`,
    bidFirst: (f, k) => pick([`${f.t} ने ${f.amt} ने बोली सुरू केली.`, `पहिली बोली ${f.t} ची, ${f.amt}.`, `${f.t} ने पहिलं पाऊल टाकलं, ${f.amt}.`], k),
    bidRecord: (f) => `${f.t} कडून ${f.amt}. या लिलावातली आतापर्यंतची सर्वात मोठी बोली ओलांडली.`,
    bidWar: (f, k) => pick([`${f.t} आणि ${f.other} मध्ये चुरस. ${f.t} कडून ${f.amt}.`, `${f.t} आणि ${f.other} मागे हटायला तयार नाहीत. ${f.amt}.`, `पुन्हा ${f.other} विरुद्ध ${f.t}. आता ${f.amt}.`], k),
    bidMultiple: (f) => `${f.t} ने ${f.amt} पर्यंत नेलं, मूळ किमतीच्या ${f.x} पट.`,
    bidJoin: (f, k) => pick([`${f.t} पण आले, ${f.amt}.`, `आता ${f.t} मैदानात, ${f.amt}.`], k),
    bid: (f, k) => pick([`${f.t} ने वाढवून ${f.amt} केलं.`, `${f.t} कडून ${f.amt}.`, `${f.t} परत आले, ${f.amt}.`, `${f.t}: ${f.amt}.`], k),
    voiceOn: 'समालोचन सुरू.',
  },
};

/* ---------------- facts from the auction ---------------- */

const teamName = (a, id) => a.teams[id]?.name || id;

function intro(a, p, lang) {
  const L = PHRASES[lang];
  // With a single pool its name says nothing about the player, so leave it out.
  const pool = (a.rules.categories || []).length > 1 ? category(a.rules, p.category)?.label : null;
  const role = ROLE_WORDS[lang][roleId(p.role)];
  const runs = Number(p.runs) || 0;
  const wkts = Number(p.wickets) || 0;
  const mat = Number(p.matches) || 0;
  const stats = mat && (runs || wkts) ? L.stats({ mat, runs, wkts, wicketTaker: wkts && wkts * 15 > runs }) : '';
  return `${p.name}, ${[pool, role].filter(Boolean).join(' ')}${stats ? `, ${stats}` : ''}`;
}

// Highest price paid so far in this auction, leaving out `exceptPid`.
function recordPrice(a, exceptPid) {
  return Object.entries(a.sales).filter(([pid, s]) => pid !== exceptPid && !s.allotted && !s.retained)
    .reduce((m, [, s]) => Math.max(m, Number(s.price) || 0), 0);
}

function lineForLog(a, e, key, lang) {
  const L = PHRASES[lang];
  const p = a.players[e.playerId] || { name: '?' };
  const r = a.rules;
  const m = (n) => money(n, r);
  switch (e.type) {
    case 'start':
      return L.start({
        name: a.meta.name, teams: Object.keys(a.teams).length, size: r.squadSize,
        toBuy: r.squadSize - (r.leaders === 'captain_vc' ? 2 : 1), pool: Object.values(a.players).filter((x) => !isAllotted(x)).length,
      }, key);
    case 'up':
      return L.up({ how: e.drawn, intro: intro(a, p, lang), base: m(e.amount) }, key);
    case 'sold': {
      const t = teamName(a, e.team);
      const s = teamSummary(a, e.team);
      const f = { p: p.name, t, amt: m(e.amount), count: s.count, size: r.squadSize, full: s.toBuy === 0, left: m(s.remaining) };
      const tail = ` ${L.squad(f)}${r.purseVisibility === 'everyone' ? L.purse(f) : ''}`;
      const rec = recordPrice(a, e.playerId);
      if (rec && Number(e.amount) > rec) return L.soldRecord(f) + tail;
      if (Number(e.amount) <= basePrice(p, r)) return L.soldBase(f, key) + tail;
      return L.sold(f, key) + tail;
    }
    case 'unsold':
      return Number(a.meta.round || 1) <= Number(r.unsoldRounds) ? L.unsoldAgain({ p: p.name }, key) : L.unsold({ p: p.name });
    case 'undo':
      return L.undo({ p: p.name, t: teamName(a, e.team) });
    case 'round':
      return L.round({ r: e.round });
    case 'end': {
      const sales = Object.entries(a.sales).filter(([, s]) => !s.allotted && !s.retained).sort((x, y) => y[1].price - x[1].price);
      const top = sales[0];
      return L.end({ count: sales.length, top: top ? { p: a.players[top[0]]?.name, t: teamName(a, top[1].team), amt: m(top[1].price) } : null });
    }
    default:
      return null;
  }
}

function lineForBid(a, lot, bid, key, lang) {
  const L = PHRASES[lang];
  const f = { t: teamName(a, bid.team), amt: money(bid.amount, a.rules) };
  const p = a.players[a.live.playerId] || {};
  const before = lot.slice(0, -1);
  if (!before.length) return L.bidFirst(f, key);
  const rec = recordPrice(a, a.live.playerId);
  if (rec && Number(bid.amount) > rec && !before.some((b) => Number(b.amount) > rec)) return L.bidRecord(f);
  const last4 = lot.slice(-4).map((b) => b.team);
  const pair = [...new Set(last4)];
  if (last4.length === 4 && pair.length === 2) return L.bidWar({ ...f, other: teamName(a, pair.find((x) => x !== bid.team)) }, key);
  const base = basePrice(p, a.rules);
  const x = Number(bid.amount) / base;
  if (x >= 3 && Math.floor(x) !== Math.floor((Number(before.at(-1).amount) || 0) / base)) return L.bidMultiple({ ...f, x: Math.floor(x) });
  if (!before.some((b) => b.team === bid.team)) return L.bidJoin(f, key);
  return L.bid(f, key);
}

/* ---------------- commentator ---------------- */

// Keeps the commentary for one page. Call update(auction) on every change; it calls onLine(line)
// for each new line ({ at, text, kind }) and keeps the history in .lines (newest first).
// lang: 'en' | 'hi' (Hinglish) | 'mr' (Marathi), or a function returning one.
export function createCommentator({ onLine = () => {}, lang = 'en' } = {}) {
  const seen = new Set();
  let ready = false;
  let lotId = null;
  let lot = []; // bids seen on the current player
  const language = () => { const l = typeof lang === 'function' ? lang() : lang; return PHRASES[l] ? l : 'en'; };
  const self = {
    lines: [],
    update(a) {
      if (!a || a.rules.commentary === false) return;
      const lg = language();
      const add = (text, at, kind, quiet) => {
        if (!text) return;
        const line = { at, text, kind, lang: lg };
        self.lines.unshift(line);
        self.lines.length = Math.min(self.lines.length, MAX_LINES);
        if (!quiet) onLine(line);
      };
      // Log events (players up, sales, unsold, rounds…), oldest first. On the first update the
      // recent history is filled in quietly.
      const entries = Object.entries(a.log).sort((x, y) => x[1].at - y[1].at);
      const fresh = entries.filter(([k]) => !seen.has(k));
      const history = ready ? fresh : fresh.slice(-8);
      fresh.forEach(([k]) => seen.add(k));
      for (const [k, e] of history) add(lineForLog(a, e, k, lg), e.at, e.type, !ready);
      // Bids on the player on the block.
      const live = a.live;
      if (live?.playerId !== lotId) { lotId = live?.playerId || null; lot = []; }
      const b = live?.status === 'bidding' ? live.bid : null;
      if (b?.team) {
        const key = `${live.playerId}:${b.amount}:${b.team}`;
        if (!seen.has(key)) {
          seen.add(key);
          if (lot.length && Number(lot.at(-1).amount) >= Number(b.amount)) lot = lot.filter((x) => Number(x.amount) < Number(b.amount)); // an undone bid
          lot.push({ team: b.team, amount: b.amount });
          if (ready) add(lineForBid(a, lot, b, key, lg), b.at || Date.now(), 'bid', false);
        }
      }
      ready = true;
    },
  };
  return self;
}

/* ---------------- voice ---------------- */

const VOICE_LANGS = { en: ['en-IN', 'en'], hi: ['en-IN', 'hi-IN', 'en'], mr: ['mr-IN', 'hi-IN'] };
const RUPEES = { en: 'rupees', hi: 'rupaye', mr: 'रुपये' };
const POINTS = { en: 'points', hi: 'points', mr: 'पॉइंट्स' };
const LAKH = { en: ['lakh', 'crore'], hi: ['lakh', 'crore'], mr: ['लाख', 'कोटी'] };

// Reads lines aloud with the browser's own speech (free, on the device). A new bid cuts off an
// older bid line so the voice keeps up with fast bidding.
export function createVoice() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let on = false;
  let lastKind = null;
  const spoken = (t, lg) => t
    .replace(/₹\s?([\d.,]+)\s?Cr\b/g, `$1 ${LAKH[lg][1]} ${RUPEES[lg]}`)
    .replace(/₹\s?([\d.,]+)\s?L\b/g, `$1 ${LAKH[lg][0]} ${RUPEES[lg]}`)
    .replace(/₹\s?([\d,]+)/g, `$1 ${RUPEES[lg]}`)
    .replace(/([\d,]+) pts\b/g, `$1 ${POINTS[lg]}`);
  const voiceFor = (lg) => {
    const voices = synth.getVoices();
    for (const want of VOICE_LANGS[lg] || VOICE_LANGS.en) {
      const v = voices.find((x) => x.lang === want) || voices.find((x) => x.lang?.startsWith(want));
      if (v) return v;
    }
    return null;
  };
  const speak = (text, lg) => {
    const u = new SpeechSynthesisUtterance(spoken(text, lg));
    const v = voiceFor(lg);
    if (v) u.voice = v;
    u.lang = v?.lang || (lg === 'mr' ? 'mr-IN' : 'en-IN');
    u.rate = lg === 'en' ? 1.05 : 1;
    synth.speak(u);
  };
  return {
    supported: !!synth,
    get on() { return on; },
    // True when this device has a voice for the language (Marathi needs a Marathi or Hindi voice).
    hasVoice(lg) { return !!synth && (lg !== 'mr' || !!voiceFor('mr')); },
    toggle(lg = 'en') {
      on = !on && !!synth;
      if (!on) synth?.cancel();
      else speak(PHRASES[lg]?.voiceOn || PHRASES.en.voiceOn, lg);
      return on;
    },
    say(line) {
      if (!on || !synth) return;
      if (line.kind === 'bid' && lastKind === 'bid' && synth.speaking) synth.cancel();
      lastKind = line.kind;
      speak(line.text, line.lang || 'en');
    },
  };
}
