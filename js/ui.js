// Small DOM helpers shared by every page.

import { isLocal } from './db.js';
import * as config from './config.js';

// Older or test copies of config.js may not have these.
const siteUrl = config.siteUrl || '';
const projectUrl = config.projectUrl ?? '';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const param = (name) => new URLSearchParams(location.search).get(name);

// action: { label, onClick } adds a button (and keeps the message up longer).
export function toast(msg, type = 'info', { action = null } = {}) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn-sm';
    b.style.cssText = 'margin-left:8px;pointer-events:auto';
    b.textContent = action.label;
    b.onclick = () => { t.remove(); action.onClick(); };
    t.append(b);
    t.style.pointerEvents = 'auto';
  }
  box.append(t);
  setTimeout(() => t.remove(), action ? 12000 : 4000);
}

export function download(filename, text, mime = 'text/csv') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}

// Per-auction role chosen on this device.
export function getSession(aid) {
  try { return JSON.parse(localStorage.getItem(`auctionxi:session:${aid}`)) || {}; } catch { return {}; }
}
export function setSession(aid, s) {
  localStorage.setItem(`auctionxi:session:${aid}`, JSON.stringify(s));
}

export function rememberAuction(aid, name, role) {
  const list = myAuctions().filter((x) => x.id !== aid);
  list.unshift({ id: aid, name, role, at: Date.now() });
  localStorage.setItem('auctionxi:mine', JSON.stringify(list.slice(0, 20)));
}
export function myAuctions() {
  try { return JSON.parse(localStorage.getItem('auctionxi:mine')) || []; } catch { return []; }
}

// A banner while the database can't be reached (shown only after it has been connected once).
export function watchConnection(db, { text, extra = '' } = {}) {
  let was = false;
  let timer = null;
  db.onConnection?.((online) => {
    clearTimeout(timer);
    let bar = document.getElementById('offline-bar');
    if (online) { was = true; bar?.remove(); return; }
    if (!was) return;
    timer = setTimeout(() => { // ignore a blip of a second or two
      if (!bar) { bar = document.createElement('div'); bar.id = 'offline-bar'; bar.className = 'offline-bar'; document.body.prepend(bar); }
      bar.innerHTML = `<b>Offline.</b> ${text}${extra}`;
      bar.querySelector('[data-offline-action]')?.addEventListener('click', (e) => document.dispatchEvent(new CustomEvent('offline-action', { detail: e.target.dataset.offlineAction })));
    }, 2500);
  });
}

export function pageUrl(page, params) {
  const u = new URL(page, location.href);
  for (const [k, v] of Object.entries(params || {})) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

// A link to send to other people (join links, QR codes, posters, messages). It follows the address
// this page is on, so any domain works with no setup; config.siteUrl overrides it when set.
export function shareUrl(page, params) {
  if (!siteUrl) return pageUrl(page, params);
  const base = /\/$/.test(siteUrl) ? siteUrl : `${siteUrl}/`;
  const u = new URL(page, base);
  for (const [k, v] of Object.entries(params || {})) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

// The project's guide, or '' when config.projectUrl is empty (self-hosted copies can hide it).
export const projectLink = (path = '') => (projectUrl ? `${projectUrl.replace(/\/$/, '')}${path}` : '');

export function modeBadge() {
  // In demo mode the badge links to the guide for connecting the free database.
  const el = document.createElement(isLocal ? 'a' : 'span');
  if (isLocal) { el.href = projectLink('/blob/main/docs/SETUP.md') || 'docs/SETUP.md'; el.target = '_blank'; el.rel = 'noopener'; }
  el.className = `mode-badge ${isLocal ? 'mode-demo' : 'mode-live'}`;
  el.textContent = isLocal ? 'Demo mode' : 'Connected';
  el.title = isLocal
    ? 'No database connected yet: data stays in this browser only. Click for the 10-minute setup that lets phones join.'
    : 'Connected to Firebase Realtime Database';
  return el;
}

export function mountHeader(extra = '') {
  const header = $('header.top');
  if (!header) return;
  header.innerHTML = `
    <a class="brand" href="index.html">AuctionXI</a>
    <div class="top-extra">${extra}</div>`;
  header.append(modeBadge());
}

// Commentary language chosen on this device ('' = the tournament's default).
export function deviceCommLang() {
  try { return localStorage.getItem('auctionxi:commlang') || ''; } catch { return ''; }
}
export function setDeviceCommLang(l) {
  try { if (l) localStorage.setItem('auctionxi:commlang', l); else localStorage.removeItem('auctionxi:commlang'); } catch { /* private mode */ }
}
