// Regenerates css/tokens.css from design/tokens.json (the AuctionXI design system).
// Run: node tools/build-tokens.mjs
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const t = JSON.parse(fs.readFileSync(new URL('design/tokens.json', root), 'utf8'));
const first = t.color.themes[0].id;
const val = (v, th) => (typeof v === 'string' ? v : v[th] ?? v[first]);
const ref = (s) => String(s).replace(/^\{(.+)\}$/, 'var(--$1)');

const night = [];
const day = [];
for (const k of t.color.tokens) {
  night.push(`  --${k.name}: ${ref(val(k.value, 'night'))};`);
  if (typeof k.value !== 'string') day.push(`  --${k.name}: ${val(k.value, 'day')};`);
}
for (const k of t.shadow.tokens) {
  night.push(`  --${k.name}: ${val(k.value, 'night')};`);
  day.push(`  --${k.name}: ${val(k.value, 'day')};`);
}
const flat = [];
for (const fam of ['spacing', 'radius', 'breakpoint', 'layer']) for (const k of t[fam].tokens) flat.push(`  --${k.name}: ${k.value};`);
for (const [k, v] of Object.entries(t.type.families)) flat.push(`  --font-${k}: ${v};`);
const faces = t.type.fonts.map((f) => `@font-face { font-family: "${f.family}"; src: url("../${f.file}") format("woff2"); font-weight: ${f.weight}; font-style: ${f.style}; font-display: swap; }`).join('\n');

fs.writeFileSync(new URL('css/tokens.css', root), `/* AuctionXI - generated from design/tokens.json (the Claude Design system) by tools/build-tokens.mjs. Do not edit by hand. */
${faces}

:root {
${flat.join('\n')}
${night.join('\n')}
}
/* Day theme: admin and phones follow the device setting; the stage forces night. */
@media (prefers-color-scheme: light) {
  :root:not([data-theme="night"]) {
${day.map((l) => '  ' + l).join('\n')}
  }
}
[data-theme="day"] {
${day.join('\n')}
}
`);
console.log('css/tokens.css written');
