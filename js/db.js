// Storage backend. Same small API for both backends:
//   get, set, update (multi-path), push, remove, on (live listener), transaction,
//   uid, now (server-synced clock), signInGoogle.
//
// - Firebase Realtime Database when js/config.js has a config (real auctions).
// - Local demo backend otherwise: localStorage + BroadcastChannel, so tabs of
//   the same browser stay in sync.

import { firebaseConfig } from './config.js';

const FIREBASE_VERSION = '10.14.1';

const split = (p) => String(p).split('/').filter(Boolean);
const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

function prune(v) {
  if (v === undefined) return null;
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      v[k] = prune(v[k]);
      if (v[k] == null) delete v[k];
    }
    return Object.keys(v).length ? v : null;
  }
  return v;
}

function getAt(obj, parts) {
  for (const k of parts) {
    if (obj == null || typeof obj !== 'object') return null;
    obj = obj[k];
  }
  return obj === undefined ? null : obj;
}

function setAt(obj, parts, val) {
  if (!parts.length) return prune(clone(val));
  const node = obj && typeof obj === 'object' ? obj : {};
  const [k, ...rest] = parts;
  const child = setAt(node[k], rest, val);
  if (child == null) delete node[k];
  else node[k] = child;
  return Object.keys(node).length ? node : null;
}

let pushCounter = 0;
function pushId() {
  return Date.now().toString(36).padStart(9, '0') + (pushCounter++ % 1296).toString(36).padStart(2, '0') +
    Math.random().toString(36).slice(2, 7);
}

function localBackend() {
  const KEY = 'auctionxi:localdb';
  const listeners = new Set();
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('auctionxi') : null;

  let uid = sessionStorage.getItem('auctionxi:uid');
  if (!uid) {
    uid = 'local-' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('auctionxi:uid', uid);
  }

  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  };
  const emit = () => listeners.forEach((l) => l.fire());
  const save = (data) => {
    localStorage.setItem(KEY, JSON.stringify(data || {}));
    channel?.postMessage('changed');
    emit();
  };

  channel && (channel.onmessage = emit);
  window.addEventListener('storage', (e) => e.key === KEY && emit());

  return {
    name: 'local',
    uid: () => uid,
    user: () => ({ uid, isAnonymous: true }),
    now: () => Date.now(),
    async get(p) { return getAt(load(), split(p)); },
    async set(p, v) { save(setAt(load(), split(p), v)); },
    async update(p, obj) {
      let data = load();
      for (const [k, v] of Object.entries(obj)) data = setAt(data, split(`${p}/${k}`), v) || {};
      save(data);
    },
    async push(p, v) { const id = pushId(); await this.set(`${p}/${id}`, v); return id; },
    async remove(p) { await this.set(p, null); },
    onConnection(cb) { cb(true); return () => {}; },
    on(p, cb) {
      const l = { last: undefined };
      l.fire = () => {
        const v = getAt(load(), split(p));
        const s = JSON.stringify(v);
        if (s !== l.last) { l.last = s; cb(v); }
      };
      listeners.add(l);
      l.fire();
      return () => listeners.delete(l);
    },
    async transaction(p, fn) {
      const data = load();
      const next = fn(getAt(data, split(p)));
      if (next === undefined) return { committed: false };
      save(setAt(data, split(p), next));
      return { committed: true, value: next };
    },
    async signInGoogle() {},
  };
}

async function firebaseBackend(cfg) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, D, Au] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-database.js`),
    import(`${base}/firebase-auth.js`),
  ]);
  const app = initializeApp(cfg);
  const rtdb = D.getDatabase(app);
  const auth = Au.getAuth(app);

  await new Promise((resolve) => {
    const stop = Au.onAuthStateChanged(auth, () => { stop(); resolve(); });
  });
  if (!auth.currentUser) await Au.signInAnonymously(auth);

  let offset = 0;
  D.onValue(D.ref(rtdb, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });

  const ref = (p) => D.ref(rtdb, p);
  return {
    name: 'firebase',
    uid: () => auth.currentUser?.uid,
    user: () => auth.currentUser,
    now: () => Date.now() + offset,
    get: async (p) => (await D.get(ref(p))).val(),
    set: (p, v) => D.set(ref(p), v),
    update: (p, obj) => D.update(ref(p), obj),
    push: async (p, v) => (await D.push(ref(p), v)).key,
    remove: (p) => D.remove(ref(p)),
    // True while connected to the database. While offline, writes apply in this tab at once and are
    // queued; they are sent, in order, when the connection is back (lost if the tab is closed).
    onConnection: (cb) => D.onValue(ref('.info/connected'), (s) => cb(!!s.val())),
    on: (p, cb) => D.onValue(ref(p), (s) => cb(s.val()), (err) => console.warn('listen failed', p, err)),
    async transaction(p, fn) {
      const res = await D.runTransaction(ref(p), fn);
      return { committed: res.committed, value: res.snapshot.val() };
    },
    async signInGoogle() {
      const provider = new Au.GoogleAuthProvider();
      if (auth.currentUser?.isAnonymous) {
        try { await Au.linkWithPopup(auth.currentUser, provider); return; } catch (e) {
          const cred = Au.GoogleAuthProvider.credentialFromError(e);
          if (e.code !== 'auth/credential-already-in-use' || !cred) throw e;
          await Au.signInWithCredential(auth, cred);
          return;
        }
      }
      await Au.signInWithPopup(auth, provider);
    },
  };
}

async function init() {
  if (!firebaseConfig) return localBackend();
  try {
    return await firebaseBackend(firebaseConfig);
  } catch (e) {
    console.error('Firebase failed to start, falling back to demo mode', e);
    alert('Could not connect to Firebase (see console). Running in demo mode.\n\n' + e.message);
    return localBackend();
  }
}

export const db = await init();
export const isLocal = db.name === 'local';
