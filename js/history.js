// Past seasons of a tournament, shown during this season's auction: each team's record, the
// knockouts, the top performers and what the last auction looked like. Built from an AuctionXI
// record file (Admin → Setup → Past seasons) and stored in the auction at history/{season}, so it
// is seen by exactly the people who can see this auction. Pure functions: no database, no DOM.
//
// A record file is an AuctionXI export ({ format: 'auctionxi/1', meta, rules, teams, players, sales })
// with an optional "results" block for how the season went:
//   results: {
//     champion, runnerUp, dates, venue, source,
//     standings: [{ team, played, won, lost, points, nrr, finish }],
//     knockouts: [{ stage, result }],
//     performers: [{ name, team, runs, sr, wickets, economy, mvpRank, mvpPoints, awards }]
//   }

const TOP = 5;

// Team names change spelling from season to season (Lakeview / Lakevew, Hilltopwalla / Hilltop):
// compare the first word without vowels, and let one be the start of the other.
export function teamKey(name) {
  const first = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, '').trim().split(/\s+/)[0] || '';
  return first.replace(/[aeiou]/g, '');
}
export function sameTeam(x, y) {
  const a = teamKey(x);
  const b = teamKey(y);
  return a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a));
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === undefined ? null : v)));

// The summary kept for one past season (small: no photos, no logs).
export function historyFromRecord(rec) {
  if (!rec || rec.format !== 'auctionxi/1' || !rec.meta) throw new Error('This is not an AuctionXI record file');
  const r = rec.rules || {};
  const teams = rec.teams || {};
  const players = rec.players || {};
  const sales = Object.entries(rec.sales || {});
  const bought = sales.filter(([, s]) => !s.allotted && !s.retained);
  const auction = {
    teams: Object.entries(teams).map(([id, t]) => {
      const mine = sales.filter(([, s]) => s.team === id);
      const squad = mine.map(([pid, s]) => ({ name: players[pid]?.name || pid, price: Number(s.price) || 0, kept: !!(s.allotted || s.retained) }))
        .sort((x, y) => y.price - x.price);
      return { id, name: t.name, short: t.short || '', color: t.color || '', spent: mine.filter(([, s]) => !s.allotted && !s.retained).reduce((n, [, s]) => n + (Number(s.price) || 0), 0), squad };
    }),
    topBuys: bought.map(([pid, s]) => ({ name: players[pid]?.name || pid, team: teams[s.team]?.name || s.team, price: Number(s.price) || 0 }))
      .sort((x, y) => y.price - x.price).slice(0, TOP),
    sold: bought.length,
    spent: bought.reduce((n, [, s]) => n + (Number(s.price) || 0), 0),
    purse: num(r.purse),
    currency: r.currency || '₹',
  };
  const res = rec.results || {};
  const perf = (res.performers || []).map((p) => ({
    name: p.name, team: p.team || '', runs: num(p.runs), sr: num(p.sr), wickets: num(p.wickets), economy: num(p.economy),
    mvpRank: num(p.mvpRank), mvpPoints: num(p.mvpPoints), awards: p.awards || '',
  }));
  const top = (key, keep, sort) => perf.filter(keep).sort(sort).slice(0, TOP).map((p) => ({ name: p.name, team: p.team, value: p[key], ...(key === 'runs' ? { sr: p.sr } : key === 'wickets' ? { economy: p.economy } : { points: p.mvpPoints }) }));
  return clean({
    season: String(rec.meta.season || ''),
    name: rec.meta.name || '',
    tournament: rec.meta.tournament || '',
    dates: res.dates || rec.meta.date || '',
    venue: res.venue || rec.meta.venue || '',
    source: res.source || '',
    champion: res.champion || '',
    runnerUp: res.runnerUp || '',
    standings: (res.standings || []).map((s) => ({ team: s.team, played: num(s.played), won: num(s.won), lost: num(s.lost), points: num(s.points), nrr: num(s.nrr), finish: s.finish || '' })),
    knockouts: (res.knockouts || []).map((k) => ({ stage: k.stage, result: k.result })),
    top: {
      mvp: top('mvpRank', (p) => p.mvpRank != null, (x, y) => x.mvpRank - y.mvpRank),
      runs: top('runs', (p) => p.runs, (x, y) => y.runs - x.runs || (y.sr || 0) - (x.sr || 0)),
      wickets: top('wickets', (p) => p.wickets, (x, y) => y.wickets - x.wickets || (x.economy ?? 99) - (y.economy ?? 99)),
    },
    auction,
    addedAt: Date.now(),
  });
}

// Seasons newest first.
export const seasonsOf = (a) => Object.values(a.history || {}).sort((x, y) => (Number(y.season) || 0) - (Number(x.season) || 0));

// What each of this season's teams did in a past season: finish, record, and its auction then.
export function teamPast(h, name) {
  const st = (h.standings || []).find((s) => sameTeam(s.team, name));
  const au = (h.auction?.teams || []).find((t) => sameTeam(t.name, name));
  if (!st && !au) return null;
  const finish = sameTeam(h.champion, name) ? 'Champion' : sameTeam(h.runnerUp, name) ? 'Runner-up' : st?.finish || '';
  return { season: h.season, name: st?.team || au?.name, finish, played: st?.played, won: st?.won, lost: st?.lost, points: st?.points, nrr: st?.nrr,
    spent: au?.spent, topBuy: au?.squad?.find((p) => !p.kept) || null };
}
