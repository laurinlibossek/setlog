// IndexedDB persistence with automatic reconnect.
// Safari can drop the IndexedDB connection while a home-screen app sits in the
// background ("Connection to Indexed Database server lost"), so every operation
// reopens the database and retries once before giving up.

const NAME = 'setlog';
const VERSION = 1;
export const STORES = ['exercises', 'workouts', 'templates', 'measurements'];

let dbPromise = null;
export let available = typeof indexedDB !== 'undefined';

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(NAME, VERSION); } catch (e) { reject(e); return; }
    const timer = setTimeout(() => reject(new Error('Opening the database timed out')), 6000);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { clearTimeout(timer); reject(req.error || new Error('Could not open database')); };
    req.onblocked = () => { /* another tab holds an old version; wait for timeout */ };
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

async function run(storeNames, mode, fn) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        let t;
        try { t = db.transaction(storeNames, mode); } catch (e) { reject(e); return; }
        let out;
        t.oncomplete = () => resolve(out && typeof out === 'object' && 'result' in out && out instanceof IDBRequest ? out.result : out);
        t.onerror = () => reject(t.error || new Error('Transaction failed'));
        t.onabort = () => reject(t.error || new Error('Transaction aborted'));
        try { out = fn(t); } catch (e) { try { t.abort(); } catch (_) { /* ignore */ } reject(e); }
      });
    } catch (e) {
      lastErr = e;
      dbPromise = null; // force reconnect on retry
    }
  }
  throw lastErr;
}

export async function loadAll() {
  const data = {};
  await run([...STORES, 'kv'], 'readonly', (t) => {
    for (const s of STORES) {
      const r = t.objectStore(s).getAll();
      r.onsuccess = () => { data[s] = r.result || []; };
    }
    const kv = t.objectStore('kv');
    const keysReq = kv.getAllKeys();
    const valsReq = kv.getAll();
    let keys, vals;
    keysReq.onsuccess = () => { keys = keysReq.result; if (vals) data.kv = zip(keys, vals); };
    valsReq.onsuccess = () => { vals = valsReq.result; if (keys) data.kv = zip(keys, vals); };
  });
  data.kv = data.kv || {};
  return data;
}
function zip(keys, vals) { const o = {}; keys.forEach((k, i) => { o[k] = vals[i]; }); return o; }

export const put = (store, obj) => run([store], 'readwrite', (t) => { t.objectStore(store).put(obj); });
export const putMany = (store, arr) => run([store], 'readwrite', (t) => {
  const os = t.objectStore(store);
  for (const o of arr) os.put(o);
});
export const del = (store, id) => run([store], 'readwrite', (t) => { t.objectStore(store).delete(id); });
export const kvSet = (key, value) => run(['kv'], 'readwrite', (t) => {
  if (value === undefined || value === null) t.objectStore('kv').delete(key);
  else t.objectStore('kv').put(value, key);
});

/** Replace everything (used by backup restore and "delete all data"). */
export const replaceAll = (data) => run([...STORES, 'kv'], 'readwrite', (t) => {
  for (const s of STORES) {
    const os = t.objectStore(s);
    os.clear();
    for (const o of data[s] || []) os.put(o);
  }
  const kv = t.objectStore('kv');
  kv.clear();
  for (const [k, v] of Object.entries(data.kv || {})) if (v !== undefined && v !== null) kv.put(v, k);
});

export async function probe() {
  if (!available) return false;
  try { await open(); return true; } catch (e) { available = false; return false; }
}
