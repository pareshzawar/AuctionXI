import { db, isLocal } from './db.js';
import { createAuction, claimCaptain, claimCoadmin, isAdmin } from './actions.js';
import { $, esc, toast, mountHeader, setSession, rememberAuction, myAuctions, pageUrl, param } from './ui.js';
import { badge } from './ds.js';
import { vcCanBid, withDefaults, normalize } from './engine.js';

mountHeader();

let found = null; // { aid, meta, teams }

// Auctions this device knows, with their meta, newest season first: [{ id, role, meta }].
let known = [];
let kind = 'major';

async function loadKnown() {
  const list = myAuctions();
  const metas = await Promise.all(list.map((x) => db.get(`auctions/${x.id}/meta`).catch(() => null)));
  known = list.map((x, i) => ({ ...x, meta: metas[i] })).filter((x) => x.meta)
    .sort((x, y) => String(y.meta.season || '').localeCompare(String(x.meta.season || ''), undefined, { numeric: true }) || (y.meta.createdAt || 0) - (x.meta.createdAt || 0));
}

const kindBadge = (m) => badge(m.kind === 'mini' ? 'retained' : 'upcoming', { text: m.kind === 'mini' ? 'Mini' : 'Major' });
const statusText = (m) => (m.status === 'live' ? 'live' : m.status === 'completed' ? 'completed' : 'in setup');
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
      <tr><td>${kindBadge(x.meta)} <b>${esc(x.meta.season || '')}</b> ${esc(x.meta.name)}
        <br><small>${esc(x.id)} · ${statusText(x.meta)} · you: ${esc(x.role)}${x.meta.parentName ? ` · based on ${esc(x.meta.parentName)}` : ''}${x.meta.copiedFromName ? ` · rules from ${esc(x.meta.copiedFromName)}` : ''}</small></td>
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
  const ordered = [...known.filter((x) => (x.meta.tournament || '').toLowerCase() === tournament), ...known.filter((x) => (x.meta.tournament || '').toLowerCase() !== tournament)];
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
    $('#archive').innerHTML = list.length
      ? `<ul>${list.map((x) => `<li><a href="${pageUrl('results.html', { archive: x.slug })}">${esc(x.name)}</a> <small>${esc(x.date || '')}</small></li>`).join('')}</ul>`
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
  const [meta, teams, rules] = await Promise.all([db.get(`auctions/${aid}/meta`), db.get(`auctions/${aid}/teams`), db.get(`auctions/${aid}/rules`)]);
  if (!meta) { toast('No auction with that code. Check it with the organiser.', 'error'); return; }
  found = { aid, meta, teams: teams || {} };
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
    try { await db.signInGoogle(); who(); } catch (e) { toast(e.message, 'error'); }
  });
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
      copyFrom = { ...normalize(v), id: copyId };
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
    toast(err.message, 'error');
    btn.disabled = false;
  }
});

loadKnown().then(() => { renderMine(); renderCreateOptions(); });
renderCreateOptions();
renderArchive();
if (param('a')) find(param('a'));
