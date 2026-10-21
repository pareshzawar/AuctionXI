// Results for a live auction (?a=CODE) or an archived one (?archive=slug, read
// from archive/<slug>/auction.json in the repo - works without any database).

import { db } from './db.js';
import { normalize, ROLES, roleId, isAllotted, leaderLabel, category, basePrice } from './engine.js';
import { toCSV } from './csv.js';
import { $, esc, param, download, mountHeader, getSession } from './ui.js';
import { price, teamBadge, playerTable } from './ds.js';
import { squads, rulesSummary } from './views.js';
import { watchMedia, applyMedia, logoImg, bannerImg } from './media.js';

mountHeader();

const aid = (param('a') || '').toUpperCase();
const archive = param('archive');

function render(A) {
  if (!A) { $('#title').textContent = 'Auction not found'; return; }
  const { meta, rules } = A;
  document.title = `${meta.name} - Results`;
  $('#title').textContent = meta.name;
  $('#brand').innerHTML = bannerImg(A, { cls: 'phone-banner' });
  $('#logo').innerHTML = logoImg(A, { size: 64 });
  $('#subtitle').textContent = [meta.tournament, meta.season && `Season ${meta.season}`, meta.kind === 'mini' ? 'Mini auction' : null, meta.venue, meta.date, meta.status === 'completed' ? 'Completed' : meta.status === 'live' ? 'In progress' : null].filter(Boolean).join(' · ');

  const sales = Object.entries(A.sales).filter(([, s]) => !s.allotted && !s.retained);
  const top = [...sales].sort((x, y) => y[1].price - x[1].price)[0];
  const total = sales.reduce((t, [, s]) => t + Number(s.price), 0);
  const tile = (label, value, sub = '') => `<div class="card"><span class="ax-k">${label}</span><div style="margin:var(--space-1) 0">${value}</div><div class="muted">${sub}</div></div>`;
  $('#highlights').innerHTML = [
    tile('Players sold', `<span class="ax-price ax-price-lg">${sales.length}</span>`, `of ${Object.keys(A.players).length} in the pool`),
    tile('Total spent', price(total, rules, { size: 'lg' }), sales.length ? `Average ${price(Math.round(total / sales.length), rules, { size: 'sm' })}` : ''),
    top ? tile('Highest price', price(top[1].price, rules, { size: 'lg', tone: 'gold' }), `${esc(A.players[top[0]]?.name || top[0])} · ${teamBadge(A.teams[top[1].team])}`) : '',
  ].join('');
  // Remaining purses follow the tournament's visibility rule for this device's role.
  const session = archive ? {} : getSession(aid);
  $('#squads').innerHTML = squads(A, { viewer: { role: session.role || 'audience', team: session.team } });
  const unsold = Object.entries(A.players).filter(([pid, p]) => !A.sales[pid] && !isAllotted(p)).map(([id, p]) => ({
    id, name: p.name, role: p.role, category: category(rules, p.category)?.label, base: basePrice(p, rules),
    status: A.unsold[id] ? 'unsold' : 'upcoming', sub: [p.age ? `Age ${p.age}` : null, p.locality].filter(Boolean).join(' · '),
  }));
  $('#unsold').innerHTML = playerTable(unsold, rules, { dense: true, columns: ['player', 'role', 'category', 'base', 'status'] });
  $('#rules').innerHTML = rulesSummary(A);

  $('#dl-csv').onclick = () => {
    const rows = Object.entries(A.sales).map(([pid, s]) => {
      const p = A.players[pid] || {};
      return [A.teams[s.team]?.name || s.team, pid, p.name, ROLES[roleId(p.role)].name, s.allotted || s.retained ? leaderLabel(p.allottedAs) : 'auction', s.price];
    });
    download(`${archive || aid}_results.csv`, toCSV(['team', 'player_id', 'name', 'role', 'how', 'price'], rows));
  };
}

if (archive) {
  fetch(`archive/${encodeURIComponent(archive)}/auction.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => render(applyMedia(normalize(data), data?.media)))
    .catch(() => render(null));
} else if (aid) {
  let media = {};
  let last = null;
  watchMedia(aid, (m) => { media = m; if (last) render(applyMedia(last, media)); });
  db.on(`auctions/${aid}`, (v) => { last = normalize(v); render(applyMedia(last, media)); });
} else {
  render(null);
}
