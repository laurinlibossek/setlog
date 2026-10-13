// Numbers, units, ids, durations and calendar arithmetic. No DOM, no storage,
// no locale lookups: the app tells this module its decimal separator once
// (configureUnits), so the same code runs in the web app and the Expo app.

export const unitOpts = {
  decimal: '.', // how numbers are written into input fields ("62,5" in German)
};
export function configureUnits(o) { Object.assign(unitOpts, o); }

export const uid = () => {
  try { if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID(); } catch (e) { /* ignore */ }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function debounce(fn, ms) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  d.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn(...args); } };
  d.cancel = () => { clearTimeout(t); t = null; };
  return d;
}

export const slug = (s) => String(s).toLowerCase()
  .replace(/[()]/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---------- numbers ----------
/** Parse user input like "62,5" / "62.5" / " 60 " -> number, or null if empty/invalid. */
export function parseNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return null;
  // "1.234,5" (de) or "1,234.5" (en): keep the last separator as decimal point
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }
  if (!/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Number -> string for an input field (the app's decimal separator, no grouping). */
export function numToInput(n, maxFrac = 2, decimal = unitOpts.decimal) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const r = Math.round(n * 10 ** maxFrac) / 10 ** maxFrac;
  return String(r).replace('.', decimal);
}

/**
 * A list of plates typed by hand: "25, 20, 15", "25,20,15", "25 20 2,5" or
 * "45, 35, 2.5". Spaces and semicolons always separate; without them commas
 * separate too, unless the whole text is one decimal like "2,5" or "1,25".
 * Returns positive numbers, heaviest first, without duplicates.
 */
export function parsePlates(text) {
  const s = String(text || '').trim().replace(/,\s+/g, ';');
  if (!s) return [];
  let parts;
  if (/[;\s]/.test(s)) parts = s.split(/[;\s]+/);
  else if (/^\d,(5|25|75)$/.test(s)) parts = [s];
  else parts = s.split(',');
  const nums = parts.map((x) => parseNum(x)).filter((x) => x !== null && x > 0);
  return [...new Set(nums)].sort((a, b) => b - a);
}

// ---------- units ----------
export const KG_PER_LB = 0.45359237;
export const KM_PER_MI = 1.609344;

export const kgTo = (kg, unit) => (unit === 'lb' ? kg / KG_PER_LB : kg);
export const toKg = (v, unit) => (unit === 'lb' ? v * KG_PER_LB : v);
export const kmTo = (km, unit) => (unit === 'mi' ? km / KM_PER_MI : km);
export const toKm = (v, unit) => (unit === 'mi' ? v * KM_PER_MI : v);

/** Round a converted weight for display: kg to 0.01, lb to 0.1 (avoids 44.99). */
export function roundW(v, unit) {
  const f = unit === 'lb' ? 10 : 100;
  return Math.round(v * f) / f;
}

// ---------- durations ----------
/** seconds -> "1:05" / "1:02:03" */
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Digits typed right-to-left into a time field: "130" -> 90s, "13000" -> 1h30m */
export function digitsToSec(d) {
  const s = String(d || '').replace(/\D/g, '').slice(-6);
  if (!s) return null;
  const n = s.padStart(6, '0');
  const h = +n.slice(0, 2), m = +n.slice(2, 4), sec = +n.slice(4, 6);
  return h * 3600 + m * 60 + sec;
}
export function secToDigits(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec <= 0) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const str = (h ? String(h) + String(m).padStart(2, '0') : String(m)) + String(s).padStart(2, '0');
  return str.replace(/^0+(?=\d)/, '');
}
export function fmtDigits(d) {
  const s = String(d || '').replace(/\D/g, '').replace(/^0+/, '').slice(-6);
  if (!s) return '';
  return fmtClock(digitsToSec(s));
}

// ---------- calendar ----------
export const DAY = 86400000;
export function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
export function startOfWeek(t, weekStart = 1) {
  const d = new Date(startOfDay(t));
  const diff = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}
export function addDays(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
export function startOfMonth(t) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
export function addMonths(t, n) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); }
