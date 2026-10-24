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
//     performers: [{ name, team, runs, sr, wickets, economy, mvpRank, mvpPoints, awards }],
//     teams: [{ team, captain, viceCaptain, owner, sponsor }]
//   }
// Captains, vice-captains, owners and sponsors change from season to season, so each season keeps
// its own: from the record's allotted players and teams, and the results.teams block wins.

const TOP = 5;

// Team names change spelling from season to season (Sinhagad / Sinhgad, Pratapgadache / Pratapgad):
// compare the first word without vowels, and let one be the start of the other.
export function teamKey(name) {
  const first = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, '').trim().split(/\s+/)[0] || '';
  return first.replace(/[aeiou]/g, '');
}
// A second word must start with the same letter, so "Wing A Tigers" is not "Wing B Warriors".
const second = (name) => String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/)[1]?.[0] || '';
export function sameTeam(x, y) {
  const a = teamKey(x);
  const b = teamKey(y);
  const s1 = second(x);
  const s2 = second(y);
  return a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)) && (!s1 || !s2 || s1 === s2);
}
const plain = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// The one item in a list for a team name: the same name first, else a spelling match, but only when
// exactly one fits ("Wing A Tigers" and "Wing B Warriors" share a first word, so neither guesses).
export function findTeam(list, name, nameOf = (x) => x) {
  const exact = list.find((x) => plain(nameOf(x)) === plain(name));
  if (exact) return exact;
  const close = list.filter((x) => sameTeam(nameOf(x), name));
  return close.length === 1 ? close[0] : undefined;
}
const isTeam = (x, name, all) => !!x && findTeam(all, x) === name;

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
  const res = rec.results || {};
  const people = res.teams || [];
  const leader = (id, as) => Object.values(players).find((p) => p.allottedTeam === id && p.allottedAs === as)?.name || '';
  const auction = {
    teams: Object.entries(teams).map(([id, t]) => {
      const mine = sales.filter(([, s]) => s.team === id);
      const squad = mine.map(([pid, s]) => ({ name: players[pid]?.name || pid, price: Number(s.price) || 0, kept: !!(s.allotted || s.retained) }))
        .sort((x, y) => y.price - x.price);
      const x = people.find((p) => p.team === id) || findTeam(people, t.name, (p) => p.team) || {};
      return { id, name: t.name, short: t.short || '', color: t.color || '', spent: mine.filter(([, s]) => !s.allotted && !s.retained).reduce((n, [, s]) => n + (Number(s.price) || 0), 0), squad,
        captain: x.captain || leader(id, 'C') || t.captainName || '', vc: x.viceCaptain || x.vc || leader(id, 'VC') || t.vcName || '',
        owner: x.owner || t.owner || '', sponsor: x.sponsor || t.sponsor || '' };
    }),
    topBuys: bought.map(([pid, s]) => ({ name: players[pid]?.name || pid, team: teams[s.team]?.name || s.team, price: Number(s.price) || 0 }))
      .sort((x, y) => y.price - x.price).slice(0, TOP),
    sold: bought.length,
    spent: bought.reduce((n, [, s]) => n + (Number(s.price) || 0), 0),
    purse: num(r.purse),
    currency: r.currency || '₹',
  };
  const perf = (res.performers || []).map((p) => ({
    name: p.name, team: p.team || '', runs: num(p.runs), sr: num(p.sr), wickets: num(p.wickets), economy: num(p.economy),
    mvpRank: num(p.mvpRank), mvpPoints: num(p.mvpPoints), awards: p.awards || '',
  }));
  const top = (key, keep, sort) => perf.filter(keep).sort(sort).slice(0, TOP).map((p) => ({ name: p.name, team: p.team, value: p[key], ...(key === 'runs' ? { sr: p.sr } : key === 'wickets' ? { economy: p.economy } : { points: p.mvpPoints }) }));
  return clean({
    season: String(rec.meta.season || ''),
    name: rec.meta.name || '',
    kind: rec.meta.kind === 'mini' ? 'mini' : 'major',
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
export const seasonsOf = (a) => Object.entries(a.history || {}).map(([key, h]) => ({ ...h, key }))
  .sort((x, y) => (Number(y.season) || 0) - (Number(x.season) || 0) || String(y.season).localeCompare(String(x.season)) || (x.kind === 'mini') - (y.kind === 'mini'));

// What each of this season's teams did in a past season: finish, record, and its auction then.
export function teamPast(h, name) {
  const st = findTeam(h.standings || [], name, (s) => s.team);
  const au = findTeam(h.auction?.teams || [], name, (t) => t.name);
  if (!st && !au) return null;
  // Champion / runner-up are names as the results wrote them: they match this team if this team is
  // the one of that season's teams they point to.
  const names = [...new Set([...(h.standings || []).map((s) => s.team), ...(h.auction?.teams || []).map((t) => t.name)])];
  const me = findTeam(names, name);
  const finish = me && isTeam(h.champion, me, names) ? 'Champion' : me && isTeam(h.runnerUp, me, names) ? 'Runner-up' : st?.finish || '';
  return { season: h.season, name: st?.team || au?.name, finish, played: st?.played, won: st?.won, lost: st?.lost, points: st?.points, nrr: st?.nrr,
    spent: au?.spent, topBuy: au?.squad?.find((p) => !p.kept) || null,
    captain: au?.captain || '', vc: au?.vc || '', owner: au?.owner || '', sponsor: au?.sponsor || '' };
}

// "Captain X · Vice-captain Y · Owner Z · Sponsor W" for one team in one season ('' if none known).
export const peopleText = (p) => [p?.captain && `Captain ${p.captain}`, p?.vc && `Vice-captain ${p.vc}`, p?.owner && `Owner ${p.owner}`, p?.sponsor && `Sponsor ${p.sponsor}`].filter(Boolean).join(' · ');
