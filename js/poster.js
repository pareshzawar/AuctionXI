// A printable poster for the club house: the league banner, the date and venue, and a big QR code
// that opens the auction on any phone. poster.html?a=AUCTION[&size=a3][&theme=light]

import { db } from './db.js';
import { $, esc, param, pageUrl } from './ui.js';
import { qrSvg } from './qr.js';

const aid = (param('a') || '').toUpperCase();
const state = { size: param('size') === 'a3' ? 'a3' : 'a4', theme: param('theme') === 'light' ? 'light' : 'dark' };

function niceDate(d) {
  if (!d) return '';
  const t = new Date(`${d}T12:00:00`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function load() {
  const [meta, teams, media] = await Promise.all([
    db.get(`auctions/${aid}/meta`).catch(() => null),
    db.get(`auctions/${aid}/teams`).catch(() => null),
    db.get(`media/${aid}`).catch(() => null),
  ]);
  return { meta, teams: teams || {}, media: media || {} };
}

function draw({ meta, teams, media }) {
  const el = $('#poster');
  document.documentElement.dataset.paper = state.size;
  let page = $('#page-size');
  if (!page) { page = document.createElement('style'); page.id = 'page-size'; document.head.append(page); }
  page.textContent = `@page { size: ${state.size === 'a3' ? 'A3' : 'A4'} portrait; margin: 0; }`;
  el.className = `poster poster-${state.theme}${state.tall ? ' poster-tall' : ''}`;
  if (!meta) { el.innerHTML = '<div class="poster-body"><h1>Auction not found</h1><p>Open this page from Access and sharing in the admin console.</p></div>'; return; }
  const join = pageUrl('index.html', { a: aid });
  const when = [niceDate(meta.date), meta.time].filter(Boolean).join(' · ');
  const list = Object.values(teams);
  el.innerHTML = `
    ${media.banner ? `<div class="poster-banner"><img src="${esc(media.banner)}" alt=""></div>` : ''}
    <div class="poster-body">
      <div class="poster-head">
        ${media.logo ? `<img class="poster-logo" src="${esc(media.logo)}" alt="">` : ''}
        <div>
          <p class="poster-eyebrow">Live player auction${meta.season ? ` · Season ${esc(meta.season)}` : ''}</p>
          <h1>${esc(meta.tournament || meta.name || 'Player auction')}</h1>
          ${when || meta.venue ? `<p class="poster-when">${esc([when, meta.venue].filter(Boolean).join(' · '))}</p>` : ''}
        </div>
      </div>
      <div class="poster-main">
        <div class="poster-qr"><div id="qr"></div><p>Scan with your phone camera</p></div>
        <div class="poster-side">
          <h2>Watch every bid live</h2>
          <p>On any phone, in the hall or at home.</p>
          <p class="poster-code">Auction code <b>${esc(aid)}</b></p>
          <p class="poster-url">${esc(join.replace(/^https?:\/\//, ''))}</p>
        </div>
      </div>
      <ol class="poster-steps">
        <li><b>Scan</b> the code. No app, no login.</li>
        <li>Pick <b>Watch</b>, or your team. Captains use their own code.</li>
        <li>Follow the player on the block, every bid, the squads and the commentary.</li>
      </ol>
      ${list.length ? `<div class="poster-teams">${list.map((t) => `<span style="--c:${esc(t.color || '#f2b84b')}">${esc(t.name)}</span>`).join('')}</div>` : ''}
      <p class="poster-foot">${meta.organiser ? `${esc(meta.organiser)} · ` : ''}Powered by AuctionXI, free and open source</p>
    </div>`;
  $('#qr').innerHTML = qrSvg(join);
}

let data = null;
const redraw = () => data && draw(data);
for (const k of ['size', 'theme']) {
  const s = $(`#${k}`);
  s.value = state[k];
  s.onchange = () => { state[k] = s.value; redraw(); };
}
$('#print').onclick = () => print();
data = await load();
// A portrait banner (a poster) gets more room; a wide one sits across the top.
if (data.media?.banner) {
  const img = new Image();
  await new Promise((ok) => { img.onload = ok; img.onerror = ok; img.src = data.media.banner; });
  state.tall = img.naturalHeight > img.naturalWidth * 0.9;
}
draw(data);
