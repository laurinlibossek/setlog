// Sharing templates as links: <app url>#template=<base64url JSON>. Built-in
// exercises go by id, custom ones by name, category and body part, so the
// receiver gets matching exercises (or new custom ones) without any server.
const TYPE_CODE = { normal: 'n', warmup: 'w', drop: 'd', failure: 'f' };
const CODE_TYPE = Object.fromEntries(Object.entries(TYPE_CODE).map(([k, v]) => [v, k]));

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(code) {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** A template as a compact code for a share link. `exercises` maps id -> exercise. */
export function encodeTemplate(t, exercises) {
  const groups = new Map();
  const e = t.exercises.filter((x) => exercises.has(x.exerciseId)).map((x) => {
    const ex = exercises.get(x.exerciseId);
    const o = { n: ex.name, c: ex.category, b: ex.bodyPart };
    if (ex.builtin) o.i = ex.id;
    o.s = x.sets.map((st) => {
      const row = [TYPE_CODE[st.type || 'normal'] || 'n', st.w ?? null, st.r ?? null, st.d ?? null, st.t ?? null];
      while (row.length > 1 && row[row.length - 1] === null) row.pop();
      return row;
    });
    if (x.restSec !== null && x.restSec !== undefined) o.r = x.restSec;
    if (x.notes) o.o = x.notes;
    if (x.focus) o.m = x.focus;
    if (x.supersetId) {
      if (!groups.has(x.supersetId)) groups.set(x.supersetId, groups.size + 1);
      o.g = groups.get(x.supersetId);
    }
    return o;
  });
  const data = { v: 1, n: t.name, e };
  if (t.notes) data.f = t.notes;
  return b64urlEncode(JSON.stringify(data));
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 100000 ? v : null);

/**
 * Read a shared template out of a link (or any text containing one), keeping
 * only sane values. `categories` / `bodyParts` are the valid ids. Returns null
 * if the text holds none.
 * @param {string} text
 * @param {{ categories?: string[], bodyParts?: string[] }} [o]
 */
export function decodeTemplate(text, { categories = [], bodyParts = [] } = {}) {
  const m = String(text || '').match(/template=([A-Za-z0-9_-]{8,})/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(b64urlDecode(m[1])); } catch (e) { return null; }
  if (!d || d.v !== 1 || !Array.isArray(d.e)) return null;
  const cats = new Set(categories);
  const parts = new Set(bodyParts);
  const exercises = d.e.slice(0, 40).map((o) => {
    if (!o || typeof o !== 'object') return null;
    const name = str(o.n, 80);
    if (!name) return null;
    const sets = (Array.isArray(o.s) ? o.s : []).slice(0, 30).map((row) => {
      if (!Array.isArray(row)) return null;
      const set = { type: CODE_TYPE[row[0]] || 'normal' };
      ['w', 'r', 'd', 't'].forEach((k, i) => { const v = num(row[i + 1]); if (v !== null) set[k] = v; });
      return set;
    }).filter(Boolean);
    return {
      id: typeof o.i === 'string' && /^x-[a-z0-9-]+$/.test(o.i) ? o.i : null,
      name,
      category: cats.has(o.c) ? o.c : 'barbell',
      bodyPart: parts.has(o.b) ? o.b : 'other',
      sets: sets.length ? sets : [{ type: 'normal' }],
      restSec: num(o.r),
      notes: str(o.o, 500),
      group: Number.isInteger(o.g) ? o.g : null,
      focus: ['volume', 'volumeChange', 'reps', 'weightPerRep', 'repsChange'].includes(o.m) ? o.m : null,
    };
  }).filter(Boolean);
  const name = str(d.n, 80);
  if (!name || !exercises.length) return null;
  return { name, notes: str(d.f, 1000), exercises };
}

