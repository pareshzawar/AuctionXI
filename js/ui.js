// Small DOM helpers shared by every page.

import { isLocal } from './db.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const param = (name) => new URLSearchParams(location.search).get(name);

export function toast(msg, type = 'info') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), 4000);
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

export function pageUrl(page, params) {
  const u = new URL(page, location.href);
  for (const [k, v] of Object.entries(params || {})) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

export function modeBadge() {
  const el = document.createElement('span');
  el.className = `mode-badge ${isLocal ? 'mode-demo' : 'mode-live'}`;
  el.textContent = isLocal ? 'Demo mode' : 'Connected';
  el.title = isLocal
    ? 'No Firebase config: data stays in this browser only. See docs/SETUP.md to let phones join.'
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
