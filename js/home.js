import { db, isLocal } from './db.js';
import { createAuction, claimCaptain, claimCoadmin, isAdmin } from './actions.js';
import { $, esc, toast, mountHeader, setSession, rememberAuction, myAuctions, pageUrl, param } from './ui.js';

mountHeader();

let found = null; // { aid, meta, teams }

function renderMine() {
  const list = myAuctions();
  if (!list.length) return;
  $('#mine').innerHTML = `<table><tbody>${list.map((x) => `
    <tr><td><b>${esc(x.name)}</b><br><small>${esc(x.id)} · ${esc(x.role)}</small></td>
    <td style="text-align:right">
      ${x.role === 'admin' ? `<a class="btn btn-sm" href="${pageUrl('admin.html', { a: x.id })}">Admin</a>` : ''}
      <a class="btn btn-sm" href="${pageUrl('live.html', { a: x.id })}">Live</a>
      <a class="btn btn-sm" href="${pageUrl('results.html', { a: x.id })}">Results</a>
    </td></tr>`).join('')}</tbody></table>`;
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
  $('#join-team-wrap').classList.toggle('hidden', !['captain', 'member'].includes(role));
  $('#join-code-wrap').classList.toggle('hidden', !['captain', 'admin'].includes(role));
  $('#join-name-wrap').classList.toggle('hidden', !['captain', 'admin'].includes(role));
  $('#join-code-label').textContent = role === 'admin' ? 'Admin code (from the auction creator)' : 'Captain code for this team (from the admin)';
}

async function find(code) {
  const aid = code.trim().toUpperCase();
  const [meta, teams] = await Promise.all([db.get(`auctions/${aid}/meta`), db.get(`auctions/${aid}/teams`)]);
  if (!meta) { toast('No auction with that code', 'error'); return; }
  found = { aid, meta, teams: teams || {} };
  $('#join-code').value = aid;
  $('#join-name').textContent = meta.name;
  $('#join-status').textContent = meta.status;
  $('#join-team').innerHTML = Object.entries(found.teams).map(([id, t]) => `<option value="${esc(id)}">${esc(t.name)}</option>`).join('')
    || '<option value="">(no teams yet)</option>';
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
    if (role === 'captain') {
      if (!team) throw new Error('Choose a team');
      await claimCaptain(aid, team, code, person);
    }
    if (role === 'admin' && !(await isAdmin(aid, meta))) await claimCoadmin(aid, code, person);
  } catch (e) {
    toast(e.message, 'error');
    return;
  }
  setSession(aid, { role, team: ['captain', 'member'].includes(role) ? team : null });
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

$('#create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const { aid, adminCode } = await createAuction({
      name: $('#c-name').value.trim(),
      tournament: $('#c-tournament').value.trim(),
      venue: $('#c-venue').value.trim(),
      date: $('#c-date').value,
      organiser: $('#c-organiser').value.trim(),
    });
    setSession(aid, { role: 'admin' });
    rememberAuction(aid, $('#c-name').value.trim(), 'admin');
    location.href = pageUrl('admin.html', { a: aid, created: adminCode });
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
  }
});

renderMine();
renderArchive();
if (param('a')) find(param('a'));
