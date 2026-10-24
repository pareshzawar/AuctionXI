// Pictures: player photos, the league logo and the league banner.
//
// Uploaded pictures are shrunk on the admin's device and stored as small JPEG/PNG data at
// media/{auction}, apart from the auction itself, so every bid stays a tiny update and each phone
// downloads the pictures once. No paid file storage is needed. A `photo_url` in the players CSV
// (or a Google Drive link) still works; an uploaded photo wins over it.

import { db } from './db.js';
import { esc } from './ui.js';

export const PHOTO = { w: 360, h: 480, type: 'image/jpeg', quality: 0.8 }; // 3:4, like the stage card
export const PHOTO_WHOLE = { max: 960, type: 'image/jpeg', quality: 0.82 }; // a ready-made poster: never cropped, only shrunk
export const LOGO = { max: 320, type: 'image/png' }; // keeps a transparent background
export const BANNER = { max: 2400, type: 'image/jpeg', quality: 0.85 }; // keeps its shape: a wide banner (2400 x 600 fills the live page's bar) or a poster

// Media are read part by part: the league logo, banner and team banners follow the auction's
// visibility, while player photos can be limited to captains, vice-captains and organisers
// (rules.photoAccess = 'bidders'); then the database sends them to nobody else.
const PARTS = ['logo', 'banner', 'teams', 'players'];
export function watchMedia(aid, cb) {
  const m = {};
  for (const k of PARTS) db.on(`media/${aid}/${k}`, (v) => { m[k] = v || null; cb({ ...m }); });
}
export async function getMedia(aid) {
  const vals = await Promise.all(PARTS.map((k) => db.get(`media/${aid}/${k}`).catch(() => null)));
  return Object.fromEntries(PARTS.map((k, i) => [k, vals[i]]));
}

// Who sees player photos (rules.photoAccess): everyone; everyone but watermarked and not
// saveable; or only captains, vice-captains and organisers (also watermarked).
export const PHOTO_ACCESS = {
  everyone: 'Everyone who can watch',
  protected: 'Everyone, watermarked and not saveable',
  bidders: 'Only captains, vice-captains and organisers (watermarked)',
};
export function protectPhotos(a) {
  if (typeof document === 'undefined' || !a) return;
  const on = !!a.rules.photoAccess && a.rules.photoAccess !== 'everyone';
  document.body.classList.toggle('photos-protected', on);
  document.body.style.setProperty('--wm', JSON.stringify(`${a.meta.tournament || a.meta.name} · do not share`));
}
if (typeof document !== 'undefined') {
  // No long-press menu, "save image" or dragging of protected photos.
  document.addEventListener('contextmenu', (e) => {
    if (document.body.classList.contains('photos-protected') && e.target.closest?.('.ax-photo, .ax-avatar, .stage-tile-photo, .photo-pick')) e.preventDefault();
  });
}

// Put uploaded photos and the branding on a normalised auction (call after every update).
export function applyMedia(a, m) {
  if (!a) return a;
  protectPhotos(a);
  a.media = m || {};
  for (const [pid, p] of Object.entries(a.players)) p.photoData = a.media.players?.[pid] || null;
  for (const [tid, t] of Object.entries(a.teams || {})) t.bannerData = a.media.teams?.[tid] || null;
  return a;
}

export const setPlayerPhoto = (aid, pid, data) => db.set(`media/${aid}/players/${pid}`, data || null);
export const setBrand = (aid, key, data) => db.set(`media/${aid}/${key}`, data || null);
export const setTeamBanner = (aid, tid, data) => db.set(`media/${aid}/teams/${tid}`, data || null);

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} is not a picture this browser can open`)); };
    img.src = url;
  });
}

// Shrink a picture. With w and h it is cropped from the centre to that shape (top-weighted for
// faces); with max it keeps its shape and fits inside max x max.
export async function resizeImage(file, { w, h, max, type = 'image/jpeg', quality = 0.8 }) {
  const img = await loadImage(file);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  let sx = 0; let sy = 0; let sw = iw; let sh = ih; let cw; let ch;
  if (w && h) {
    const want = w / h;
    if (iw / ih > want) { sw = ih * want; sx = (iw - sw) / 2; } else { sh = iw / want; sy = (ih - sh) * 0.25; }
    const scale = Math.min(1, w / sw);
    cw = Math.round(sw * scale); ch = Math.round(sh * scale);
  } else {
    const scale = Math.min(1, max / Math.max(iw, ih));
    cw = Math.round(iw * scale); ch = Math.round(ih * scale);
  }
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); }
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  return c.toDataURL(type, quality);
}

const plain = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');

// Match picture files to players by file name: the player ID (P001.jpg) or the name (Rohan Patil.jpg).
export function matchPhotoFiles(players, files) {
  const byId = new Map(Object.keys(players).map((id) => [plain(id), id]));
  const byName = new Map(Object.entries(players).map(([id, p]) => [plain(p.name), id]));
  const matched = [];
  const unmatched = [];
  for (const file of files) {
    const key = plain(file.name.replace(/\.[^.]+$/, ''));
    const pid = byId.get(key) || byName.get(key);
    if (pid) matched.push({ file, pid }); else unmatched.push(file.name);
  }
  return { matched, unmatched };
}

export function logoImg(a, { size = 48, cls = '' } = {}) {
  const src = a?.media?.logo;
  return src ? `<img class="league-logo ${cls}" src="${esc(src)}" alt="${esc(a.meta.tournament || a.meta.name)} logo" style="height:${size}px">` : '';
}

export function bannerImg(a, { cls = '' } = {}) {
  const src = a?.media?.banner;
  return src ? `<img class="league-banner ${cls}" src="${esc(src)}" alt="${esc(a.meta.tournament || a.meta.name)} banner">` : '';
}
