// SOLD, celebrated: a gavel sound and confetti in the buying team's colours. Both are made in the
// browser (Web Audio and a canvas), so there are no files to load and nothing to pay for.
// Browsers only play sound after the page has been clicked or a key pressed once: soundReady()
// says whether that has happened, so the stage can ask for a click.

let ctx = null;
let unlocked = false;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = AC ? new AC() : null;
  return ctx;
}

// Unlock sound on the first click or key press (the browser's rule).
export function armSound(onReady = () => {}) {
  const go = () => {
    const c = audio();
    if (!c) return;
    c.resume().then(() => { unlocked = c.state === 'running'; if (unlocked) onReady(); }).catch(() => {});
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, go, { passive: true });
}
export const soundReady = () => unlocked;

// One wooden knock: a short filtered noise crack and a low thump.
function knock(c, at, loud = 1) {
  const len = Math.floor(c.sampleRate * 0.09);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = 'bandpass'; band.frequency.value = 1400; band.Q.value = 1.4;
  const g1 = c.createGain(); g1.gain.value = 0.9 * loud;
  noise.connect(band).connect(g1).connect(c.destination);
  noise.start(at);
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(190, at);
  osc.frequency.exponentialRampToValueAtTime(70, at + 0.16);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.0001, at);
  g2.gain.exponentialRampToValueAtTime(0.8 * loud, at + 0.005);
  g2.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  osc.connect(g2).connect(c.destination);
  osc.start(at); osc.stop(at + 0.22);
}

// Going, going, gone: three knocks, the last one the loudest.
export function gavel({ record = false } = {}) {
  const c = audio();
  if (!c || !unlocked) return false;
  const t = c.currentTime + 0.02;
  knock(c, t, 0.55);
  knock(c, t + 0.2, 0.7);
  knock(c, t + 0.42, 1);
  if (record) knock(c, t + 0.7, 1);
  return true;
}

// Confetti over the whole screen for about three seconds.
export function confetti({ colors = ['#f2b84b'], count = 160, big = false } = {}) {
  if (reduced() || typeof document === 'undefined') return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  cv.width = innerWidth * (devicePixelRatio || 1);
  cv.height = innerHeight * (devicePixelRatio || 1);
  document.body.append(cv);
  const g = cv.getContext('2d');
  const s = devicePixelRatio || 1;
  const palette = [...colors, '#f2b84b', '#ffffff'];
  const n = big ? count * 2 : count;
  const bits = Array.from({ length: n }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: (fromLeft ? 0.05 : 0.95) * cv.width, y: cv.height * 0.75,
      vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 9) * s, vy: -(12 + Math.random() * 12) * s,
      w: (6 + Math.random() * 6) * s, h: (10 + Math.random() * 8) * s,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      c: palette[i % palette.length],
    };
  });
  const start = performance.now();
  const step = (now) => {
    const t = now - start;
    g.clearRect(0, 0, cv.width, cv.height);
    for (const b of bits) {
      b.vy += 0.35 * s; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r);
      g.globalAlpha = Math.max(0, 1 - Math.max(0, t - 2200) / 900);
      g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)));
      g.restore();
    }
    if (t < 3100) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}
