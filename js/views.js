// HTML fragments shared by the admin control room, live view and results page.

import { esc } from './ui.js';
import { money, teamSummary, category, basePrice, initials, photoUrl } from './engine.js';

export function avatar(p, cls = '') {
  const url = photoUrl(p?.photoUrl);
  return `<div class="avatar ${cls}">${url ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}${url ? '' : esc(initials(p?.name))}</div>`;
}

export function teamName(a, id) {
  const t = a.teams[id];
  return t ? `<span class="team-dot" style="background:${esc(t.color)}"></span>${esc(t.name)}` : '<span class="muted">-</span>';
}

export function playerCard(a, pid) {
  const p = a.players[pid];
  if (!p) return '<p class="muted">Waiting for the auctioneer to bring up the next player...</p>';
  const cat = category(a.rules, p.category);
  const stat = (label, v) => (v != null && v !== '' ? `<span>${label} <b>${esc(v)}</b></span>` : '');
  return `
    <div class="player-card">
      ${avatar(p)}
      <div>
        <div class="row" style="gap:6px">
          <span class="pill pill-blue">${esc(p.role || '')}</span>
          ${cat ? `<span class="pill pill-gold">${esc(cat.label)}</span>` : ''}
          <span class="pill">Base ${money(basePrice(p, a.rules), a.rules)}</span>
        </div>
        <p class="player-name">${esc(p.name)}</p>
        <div class="muted">${[p.battingStyle, p.bowlingStyle, p.locality].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="stats">${stat('Age', p.age)}${stat('Matches', p.matches)}${stat('Runs', p.runs)}${stat('Wickets', p.wickets)}</div>
        ${p.notes ? `<div class="muted" style="margin-top:6px">${esc(p.notes)}</div>` : ''}
      </div>
    </div>`;
}

export function bidBox(a) {
  const live = a.live;
  if (!live || !live.bid) return '<div class="bid-box"><p class="muted">No bidding in progress</p></div>';
  const b = live.bid;
  const until = live.status === 'bidding' ? b.until || '' : '';
  const label = live.status === 'sold' ? 'Sold for' : live.status === 'unsold' ? 'Unsold' : b.team ? 'Current bid' : 'Opening at base price';
  return `
    <div class="bid-box">
      <div class="muted">${label}</div>
      <div class="bid-amount">${live.status === 'unsold' ? '-' : money(b.amount, a.rules)}</div>
      <div class="bid-team">${b.team ? teamName(a, b.team) : '<span class="muted">No bids yet</span>'}</div>
      <div class="timer ${until ? '' : 'hidden'}" data-until="${until}" data-total="${(a.rules.bidTimer || 0) * 1000}"><div></div></div>
      <div class="muted" data-countdown></div>
    </div>`;
}

export function teamsStrip(a, { mine = null } = {}) {
  const leading = a.live?.status === 'bidding' ? a.live.bid?.team : null;
  return `<div class="teams-strip">${Object.entries(a.teams).map(([id, t]) => {
    const s = teamSummary(a, id);
    return `
      <div class="team-tile ${id === leading ? 'leading' : ''} ${id === mine ? 'mine' : ''}" style="--c:${esc(t.color)}">
        <div class="t-name">${esc(t.name)}</div>
        <div class="t-meta">Left <b>${money(s.remaining, a.rules)}</b> · Max bid ${money(s.maxBid, a.rules)}</div>
        <div class="t-meta">Players ${s.count}/${a.rules.maxSquad} · min ${a.rules.minSquad}</div>
      </div>`;
  }).join('')}</div>`;
}

export function feed(a, limit = 30) {
  const items = Object.values(a.log).sort((x, y) => y.at - x.at).slice(0, limit);
  const name = (pid) => esc(a.players[pid]?.name || pid);
  const line = (e) => {
    switch (e.type) {
      case 'sold': return `🔨 <b>${name(e.playerId)}</b> sold to ${teamName(a, e.team)} for <b>${money(e.amount, a.rules)}</b>`;
      case 'unsold': return `❌ <b>${name(e.playerId)}</b> unsold`;
      case 'up': return `🏏 <b>${name(e.playerId)}</b> is up, base ${money(e.amount, a.rules)}`;
      case 'undo': return `↩️ Sale of <b>${name(e.playerId)}</b> undone`;
      case 'round': return `🔁 Round ${e.round} - unsold players return`;
      case 'start': return '🚀 Auction started';
      case 'end': return '🏁 Auction completed';
      default: return esc(e.type);
    }
  };
  return items.length
    ? `<div class="feed">${items.map((e) => `<div>${line(e)} <small>${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>`).join('')}</div>`
    : '<p class="muted">Nothing yet.</p>';
}

export function squads(a, { mine = null } = {}) {
  return `<div class="grid grid-3">${Object.entries(a.teams).map(([id, t]) => {
    const s = teamSummary(a, id);
    return `
      <div class="card" style="border-top:4px solid ${esc(t.color)}${id === mine ? ';outline:2px solid var(--gold)' : ''}">
        <h3>${esc(t.name)}</h3>
        <div class="muted" style="font-size:.85rem">${[t.owner && `Owner: ${esc(t.owner)}`, t.captain && `Captain: ${esc(t.captain)}`].filter(Boolean).join(' · ')}</div>
        <div class="muted" style="font-size:.85rem;margin:4px 0 8px">Spent ${money(s.spent, a.rules)} · Left ${money(s.remaining, a.rules)} · ${s.count} players</div>
        <ul class="squad-list">${s.players.sort((x, y) => y.price - x.price).map((p) => `
          <li><span>${esc(p.name)} <small class="muted">${esc(p.role || '')}${p.retained ? ' · retained' : ''}</small></span><b>${money(p.price, a.rules)}</b></li>`).join('') || '<li class="muted">No players yet</li>'}
        </ul>
      </div>`;
  }).join('')}</div>`;
}

// Animate countdown bars rendered by bidBox(). Call once per page.
export function startTimers(now) {
  setInterval(() => {
    document.querySelectorAll('.timer[data-until]').forEach((el) => {
      const until = Number(el.dataset.until);
      const total = Number(el.dataset.total) || 1;
      const cd = el.parentElement.querySelector('[data-countdown]');
      if (!until) { if (cd) cd.textContent = ''; return; }
      const left = Math.max(0, until - now());
      el.firstElementChild.style.width = `${Math.min(100, (left / total) * 100)}%`;
      el.classList.toggle('low', left < 5000);
      if (cd) cd.textContent = left > 0 ? `${Math.ceil(left / 1000)}s` : 'Time up - going, going...';
    });
  }, 250);
}
