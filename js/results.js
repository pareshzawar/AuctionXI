// Results for a live auction (?a=CODE) or an archived one (?archive=slug, read
// from archive/<slug>/auction.json in the repo - works without any database).

import { db } from './db.js';
import { normalize, money } from './engine.js';
import { toCSV } from './csv.js';
import { $, esc, param, download, mountHeader } from './ui.js';
import { squads, teamName } from './views.js';

mountHeader();

const aid = (param('a') || '').toUpperCase();
const archive = param('archive');

function render(A) {
  if (!A) { $('#title').textContent = 'Auction not found'; return; }
  const { meta, rules } = A;
  document.title = `${meta.name} - Results`;
  $('#title').textContent = meta.name;
  $('#subtitle').textContent = [meta.tournament, meta.venue, meta.date, meta.status].filter(Boolean).join(' · ');

  const sales = Object.entries(A.sales).filter(([, s]) => !s.retained);
  const top = sales.sort((x, y) => y[1].price - x[1].price)[0];
  const total = sales.reduce((t, [, s]) => t + Number(s.price), 0);
  const tile = (label, value, sub = '') => `<div class="card"><div class="muted">${label}</div><div style="font-size:1.6rem;font-weight:800">${value}</div><div>${sub}</div></div>`;
  $('#highlights').innerHTML = [
    tile('Players sold', sales.length, `${Object.keys(A.players).length} in the pool`),
    tile('Total spent', money(total, rules), sales.length ? `avg ${money(Math.round(total / sales.length), rules)}` : ''),
    top ? tile('Most expensive', esc(A.players[top[0]]?.name || top[0]), `${teamName(A, top[1].team)} · ${money(top[1].price, rules)}`) : '',
  ].join('');
  $('#squads').innerHTML = squads(A);
  const unsold = Object.entries(A.players).filter(([pid]) => !A.sales[pid]);
  $('#unsold').innerHTML = unsold.length
    ? unsold.map(([, p]) => `<span class="pill" style="margin:3px">${esc(p.name)}</span>`).join('')
    : '<p class="muted">None</p>';

  $('#dl-csv').onclick = () => {
    const rows = Object.entries(A.sales).map(([pid, s]) => [A.teams[s.team]?.name || s.team, pid, A.players[pid]?.name, A.players[pid]?.role, s.price]);
    download(`${archive || aid}_results.csv`, toCSV(['team', 'player_id', 'name', 'role', 'price'], rows));
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
