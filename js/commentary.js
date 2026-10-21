// Live commentary, generated in the browser from what happens in the auction.
// No AI service or key: lines come from templates filled with the auction's own facts. Every
// device picks the same template for the same event (seeded by the event), so the stage, phones
// and console read alike. Uses only public facts; a team's money is mentioned only when the
// tournament shows purses to everyone.

import { money, category, ROLES, roleId, teamSummary, basePrice, isAllotted } from './engine.js';

const MAX_LINES = 60;

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (list, seed) => list[hash(seed) % list.length];

const teamName = (a, id) => a.teams[id]?.name || id;

function intro(a, p) {
  const pool = category(a.rules, p.category)?.label;
  const role = ROLES[roleId(p.role)].name.toLowerCase();
  const runs = Number(p.runs) || 0;
  const wkts = Number(p.wickets) || 0;
  const mat = Number(p.matches) || 0;
  let stats = '';
  if (mat && (runs || wkts)) {
    stats = wkts * 15 > runs && wkts ? `${wkts} wickets in ${mat} matches` : `${runs} runs${wkts ? ` and ${wkts} wickets` : ''} in ${mat} matches`;
  }
  return `${p.name}, ${[pool, role].filter(Boolean).join(' ')}${stats ? `, ${stats}` : ''}`;
}

// Highest price paid so far in this auction, leaving out `exceptPid`.
function recordPrice(a, exceptPid) {
  return Object.entries(a.sales).filter(([pid, s]) => pid !== exceptPid && !s.allotted && !s.retained)
    .reduce((m, [, s]) => Math.max(m, Number(s.price) || 0), 0);
}

function lineForLog(a, e, key) {
  const p = a.players[e.playerId] || { name: 'A player' };
  const r = a.rules;
  const m = (n) => money(n, r);
  switch (e.type) {
    case 'start': {
      const n = Object.keys(a.teams).length;
      const toBuy = r.squadSize - (r.leaders === 'captain_vc' ? 2 : 1);
      return pick([
        `${a.meta.name} is under way. ${n} teams, ${toBuy} players each to buy.`,
        `Welcome to ${a.meta.name}. ${n} teams, squads of ${r.squadSize}, and ${Object.values(a.players).filter((x) => !isAllotted(x)).length} players in the pool.`,
      ], key);
    }
    case 'up': {
      const base = m(e.amount);
      const how = e.drawn === 'chit' ? 'From the chits: ' : e.drawn === 'random' ? 'The draw brings up ' : 'Next up, ';
      return pick([
        `${how}${intro(a, p)}. Bidding opens at ${base}.`,
        `${how}${intro(a, p)}. Base price ${base}.`,
        `${how}${intro(a, p)}. Who starts at ${base}?`,
      ], key);
    }
    case 'sold': {
      const t = teamName(a, e.team);
      const amt = m(e.amount);
      const rec = recordPrice(a, e.playerId);
      const s = teamSummary(a, e.team);
      const squad = s.toBuy === 0 ? `${t} have a full squad of ${r.squadSize}.` : `${t} now have ${s.count} of ${r.squadSize}.`;
      const purse = r.purseVisibility === 'everyone' ? ` ${m(s.remaining)} left in the purse.` : '';
      if (rec && Number(e.amount) > rec) return `Sold to ${t} for ${amt}. ${p.name} is the most expensive player of the auction so far. ${squad}${purse}`;
      if (Number(e.amount) <= basePrice(p, r)) return pick([`${p.name} goes to ${t} at the base price, ${amt}. Good value. ${squad}${purse}`, `${t} get ${p.name} for the base price. ${squad}${purse}`], key);
      return pick([`Sold. ${p.name} joins ${t} for ${amt}. ${squad}${purse}`, `${p.name} to ${t}, ${amt}. ${squad}${purse}`, `Hammer down: ${p.name}, ${t}, ${amt}. ${squad}${purse}`], key);
    }
    case 'unsold':
      return Number(a.meta.round || 1) <= Number(r.unsoldRounds)
        ? pick([`No bids for ${p.name}. Back in the pool for the next round.`, `${p.name} goes unsold for now. Another chance in the next round.`], key)
        : `No bids for ${p.name}. Unsold.`;
    case 'undo':
      return `Correction: the sale of ${p.name} to ${teamName(a, e.team)} has been reversed.`;
    case 'round':
      return `Round ${e.round}. The unsold players are back for another chance.`;
    case 'end': {
      const sales = Object.entries(a.sales).filter(([, s]) => !s.allotted && !s.retained);
      const top = sales.sort((x, y) => y[1].price - x[1].price)[0];
      return `That is the end of the auction. ${sales.length} players sold${top ? `; the top buy was ${a.players[top[0]]?.name} to ${teamName(a, top[1].team)} for ${m(top[1].price)}` : ''}.`;
    }
    default:
      return null;
  }
}

function lineForBid(a, lot, bid, key) {
  const t = teamName(a, bid.team);
  const amt = money(bid.amount, a.rules);
  const p = a.players[a.live.playerId] || {};
  const before = lot.slice(0, -1);
  if (!before.length) {
    return pick([`${t} open the bidding at ${amt}.`, `${t} make the first move, ${amt}.`, `First bid: ${t}, ${amt}.`], key);
  }
  const rec = recordPrice(a, a.live.playerId);
  if (rec && Number(bid.amount) > rec && !before.some((b) => Number(b.amount) > rec)) {
    return `${amt} from ${t}. That beats the highest price of the auction so far.`;
  }
  const last4 = lot.slice(-4).map((b) => b.team);
  const pair = [...new Set(last4)];
  if (last4.length === 4 && pair.length === 2) {
    const other = teamName(a, pair.find((x) => x !== bid.team));
    return pick([`${t} and ${other} will not let go. ${amt} with ${t}.`, `Bidding war between ${t} and ${other}. ${amt}.`, `${other} against ${t} again. Now ${amt}.`], key);
  }
  const x = Number(bid.amount) / basePrice(p, a.rules);
  if (x >= 3 && Math.floor(x) !== Math.floor((Number(before.at(-1).amount) || 0) / basePrice(p, a.rules))) {
    return `${t} take it to ${amt}, ${Math.floor(x)} times the base price.`;
  }
  if (!before.some((b) => b.team === bid.team)) return pick([`${t} join in at ${amt}.`, `Here come ${t}, ${amt}.`], key);
  return pick([`${t} raise to ${amt}.`, `${amt} from ${t}.`, `${t} come back with ${amt}.`, `${t} go ${amt}.`], key);
}

// Keeps the commentary for one page. Call update(auction) on every change; it calls onLine(line)
// for each new line ({ at, text, kind }) and keeps the history in .lines (newest first).
export function createCommentator({ onLine = () => {} } = {}) {
  const seen = new Set();
  let ready = false;
  let lotId = null;
  let lot = []; // bids seen on the current player
  const self = {
    lines: [],
    update(a) {
      if (!a || a.rules.commentary === false) return;
      const add = (text, at, kind, quiet) => {
        if (!text) return;
        const line = { at, text, kind };
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
      for (const [k, e] of history) add(lineForLog(a, e, k), e.at, e.type, !ready);
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
          if (ready) add(lineForBid(a, lot, b, key), b.at || Date.now(), 'bid', false);
        }
      }
      ready = true;
    },
  };
  return self;
}

// Reads lines aloud with the browser's own speech (free, on the device). A new bid cuts off an
// older bid line so the voice keeps up with fast bidding.
export function createVoice() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let on = false;
  let lastKind = null;
  const spoken = (t) => t.replace(/₹\s?([\d.,]+)\s?Cr\b/g, '$1 crore rupees').replace(/₹\s?([\d.,]+)\s?L\b/g, '$1 lakh rupees').replace(/₹\s?([\d,]+)/g, '$1 rupees');
  return {
    supported: !!synth,
    get on() { return on; },
    toggle() {
      on = !on && !!synth;
      if (!on) synth?.cancel();
      else synth.speak(new SpeechSynthesisUtterance('Commentary on.'));
      return on;
    },
    say(line) {
      if (!on || !synth) return;
      if (line.kind === 'bid' && lastKind === 'bid' && synth.speaking) synth.cancel();
      const u = new SpeechSynthesisUtterance(spoken(line.text));
      const voice = synth.getVoices().find((v) => v.lang === 'en-IN') || synth.getVoices().find((v) => v.lang?.startsWith('en'));
      if (voice) u.voice = voice;
      u.lang = voice?.lang || 'en-IN';
      u.rate = 1.05;
      lastKind = line.kind;
      synth.speak(u);
    },
  };
}
