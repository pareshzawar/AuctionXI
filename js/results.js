// Results for a live auction (?a=CODE) or an archived one (?archive=slug, read
// from archive/<slug>/auction.json in the repo - works without any database).

import { db } from './db.js';
import { normalize, ROLES, roleId, isReserve, category, basePrice } from './engine.js';
import { toCSV } from './csv.js';
import { $, esc, param, download, mountHeader } from './ui.js';
import { price, teamBadge, playerTable } from './ds.js';
import { squads, rulesSummary } from './views.js';

mountHeader();

const aid = (param('a') || '').toUpperCase();
const archive = param('archive');

function render(A) {
  if (!A) { $('#title').textContent = 'Auction not found'; return; }
  const { meta, rules } = A;
  document.title = `${meta.name} - Results`;
  $('#title').textContent = meta.name;
  $('#subtitle').textContent = [meta.tournament, meta.venue, meta.date, meta.status === 'completed' ? 'Completed' : meta.status === 'live' ? 'In progress' : null].filter(Boolean).join(' · ');

  const sales = Object.entries(A.sales).filter(([, s]) => !s.retained);
  const top = [...sales].sort((x, y) => y[1].price - x[1].price)[0];
  const total = sales.reduce((t, [, s]) => t + Number(s.price), 0);
  const tile = (label, value, sub = '') => `<div class="card"><span class="ax-k">${label}</span><div style="margin:var(--space-1) 0">${value}</div><div class="muted">${sub}</div></div>`;
  $('#highlights').innerHTML = [
    tile('Players sold', `<span class="ax-price ax-price-lg">${sales.length}</span>`, `of ${Object.keys(A.players).length} in the pool`),
    tile('Total spent', price(total, rules, { size: 'lg' }), sales.length ? `Average ${price(Math.round(total / sales.length), rules, { size: 'sm' })}` : ''),
    top ? tile('Highest price', price(top[1].price, rules, { size: 'lg', tone: 'gold' }), `${esc(A.players[top[0]]?.name || top[0])} · ${teamBadge(A.teams[top[1].team])}`) : '',
  ].join('');
  $('#squads').innerHTML = squads(A);
  const unsold = Object.entries(A.players).filter(([pid]) => !A.sales[pid]).map(([id, p]) => ({
    id, name: p.name, role: p.role, category: category(rules, p.category)?.label, base: basePrice(p, rules),
    status: A.unsold[id] ? 'unsold' : 'upcoming', sub: isReserve(p) ? 'Reserve' : '',
  }));
  $('#unsold').innerHTML = playerTable(unsold, rules, { dense: true, columns: ['player', 'role', 'category', 'base', 'status'] });
  $('#rules').innerHTML = rulesSummary(A);

  $('#dl-csv').onclick = () => {
    const rows = Object.entries(A.sales).map(([pid, s]) => {
      const p = A.players[pid] || {};
      return [A.teams[s.team]?.name || s.team, pid, p.name, ROLES[roleId(p.role)].name, isReserve(p) ? 'reserve' : 'main', s.price];
    });
    download(`${archive || aid}_results.csv`, toCSV(['team', 'player_id', 'name', 'role', 'pool', 'price'], rows));
  };
}

if (archive) {
  fetch(`archive/${encodeURIComponent(archive)}/auction.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => render(normalize(data)))
    .catch(() => render(null));
} else if (aid) {
  db.on(`auctions/${aid}`, (v) => render(normalize(v)));
} else {
  render(null);
}
