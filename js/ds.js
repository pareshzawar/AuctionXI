// AuctionXI design system components as HTML strings.
// Same markup and ax-* classes as the React bundle in the Claude Design system
// (design/README.md), so css/ds-components.css styles them identically - without
// React or a build step.

import { esc } from './ui.js';
import { moneyParts, ROLES, roleId, initials, teamCode, photoUrl, battingLabel, bowlingLabel } from './engine.js';

const cx = (...c) => c.filter(Boolean).join(' ');

export function price(amount, rules, { size = 'md', tone = '', cls = '' } = {}) {
  const p = moneyParts(amount, rules);
  const text = p.symbol + p.number + (p.unit ? ` ${p.unit}` : '');
  return `<span class="${cx('ax-price', `ax-price-${size}`, tone && `ax-tone-${tone}`, cls)}" aria-label="${esc(text)}">`
    + (p.symbol ? `<span class="ax-price-sym" aria-hidden="true">${esc(p.symbol)}</span>` : '')
    + `<span class="ax-price-n" aria-hidden="true">${esc(p.number)}</span>`
    + (p.unit ? `<span class="ax-price-u" aria-hidden="true">${esc(p.unit)}</span>` : '')
    + '</span>';
}

const STATUS = { upcoming: 'Upcoming', live: 'Live', paused: 'Paused', sold: 'Sold', unsold: 'Unsold', retained: 'Retained', waiting: 'Waiting list', cancelled: 'Registration cancelled' };

export function badge(status, { size = '', text = '' } = {}) {
  const cls = status;
  return `<span class="${cx('ax-badge', `ax-badge-${cls}`, size === 'lg' && 'ax-badge-lg')}">`
    + (status === 'live' ? '<span class="ax-dot" aria-hidden="true"></span>' : '')
    + esc(text || STATUS[status] || status) + '</span>';
}

export function roleChip(role, { size = '', showName = false, detail = '' } = {}) {
  const r = ROLES[roleId(role)];
  return `<span class="${cx('ax-role', size === 'lg' && 'ax-role-lg')}" title="${esc(r.name)}">`
    + `<span class="ax-role-k">${r.code}</span>`
    + (detail ? `<span class="ax-role-d">${esc(detail)}</span>` : showName ? `<span class="ax-role-d">${esc(r.name)}</span>` : '')
    + '</span>';
}

export function teamBadge(team, { showName = false, size = '' } = {}) {
  if (!team) return '<span class="ax-muted">—</span>';
  return `<span class="${cx('ax-team', size === 'lg' && 'ax-team-lg')}" style="--team:${esc(team.color || '')}" title="${esc(team.name)}">`
    + '<span class="ax-team-bar" aria-hidden="true"></span>'
    + `<span class="ax-team-code">${esc(teamCode(team))}</span>`
    + (showName ? `<span class="ax-team-name">${esc(team.name)}</span>` : '')
    + '</span>';
}

export function statGrid(stats, { size = '', columns } = {}) {
  if (!stats.length) return '';
  return `<div class="${cx('ax-stats', size === 'stage' && 'ax-stats-stage')}" style="--cols:${columns || Math.min(stats.length, 4)}">`
    + stats.map((s) => `<div class="ax-stat"><span class="ax-k">${esc(s.label)}</span><span class="ax-stat-v">${esc(s.value)}</span></div>`).join('')
    + '</div>';
}

function photo(p, cls) {
  const url = p.photoData || photoUrl(p.photoUrl);
  return `<div class="${cls}">${url ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${esc(initials(p.name))}'))">` : esc(initials(p.name))}</div>`;
}

const metaLine = (p) => [p.age ? `Age ${p.age}` : null, battingLabel(p), bowlingLabel(p), p.locality].filter(Boolean).join(' · ');
const dash = (v) => (v == null || v === '' ? '—' : String(v));

// Batting first (matches, runs, strike rate, highest), then bowling (wickets, economy).
export function playerStats(p) {
  const sr = p.strikeRate != null && p.strikeRate !== '' ? Math.round(Number(p.strikeRate)) : null;
  const eco = p.economy != null && p.economy !== '' ? Number(p.economy).toFixed(1) : null;
  return [['Matches', p.matches], ['Runs', p.runs], ['Strike rate', sr], ['Highest', p.highest], ['Wickets', p.wickets], ['Economy', eco]]
    .filter(([, v]) => v != null && v !== '').map(([label, v]) => ({ label, value: dash(v) }));
}

const profileLink = (p) => (/^https:\/\//.test(p.cricheroesUrl || '')
  ? `<a class="ax-profile-link" href="${esc(p.cricheroesUrl)}" target="_blank" rel="noopener noreferrer">CricHeroes profile</a>` : '');

// variant 'stage' = the projector lot card; 'tile' = pools, phones, console.
// opts: { status, category: {label, featured}, lot, base, rules, currentBid, soldTo, soldPrice }
export function playerCard(p, o) {
  const status = o.status || 'upcoming';
  const cat = [o.category?.label, o.lot != null ? `Lot ${o.lot}` : null].filter(Boolean).join(' · ');
  const catEl = cat ? `<span class="${cx('ax-card-cat', o.category?.featured && 'is-featured')}">${esc(cat)}</span>` : '<span></span>';
  const notes = [p.notes, p.scout && `Scout: ${p.scout}`].filter(Boolean).map((t) => `<div class="ax-feat"><span>${esc(t)}</span></div>`).join('');

  if (o.variant === 'stage') {
    return `<article class="${cx('ax-card', 'ax-card-stage', status === 'live' && 'ax-card-live')}">`
      + photo(p, 'ax-photo')
      + '<div class="ax-card-body">'
      + `<div class="ax-card-top">${catEl}${status !== 'live' ? badge(status, { size: 'lg' }) : ''}</div>`
      + `<div><h2 class="ax-stage-name">${esc(p.name)}</h2><p class="ax-stage-meta">${esc(metaLine(p))}</p></div>`
      + `<div class="ax-chips">${roleChip(p.role, { size: 'lg', showName: true })}</div>`
      // One box on the projector, at most two lines, so the stats always fit.
      + (p.notes || p.scout ? `<div class="ax-feat ax-feat-clamp"><span>${esc([p.notes, p.scout && `Scout: ${p.scout}`].filter(Boolean).join(' · '))}</span></div>` : '')
      + statGrid(playerStats(p), { size: 'stage', columns: 3 })
      + '</div></article>';
  }

  let right = '<span aria-hidden="true"></span>';
  if (o.soldTo && (status === 'sold' || status === 'retained')) {
    right = `<div class="ax-kv"><span class="ax-k">${status === 'retained' ? (o.leaderLabel ? `${o.leaderLabel} of` : 'Allotted to') : 'Sold to'}</span>`
      + `<span style="display:inline-flex;gap:var(--space-2);align-items:center">${teamBadge(o.soldTo)}${o.soldPrice != null ? price(o.soldPrice, o.rules, { tone: status === 'sold' ? 'sold' : '' }) : ''}</span></div>`;
  } else if (status === 'live' && o.currentBid != null) {
    right = `<div class="ax-kv"><span class="ax-k">Current bid</span>${price(o.currentBid, o.rules, { tone: 'gold' })}</div>`;
  }
  return `<article class="${cx('ax-card', status === 'live' && 'ax-card-live')}">`
    + `<div class="ax-card-top">${catEl}${badge(status)}</div>`
    + `<div class="ax-card-head">${photo(p, 'ax-avatar')}<div style="min-width:0"><h3 class="ax-card-name">${esc(p.name)}</h3><p class="ax-card-meta">${esc(metaLine(p))}</p></div></div>`
    + `<div class="ax-chips">${roleChip(p.role)}</div>`
    + (o.showNotes === false ? '' : notes)
    + statGrid(playerStats(p), { columns: 3 })
    + profileLink(p)
    + `<div class="ax-card-foot"><div class="ax-kv"><span class="ax-k">Base price</span>${price(o.base, o.rules, { tone: status === 'unsold' ? 'muted' : '' })}</div>${right}</div>`
    + '</article>';
}

export function countdown(remaining, total, { size = '' } = {}) {
  const rem = Math.max(0, Math.min(total, remaining));
  const frac = total ? rem / total : 0;
  const warn = rem <= 5;
  const label = rem === 0 ? 'Closing' : frac <= 0.2 ? 'Going twice' : frac <= 0.5 ? 'Going once' : 'Bidding open';
  return `<div class="${cx('ax-count', warn && 'ax-count-warn', size === 'stage' && 'ax-count-stage')}" role="timer" aria-live="off">`
    + `<div class="ax-count-head"><span class="ax-k">${label}</span><span class="ax-count-n">${String(Math.ceil(rem)).padStart(2, '0')}</span></div>`
    + `<div class="ax-count-track"><div class="ax-count-fill" style="width:${Math.round(frac * 100)}%"></div></div></div>`;
}

function fitClass(text) {
  return text.length >= 9 ? 'ax-fit-3' : text.length >= 7 ? 'ax-fit-2' : '';
}

// opts: { base, current (undefined before first bid), leading (team), next, status, size, rules, timer: {until, total} }
export function bidPanel(o) {
  const stage = o.size === 'stage';
  const has = o.current != null;
  const shown = has ? o.current : o.base;
  const p = moneyParts(shown, o.rules);
  const inc = has && o.next != null ? o.next - o.current : null;
  const lead = o.leading
    ? `<div class="ax-bp-lead">${teamBadge(o.leading, { size: stage ? 'lg' : '', showName: true })}<span class="ax-k">Leading</span></div>`
    : `<div class="ax-bp-lead"><span class="${cx('ax-muted', stage && 'ax-bp-none')}">No bids yet</span></div>`;
  return `<section class="${cx('ax-bidpanel', stage && 'ax-bidpanel-stage')}" aria-live="polite">`
    + `<div class="ax-bp-head"><span class="ax-k">${has ? 'Current bid' : 'Opening bid'}</span>${badge(o.status || 'live', { size: stage ? 'lg' : '' })}</div>`
    + price(shown, o.rules, { size: stage ? 'stage' : 'lg', tone: has ? 'gold' : '', cls: stage ? fitClass(p.symbol + p.number + p.unit) : '' })
    + lead
    + (o.timer?.until ? `<div data-until="${o.timer.until}" data-total="${o.timer.total}" data-size="${o.size || ''}">${countdown(o.timer.total / 1000, o.timer.total / 1000, { size: o.size })}</div>` : '')
    + '<div class="ax-bp-row">'
    + `<div class="ax-kv"><span class="ax-k">Base price</span>${price(o.base, o.rules)}</div>`
    + `<div class="ax-kv"><span class="ax-k">Next bid</span>${o.next != null ? price(o.next, o.rules) : '<span class="ax-muted">—</span>'}</div>`
    + `<div class="ax-kv"><span class="ax-k">Raise</span>${inc != null ? price(inc, o.rules, { tone: 'muted' }) : '<span class="ax-muted">—</span>'}</div>`
    + '</div></section>';
}

// Re-render countdowns placed by bidPanel(). Call once per page with a server-synced clock.
export function startCountdowns(now) {
  setInterval(() => {
    document.querySelectorAll('[data-until]').forEach((el) => {
      const until = Number(el.dataset.until);
      const total = Number(el.dataset.total) / 1000;
      if (!until || !total) return;
      el.innerHTML = countdown((until - now()) / 1000, total, { size: el.dataset.size });
    });
  }, 250);
}

// opts: { variant 'row'|'card', size 'stage', leading, mine, maxBid, hidePurse }
// hidePurse: the viewer may not see this team's money; show the squad count only.
export function teamPurse(team, s, rules, o = {}) {
  const purse = Number(s.purse ?? rules.purse) || 0;
  const pct = purse ? Math.min(100, Math.round((s.spent / purse) * 100)) : 0;
  const style = `--team:${esc(team.color || '')}`;
  const meter = `<div class="ax-meter" role="img" aria-label="${pct}% of purse spent"><i style="width:${pct}%"></i></div>`;
  const squad = `${s.count} / ${rules.squadSize} players`;
  const flag = o.leading ? '<span class="ax-purse-flag">Leading</span>' : '';
  if (o.hidePurse) {
    return `<div class="${cx('ax-purse', o.variant === 'card' && 'ax-purse-card', o.size === 'stage' && 'ax-purse-stage', o.leading && 'ax-purse-lead', o.mine && 'is-mine')}" style="${style}">`
      + `<div class="ax-purse-top">${teamBadge(team, { showName: o.size !== 'stage' })}<span class="ax-purse-count">${s.count}/${rules.squadSize}</span></div>`
      + `<div class="ax-purse-sub"><span>${s.toBuy ? `${s.toBuy} still to buy` : 'Squad complete'}</span>${flag}</div></div>`;
  }
  if (o.variant === 'card') {
    const roleMin = rules.roleMin || {};
    const anyRoleMin = Object.values(roleMin).some((n) => Number(n));
    return `<section class="${cx('ax-purse', 'ax-purse-card', o.leading && 'ax-purse-lead')}" style="${style}">`
      + `<div class="ax-purse-top">${teamBadge(team, { showName: true })}${o.leading ? flag : `<span class="ax-purse-count">${s.count}/${rules.squadSize}</span>`}</div>`
      + '<div class="row" style="gap:var(--space-5);align-items:flex-end">'
      + `<div class="ax-kv"><span class="ax-k">Purse left</span>${price(s.remaining, rules, { size: 'lg' })}</div>`
      + `<div class="ax-kv"><span class="ax-k">Max bid</span>${price(o.maxBid ?? s.maxBid, rules, { size: 'lg', tone: 'gold' })}</div>`
      + '</div>'
      + meter
      + `<div class="ax-purse-sub"><span>Spent ${esc(moneyText(s.spent, rules))} of ${esc(moneyText(purse, rules))}</span><span>${s.toBuy ? `${s.toBuy} still to buy` : 'Squad complete'}</span></div>`
      + (s.allottedValue ? `<div class="ax-purse-sub"><span>${s.players.some((p) => p.as === 'R') ? 'Kept players' : `Captain${rules.leaders === 'captain_vc' ? ' and VC' : ''}`} value ${esc(moneyText(s.allottedValue, rules))}</span><span>not from the purse</span></div>` : '')
      + (anyRoleMin ? `<div class="ax-slots">${Object.keys(ROLES).filter((k) => Number(roleMin[k])).map((k) => {
        const have = s.byRole[k] || 0;
        const need = Number(roleMin[k]);
        return `<span class="${have >= need ? 'is-met' : ''}">${ROLES[k].code} ${have}/${need}</span>`;
      }).join('')}</div>` : '')
      + '</section>';
  }
  return `<div class="${cx('ax-purse', o.size === 'stage' && 'ax-purse-stage', o.leading && 'ax-purse-lead', o.mine && 'is-mine')}" style="${style}">`
    + `<div class="ax-purse-top">${teamBadge(team, { showName: o.size !== 'stage' })}${price(s.remaining, rules)}</div>`
    + meter
    + `<div class="ax-purse-sub"><span>${squad}</span>${o.leading ? flag : `<span>Max ${esc(moneyText(s.maxBid, rules))}</span>`}</div>`
    + '</div>';
}

function moneyText(n, rules) {
  const p = moneyParts(n, rules);
  return p.symbol + p.number + (p.unit ? ` ${p.unit}` : '');
}

// items: [{ player, team, price, result }]
export function salesTicker(items, rules, { size = '', label = 'Last sold', scroll = false } = {}) {
  const list = (hidden) => `<div class="ax-ticker-list"${hidden ? ' aria-hidden="true"' : ''}>${items.map((it) => `<span class="ax-ticker-item"><b>${esc(it.player)}</b>${
    it.result === 'unsold' ? '<span class="ax-k" style="color:var(--unsold)">Unsold</span>' : teamBadge(it.team) + price(it.price, rules, { tone: 'gold' })
  }</span>`).join('')}</div>`;
  return `<div class="${cx('ax-ticker', size === 'stage' && 'ax-ticker-stage', scroll && 'ax-ticker-scroll')}">`
    + `<span class="ax-ticker-k">${esc(label)}</span>`
    + `<div class="ax-ticker-view"><div style="display:flex">${list(false)}${scroll ? list(true) : ''}</div></div></div>`;
}

export function soldStamp({ result = 'sold', player = '', team = null, amount = null, rules, size = '', note = '' }) {
  const sold = result === 'sold';
  return `<div class="${cx('ax-stamp', !sold && 'ax-stamp-unsold', size === 'ui' && 'ax-stamp-ui')}" role="status">`
    + (player ? `<p class="ax-stamp-player">${esc(player)}</p>` : '')
    + `<div class="ax-stamp-word">${sold ? 'Sold' : 'Unsold'}</div>`
    + (sold && team
      ? `<div class="ax-stamp-to">${teamBadge(team, { size: size === 'ui' ? '' : 'lg', showName: true })}${amount != null ? price(amount, rules, { tone: 'sold' }) : ''}</div>`
      : !sold ? `<p class="ax-muted" style="margin:0">${esc(note || 'Back to the pool for the next round.')}</p>` : '')
    + '</div>';
}

// state: ready | sending | leading | blocked | closed
export function bidButton({ amount, rules, state = 'ready', reason = '' }) {
  const label = { ready: 'Bid', sending: 'Sending…', leading: 'You lead', blocked: 'Can’t bid', closed: 'Bidding closed' }[state];
  const sub = reason || { ready: 'Tap once. The auctioneer confirms.', sending: 'Waiting for the server.', leading: 'Wait for another team to raise.', blocked: 'Over your max bid.', closed: 'Wait for the next player.' }[state];
  return `<button type="button" class="${cx('ax-bid', state !== 'ready' && `ax-bid-${state}`)}" ${state !== 'ready' ? 'disabled' : ''} data-bid-button>`
    + `<span><span class="ax-bid-k">${label}</span><span class="ax-bid-s">${esc(sub)}</span></span>`
    + (state === 'closed' || amount == null ? '' : price(amount, rules, { size: 'lg' }))
    + '</button>';
}

// rows: [{ id, name, role, category, base, status, team, price, sub }]
export function playerTable(rows, rules, { dense = false, columns = ['player', 'role', 'category', 'base', 'status', 'team', 'price'] } = {}) {
  const head = { lot: '<th>#</th>', player: '<th>Player</th>', role: '<th>Role</th>', category: '<th>Category</th>', base: '<th class="ax-r">Base</th>', status: '<th>Status</th>', team: '<th>Team</th>', price: '<th class="ax-r">Sold for</th>' };
  const cells = (p, i) => ({
    lot: `<td class="ax-num ax-muted">${esc(p.id ?? i + 1)}</td>`,
    player: `<td class="ax-cell-player"><span class="ax-cell-name">${esc(p.name)}</span><span class="ax-cell-sub">${esc(p.sub || '')}</span></td>`,
    role: `<td>${roleChip(p.role)}</td>`,
    category: `<td>${esc(p.category || '—')}</td>`,
    base: `<td class="ax-r">${price(p.base, rules, { size: 'sm' })}</td>`,
    status: `<td>${badge(p.status || 'upcoming')}</td>`,
    team: `<td>${p.team ? teamBadge(p.team, { showName: true }) : '<span class="ax-muted">—</span>'}</td>`,
    price: `<td class="ax-r">${p.price != null ? price(p.price, rules, { size: 'sm', tone: p.status === 'sold' ? 'sold' : '' }) : '<span class="ax-muted">—</span>'}</td>`,
  });
  return `<div class="ax-table-wrap"><table class="${cx('ax-table', dense && 'ax-table-dense')}"><thead><tr>${columns.map((c) => head[c]).join('')}</tr></thead><tbody>`
    + (rows.length ? rows.map((p, i) => { const c = cells(p, i); return `<tr class="${p.status === 'live' ? 'is-live' : ''}">${columns.map((k) => c[k]).join('')}</tr>`; }).join('')
      : `<tr><td colspan="${columns.length}" class="ax-muted">None</td></tr>`)
    + '</tbody></table></div>';
}
