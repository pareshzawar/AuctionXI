// CSV parsing / writing and the player + team templates.

import { ROLES } from './engine.js';

export const PLAYER_COLUMNS = [
  'id', 'name', 'role', 'category', 'base_price', 'batting_style', 'bowling_style', 'age',
  'locality', 'photo_url', 'matches', 'runs', 'wickets', 'notes', 'retained_by', 'retained_price',
];

export const TEAM_COLUMNS = ['id', 'name', 'short_name', 'color', 'owner', 'captain', 'logo_url'];

const PLAYER_EXAMPLE = [
  ['P001', 'Rohan Patil', 'All-rounder', 'A', '', 'Right-hand bat', 'Right-arm medium', '28', 'Wing A - 302', '', '12', '340', '9', 'Opening bat', '', ''],
  ['P002', 'Amit Shah', 'Wicket-keeper', 'B', '600', 'Left-hand bat', '', '34', 'Wing C - 105', '', '8', '150', '0', '', '', ''],
  ['P003', 'Vikram Rao', 'Bowler', 'C', '', 'Right-hand bat', 'Left-arm spin', '22', 'Wing B - 410', '', '', '', '', 'Captain of Tigers', 'T1', '0'],
];

const TEAM_EXAMPLE = [
  ['T1', 'Wing A Tigers', 'TIG', '#f59e0b', 'Mr. Kulkarni', 'Vikram Rao', ''],
  ['T2', 'Wing B Warriors', 'WAR', '#3b82f6', 'Mrs. Desai', 'Sanjay Mehta', ''],
];

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(header, rows) {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const playerTemplate = () => toCSV(PLAYER_COLUMNS, PLAYER_EXAMPLE);
export const teamTemplate = () => toCSV(TEAM_COLUMNS, TEAM_EXAMPLE);

function normRole(r) {
  const s = String(r || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return 'All-rounder';
  if (s.startsWith('wk') || s.includes('keeper')) return 'Wicket-keeper';
  if (s.startsWith('all') || s === 'ar') return 'All-rounder';
  if (s.startsWith('bowl')) return 'Bowler';
  if (s.startsWith('bat')) return 'Batsman';
  return ROLES.find((x) => x.toLowerCase() === s) || 'All-rounder';
}

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

// Returns { players: {id: player}, warnings: [string] }
export function importPlayers(rows, rules, existingIds = []) {
  const warnings = [];
  const players = {};
  const catIds = (rules.categories || []).map((c) => c.id);
  const used = new Set(existingIds);
  let n = existingIds.length;
  rows.forEach((r, i) => {
    const line = i + 2;
    if (!r.name) { warnings.push(`Row ${line}: skipped (no name)`); return; }
    let id = String(r.id || '').trim().replace(/[.#$/[\]]/g, '');
    if (!id || used.has(id)) {
      if (id) warnings.push(`Row ${line}: duplicate id "${id}", assigned a new one`);
      do { id = 'P' + String(++n).padStart(3, '0'); } while (used.has(id));
    }
    used.add(id);
    let cat = String(r.category || '').trim();
    const byLabel = (rules.categories || []).find((c) => c.label.toLowerCase() === cat.toLowerCase());
    if (byLabel) cat = byLabel.id;
    if (!catIds.includes(cat)) {
      if (cat) warnings.push(`Row ${line}: unknown category "${cat}" for ${r.name}, set to ${catIds.at(-1)}`);
      cat = catIds.at(-1) || '';
    }
    players[id] = {
      name: r.name,
      role: normRole(r.role),
      category: cat,
      basePrice: num(r.base_price),
      battingStyle: r.batting_style || null,
      bowlingStyle: r.bowling_style || null,
      age: num(r.age),
      locality: r.locality || null,
      photoUrl: r.photo_url || null,
      matches: num(r.matches),
      runs: num(r.runs),
      wickets: num(r.wickets),
      notes: r.notes || null,
      retainedBy: r.retained_by || null,
      retainedPrice: num(r.retained_price),
    };
  });
  return { players, warnings };
}

export function importTeams(rows) {
  const warnings = [];
  const teams = {};
  const palette = ['#f59e0b', '#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#6366f1'];
  rows.forEach((r, i) => {
    if (!r.name) { warnings.push(`Row ${i + 2}: skipped (no name)`); return; }
    let id = String(r.id || '').trim().replace(/[.#$/[\]]/g, '') || 'T' + (i + 1);
    if (teams[id]) { warnings.push(`Row ${i + 2}: duplicate id "${id}"`); id = id + '_' + (i + 1); }
    teams[id] = {
      name: r.name,
      short: (r.short_name || r.name.slice(0, 3)).toUpperCase(),
      color: /^#[0-9a-f]{3,8}$/i.test(r.color) ? r.color : palette[Object.keys(teams).length % palette.length],
      owner: r.owner || null,
      captain: r.captain || null,
      logoUrl: r.logo_url || null,
    };
  });
  return { teams, warnings };
}

export function playersToCSV(players) {
  return toCSV(PLAYER_COLUMNS, Object.entries(players).map(([id, p]) => [
    id, p.name, p.role, p.category, p.basePrice, p.battingStyle, p.bowlingStyle, p.age, p.locality,
    p.photoUrl, p.matches, p.runs, p.wickets, p.notes, p.retainedBy, p.retainedPrice,
  ]));
}
