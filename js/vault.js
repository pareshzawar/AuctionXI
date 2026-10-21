// Encryption for the private workbook (PBKDF2 + AES-GCM, in the browser) and the scratch-pad calculator.
// No page imports, so it can be tested in Node.

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function keyFor(pin, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(obj, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, iv: b64(iv), data: b64(data), at: Date.now() };
}

export async function decryptJSON(box, key) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
  return JSON.parse(dec.decode(plain));
}

// Evaluate a scratch-pad sum like "650 - 7*50" (numbers, + - * / and brackets only).
export function calc(expr) {
  const s = String(expr).replace(/[₹,\s]/g, '').replace(/(\d+(?:\.\d+)?)l\b/gi, '($1*100000)').replace(/(\d+(?:\.\d+)?)cr\b/gi, '($1*10000000)');
  if (!s || !/^[\d+\-*/().]+$/.test(s)) return null;
  try {
    const v = Function(`"use strict"; return (${s});`)(); // only digits and operators reach here
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  } catch { return null; }
}
