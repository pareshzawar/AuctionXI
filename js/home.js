import { db, isLocal } from './db.js';
import { createAuction, claimCaptain, claimCoadmin, isAdmin, viewGate, importAuction, accountAuctions, organiserStatus, claimSite, listOrganisers, addOrganiser, removeOrganiser } from './actions.js';
import { $, $$, esc, toast, mountHeader, setSession, rememberAuction, myAuctions, pageUrl, param, projectLink } from './ui.js';
import { badge } from './ds.js';
import { vcCanBid, withDefaults, normalize, visibilityOf, STAGES, stageOf } from './engine.js';

mountHeader();
// The guide and source links follow config.projectUrl, so a self-hosted copy can point them at its
// own fork or hide them.
for (const a of $$('[data-project-link]')) {
  const href = projectLink(a.dataset.projectLink);
  if (href) a.href = href; else a.closest('[data-project]')?.remove();
}

let found = null; // { aid, meta, teams }

// Auctions this device knows, with their meta, newest season first: [{ id, role, meta }].
let known = [];
let kind = 'major';

async function loadKnown() {
  // This browser's list, plus the auctions kept on your Google account (any laptop, private windows).
  const local = myAuctions();
  const seen = new Set(local.map((x) => x.id));
  const list = [...local, ...(await accountAuctions()).filter((x) => !seen.has(x.id)).map((x) => ({ id: x.id, name: x.name, role: x.role === 'owner' ? 'admin' : x.role }))];
  const metas = await Promise.all(list.map((x) => db.get(`auctions/${x.id}/meta`).catch(() => null)));
  known = list.map((x, i) => ({ ...x, meta: metas[i] })).filter((x) => x.meta)
    .sort((x, y) => String(y.meta.season || '').localeCompare(String(x.meta.season || ''), undefined, { numeric: true }) || (y.meta.createdAt || 0) - (x.meta.createdAt || 0));
}

const kindBadge = (m) => (m.mock ? badge('unsold', { text: 'Mock' }) : badge(m.kind === 'mini' ? 'retained' : 'upcoming', { text: m.kind === 'mini' ? 'Mini' : 'Major' }));
const stageBadge = (m) => { const s = STAGES[stageOf(m)]; return badge(s.badge, { text: s.text }); };
const label = (x) => `${x.meta.season ? `${x.meta.season} · ` : ''}${x.meta.kind === 'mini' ? 'Mini' : 'Major'} · ${x.meta.name} (${x.id})`;

// My tournaments: grouped by tournament name, seasons newest first.
function renderMine() {
  if (!known.length) return;
  const groups = new Map();
  for (const x of known) {
    const t = x.meta.tournament || 'Other auctions';
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(x);
  }
  $('#mine').innerHTML = [...groups].map(([t, items]) => `
    <h3 style="margin:var(--space-4) 0 var(--space-2)">${esc(t)}</h3>
    <table class="grid-table"><tbody>${items.map((x) => `
      <tr><td>${stageBadge(x.meta)} ${kindBadge(x.meta)} <b>${esc(x.meta.season || '')}</b> ${esc(x.meta.name)}
        <br><small>${esc(x.id)} · you: ${esc(x.role)}${x.meta.parentName ? ` · based on ${esc(x.meta.parentName)}` : ''}${x.meta.copiedFromName ? ` · rules from ${esc(x.meta.copiedFromName)}` : ''}</small></td>
      <td style="text-align:right" class="row">
        ${x.role === 'admin' ? `<a class="btn btn-sm" href="${pageUrl('admin.html', { a: x.id })}">Admin</a>` : ''}
        <a class="btn btn-sm" href="${pageUrl('live.html', { a: x.id })}">Live</a>
        <a class="btn btn-sm" href="${pageUrl('results.html', { a: x.id })}">Results</a>
      </td></tr>`).join('')}</tbody></table>`).join('');
}

// Create form: Major / Mini, the auctions to copy from or follow, and a suggested name.
function renderCreateOptions() {
  const tournament = $('#c-tournament').value.trim().toLowerCase();
  const names = [...new Set(known.map((x) => x.meta.tournament).filter(Boolean))];
  $('#c-tournaments').innerHTML = names.map((n) => `<option value="${esc(n)}">`).join('');
  // Same tournament first; all others after, so a renamed tournament still works.
  const real = known.filter((x) => !x.meta.mock); // a mock auction is never copied or followed
  const ordered = [...real.filter((x) => (x.meta.tournament || '').toLowerCase() === tournament), ...real.filter((x) => (x.meta.tournament || '').toLowerCase() !== tournament)];
  const keepCopy = $('#c-copy').value;
  const keepParent = $('#c-parent').value;
  $('#c-copy').innerHTML = '<option value="">Nothing: start from the setup questionnaire</option>'
    + ordered.map((x) => `<option value="${esc(x.id)}">${esc(label(x))}</option>`).join('');
  $('#c-parent').innerHTML = '<option value="">Choose the auction it follows…</option>'
    + ordered.filter((x) => x.role === 'admin').map((x) => `<option value="${esc(x.id)}">${esc(label(x))}${x.meta.status === 'completed' ? '' : ' (not ended yet)'}</option>`).join('');
  $('#c-copy').value = keepCopy;
  $('#c-parent').value = keepParent;
  $('#major-opts').classList.toggle('hidden', kind !== 'major');
  $('#mini-opts').classList.toggle('hidden', kind !== 'mini');
  document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
  $('#c-submit').textContent = kind === 'mini' ? 'Next: choose who each team keeps' : 'Create major auction';
  $('#c-name').placeholder = suggestedName() || 'Filled in from tournament and season';
}

function suggestedName() {
  const t = $('#c-tournament').value.trim();
  const season = $('#c-season').value.trim();
  if (!t && !season) return '';
  return [t, season, kind === 'mini' ? 'mini auction' : 'player auction'].filter(Boolean).join(' ');
}

async function renderArchive() {
  try {
    const res = await fetch('archive/index.json', { cache: 'no-cache' });
    const list = (await res.json()).auctions || [];
    // Any number of entries, grouped by tournament, newest first.
    const groups = new Map();
    for (const x of [...list].sort((p, q) => String(q.date || q.season || '').localeCompare(String(p.date || p.season || ''), undefined, { numeric: true }))) {
      const t = x.tournament || '';
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(x);
    }
    const item = (x) => `<li><a href="${pageUrl('results.html', { archive: x.slug })}">${esc(x.name)}</a> <small>${esc([x.season && `season ${x.season}`, x.kind === 'mini' && 'mini', x.date].filter(Boolean).join(' · '))}</small></li>`;
    $('#archive').innerHTML = list.length
      ? [...groups].map(([t, items]) => `${t && groups.size > 1 ? `<h3 style="margin:var(--space-3) 0 var(--space-1)">${esc(t)}</h3>` : ''}<ul>${items.map(item).join('')}</ul>`).join('')
      : '<p class="muted">No archived auctions yet.</p>';
  } catch {
    $('#archive').innerHTML = '<p class="muted">No archived auctions yet.</p>';
  }
}

function updateJoinFields() {
  const role = $('#join-role').value;
  $('#join-team-wrap').classList.toggle('hidden', !['captain', 'vc', 'member'].includes(role));
  $('#join-code-wrap').classList.toggle('hidden', !['captain', 'vc', 'admin'].includes(role));
  $('#join-name-wrap').classList.toggle('hidden', !['captain', 'vc', 'admin'].includes(role));
  $('#join-code-label').textContent = role === 'admin' ? 'Admin code (from the person who created the auction)'
    : role === 'vc' ? 'Vice-captain code for this team (from the organiser)' : 'Captain code for this team (from the organiser)';
}

async function find(code) {
  const aid = code.trim().toUpperCase();
  const { meta, ok } = await viewGate(aid);
  if (!meta) { toast('No auction with that code. Check it with the organiser.', 'error'); return; }
  // A private auction: only organisers (admin code) can get in until it is opened.
  const [teams, rules] = ok ? await Promise.all([db.get(`auctions/${aid}/teams`), db.get(`auctions/${aid}/rules`)]) : [{}, {}];
  found = { aid, meta, teams: teams || {} };
  $('#join-private').classList.toggle('hidden', ok || visibilityOf(meta) !== 'private');
  $$('#join-role option').forEach((o) => { o.disabled = !ok && o.value !== 'admin'; });
  if (!ok) $('#join-role').value = 'admin';
  $('#join-code').value = aid;
  $('#join-name').textContent = meta.name;
  $('#join-status').innerHTML = badge(meta.status === 'live' ? 'live' : meta.status === 'completed' ? 'sold' : 'upcoming', { text: meta.status === 'live' ? 'Live' : meta.status === 'completed' ? 'Completed' : 'Not started' });
  $('#join-team').innerHTML = Object.entries(found.teams).map(([id, t]) => `<option value="${esc(id)}">${esc(t.name)}</option>`).join('')
    || '<option value="">(no teams yet)</option>';
  // Vice-captains get their own option only when this tournament lets them bid.
  $('#join-role option[value="vc"]').hidden = !vcCanBid(withDefaults(rules));
  if ($('#join-role').value === 'vc' && $('#join-role option[value="vc"]').hidden) $('#join-role').value = 'audience';
  $('#join-step').classList.remove('hidden');
  updateJoinFields();
}

$('#find-form').addEventListener('submit', (e) => { e.preventDefault(); find($('#join-code').value); });
$('#join-role').addEventListener('change', updateJoinFields);

$('#join-go').addEventListener('click', async () => {
  if (!found) return;
  const { aid, meta } = found;
  const role = $('#join-role').value;
  const team = $('#join-team').value || null;
  const code = $('#join-secret').value.trim().toUpperCase();
  const person = $('#join-person').value.trim();
  try {
    if (role === 'captain' || role === 'vc') {
      if (!team) throw new Error('Choose a team');
      await claimCaptain(aid, team, code, person, role === 'vc' ? 'VC' : 'C');
    }
    if (role === 'admin' && !(await isAdmin(aid, meta))) await claimCoadmin(aid, code, person);
  } catch (e) {
    toast(e.message, 'error');
    return;
  }
  setSession(aid, { role, team: ['captain', 'vc', 'member'].includes(role) ? team : null });
  rememberAuction(aid, meta.name, role);
  location.href = role === 'admin' ? pageUrl('admin.html', { a: aid }) : pageUrl('live.html', { a: aid, ...(role === 'screen' ? { screen: 1 } : {}) });
});

if (!isLocal) {
  $('#google-wrap').classList.remove('hidden');
  const who = () => {
    const u = db.user();
    $('#who').textContent = u && !u.isAnonymous ? `Signed in as ${u.email || u.displayName}` : 'Not signed in (you can still continue)';
  };
  who();
  $('#google-btn').addEventListener('click', async () => {
    try { await db.signInGoogle(); who(); await refreshOrganiser(); await loadKnown(); renderMine(); renderCreateOptions(); } catch (e) { toast(e.message, 'error'); }
  });
  refreshOrganiser();
}

// Who may create auctions here: approved organisers only (the database rules enforce it).
async function refreshOrganiser() {
  const st = await organiserStatus().catch(() => ({ can: false, why: 'error' }));
  $('#c-submit').disabled = !st.can;
  $('#c-record').disabled = !st.can;
  const box = $('#org-status');
  box.innerHTML = st.can
    ? `<p class="notice notice-ok" style="margin:0">✓ ${esc(st.email)} can create auctions${st.owner ? ' and manage the organisers list (below)' : ''}.</p>`
    : st.why === 'signin' ? '<p class="notice notice-info" style="margin:0">Only approved organisers can create auctions here. <b>Sign in with Google</b> to check. Watching, joining with a code and bidding need no sign-in.</p>'
      : st.why === 'no-owner' ? `<p class="notice notice-warn" style="margin:0">Nobody runs this site yet. If it's yours, claim it: you become the site owner and decide who can create auctions. <button type="button" class="btn-sm btn-primary" id="claim-site">Become the site owner</button></p>`
        : st.why === 'not-listed' ? `<p class="notice notice-warn" style="margin:0"><b>${esc(st.email)}</b> isn't on the organisers list. Ask the site owner to add this Gmail; you can still watch and join auctions with a code.</p>`
          : '<p class="notice notice-warn" style="margin:0">Could not check the organisers list. Try again in a moment.</p>';
  if ($('#claim-site')) $('#claim-site').onclick = async () => {
    if (!confirm(`Make ${st.email} the owner of this AuctionXI site? Only you (and anyone you add) will be able to create auctions.`)) return;
    try { await claimSite(); toast('You are the site owner. Add the other organisers below.', 'ok'); await refreshOrganiser(); } catch (e) { toast(e.message, 'error'); }
  };
  await renderOrganisers(st);
}

async function renderOrganisers(st) {
  const card = $('#org-card');
  card.classList.toggle('hidden', !st.owner);
  if (!st.owner) return;
  const list = await listOrganisers().catch(() => []);
  card.innerHTML = `<h3 style="margin-top:0">Organisers who can create auctions</h3>
    <div class="stack" style="gap:var(--space-2)">${list.map((o) => `<div class="row" style="padding:var(--space-2) var(--space-3);border:1px solid var(--line);border-radius:var(--radius-sm)">
      <b style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(o.email)}</b>${o.owner ? badge('live', { text: 'Site owner' }) : ''}
      ${o.email === st.email ? '<small class="muted">you</small>' : `<button type="button" class="btn-sm btn-ghost" data-org-del="${esc(o.key)}" data-org-owner="${o.owner ? 1 : ''}">Remove</button>`}</div>`).join('')}</div>
    <form id="org-add" class="row" style="margin-top:var(--space-3)">
      <input id="org-email" type="email" placeholder="name@gmail.com" required style="flex:1;min-width:200px">
      <label class="check" style="margin:0"><input type="checkbox" id="org-owner"> Also a site owner (can add others)</label>
      <button class="btn-sm btn-primary">Add</button>
    </form>
    <p class="hint">They sign in with this Google account on the home page to create auctions. Removing someone doesn't touch the auctions they already made.</p>`;
  $('#org-add').onsubmit = async (e) => {
    e.preventDefault();
    try { await addOrganiser($('#org-email').value, { owner: $('#org-owner').checked }); toast('Organiser added', 'ok'); await renderOrganisers(st); } catch (err) { toast(err.message, 'error'); }
  };
  $$('[data-org-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Remove this organiser? They will no longer be able to create auctions.')) return;
    try { await removeOrganiser(b.dataset.orgDel, { owner: !!b.dataset.orgOwner }); await renderOrganisers(st); } catch (err) { toast(err.message, 'error'); }
  }));
}

document.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { kind = b.dataset.kind; renderCreateOptions(); }));
['#c-tournament', '#c-season'].forEach((sel) => $(sel).addEventListener('input', renderCreateOptions));
$('#c-season').value ||= String(new Date().getFullYear());

$('#create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#c-submit');
  btn.disabled = true;
  try {
    const name = $('#c-name').value.trim() || suggestedName();
    const season = $('#c-season').value.trim();
    if (!name) throw new Error('Enter the tournament or an auction name');
    if (kind === 'mini') {
      // A mini auction is built from the auction it follows: that auction's Results tab lists every
      // team's players to keep or release (admin access to it is needed).
      const parent = ($('#c-parent-code').value.trim() || $('#c-parent').value).toUpperCase();
      if (!parent) throw new Error('Choose the auction this mini auction follows');
      if (!(await db.get(`auctions/${parent}/meta`))) throw new Error(`No auction with code ${parent}`);
      location.href = pageUrl('admin.html', { a: parent, mini: 1, mname: name, season });
      return;
    }
    const copyId = $('#c-copy').value;
    let copyFrom = null;
    if (copyId) {
      const v = await db.get(`auctions/${copyId}`);
      if (!v) throw new Error('Could not read the auction to copy from');
      copyFrom = { ...normalize(v), id: copyId, media: await db.get(`media/${copyId}`).catch(() => null) };
    }
    const { aid, adminCode } = await createAuction({
      name,
      tournament: $('#c-tournament').value.trim() || copyFrom?.meta.tournament || '',
      season,
      venue: $('#c-venue').value.trim(),
      date: $('#c-date').value,
      organiser: $('#c-organiser').value.trim() || copyFrom?.meta.organiser || '',
      copyFrom,
    });
    setSession(aid, { role: 'admin' });
    rememberAuction(aid, name, 'admin');
    location.href = pageUrl('admin.html', { a: aid, created: adminCode });
  } catch (err) {
    toast(/permission/i.test(err.message) ? 'Only approved organisers can create auctions: sign in with Google with an approved Gmail (see above).' : err.message, 'error');
    btn.disabled = false;
  }
});

loadKnown().then(() => { renderMine(); renderCreateOptions(); });
renderCreateOptions();
renderArchive();
if (param('a')) find(param('a'));

// Auctions the organisers listed on the home page ("Listed" in Access and sharing).
if (!isLocal) {
  db.on('directory', (d) => {
    const order = { live: 0, setup: 1, completed: 2 };
    const items = Object.entries(d || {}).sort(([, x], [, y]) => (order[x.status] ?? 1) - (order[y.status] ?? 1));
    $('#open-now').classList.toggle('hidden', !items.length);
    $('#open-now').innerHTML = items.length ? `<h3 style="margin:0 0 var(--space-2)">Auctions open now</h3>
      <div class="stack" style="gap:var(--space-2)">${items.map(([id, x]) => `
        <div class="row" style="justify-content:space-between;border:1px solid var(--line);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3)">
          <div style="min-width:0"><b>${esc(x.name)}</b> ${badge(x.status === 'live' ? 'live' : x.status === 'completed' ? 'sold' : 'upcoming', { text: x.status === 'live' ? 'Live' : x.status === 'completed' ? 'Completed' : 'Coming up' })}
            <br><small class="muted">${esc([x.tournament, x.season && `Season ${x.season}`, x.date, x.time, x.venue].filter(Boolean).join(' · '))}</small></div>
          <div class="row"><a class="btn btn-sm" href="${pageUrl('live.html', { a: id })}">Watch</a>
            <button type="button" class="btn-sm" data-join="${esc(id)}">Join with a code</button></div>
        </div>`).join('')}</div>` : '';
    $$('[data-join]').forEach((b) => (b.onclick = () => find(b.dataset.join)));
  });
}

// A past auction kept as a record (an AuctionXI auction.json, e.g. from Results → Full auction JSON).
$('#c-record').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const snap = JSON.parse(await file.text());
    const n = Object.keys(snap.sales || {}).length;
    if (!confirm(`Add "${snap.meta?.name || file.name}" as a finished auction record (${n} sales)? It stays private to you.`)) return;
    const { aid } = await importAuction(snap);
    rememberAuction(aid, snap.meta.name, 'admin');
    location.href = pageUrl('admin.html', { a: aid, tab: 'results' });
  } catch (err) {
    toast(err instanceof SyntaxError ? 'That file is not valid JSON' : err.message, 'error');
  }
});
