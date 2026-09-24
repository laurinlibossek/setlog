// Small, dependency-free helpers: ids, numbers, units, dates, durations.

export const uid = () => {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* ignore */ }
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
const LOCALE = (() => {
  const cands = typeof navigator !== 'undefined' ? [...(navigator.languages || []), navigator.language] : [];
  for (const c of cands) {
    try { if (c && Intl.DateTimeFormat.supportedLocalesOf([c]).length) return c; } catch (e) { /* invalid tag */ }
  }
  return 'en-US';
})();
export const DECIMAL = (() => {
  try {
    const p = new Intl.NumberFormat(LOCALE).formatToParts(1.5).find((x) => x.type === 'decimal');
    return p ? p.value : '.';
  } catch (e) { return '.'; }
})();

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

const nfCache = new Map();
export function fmtNum(n, maxFrac = 2, minFrac = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const k = maxFrac + ':' + minFrac;
  let nf = nfCache.get(k);
  if (!nf) {
    nf = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxFrac, minimumFractionDigits: minFrac });
    nfCache.set(k, nf);
  }
  return nf.format(n);
}

/** Number -> string suitable for an <input> value (locale decimal, no grouping). */
export function numToInput(n, maxFrac = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const r = Math.round(n * 10 ** maxFrac) / 10 ** maxFrac;
  return String(r).replace('.', DECIMAL);
}

export function compact(n) {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e6) return fmtNum(n / 1e6, 1) + 'M';
  if (a >= 1e4) return fmtNum(n / 1e3, 1) + 'k';
  return fmtNum(n, 0);
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

/** ms -> "1h 5m" / "45m" / "30s" */
export function fmtDur(ms) {
  const totalMin = Math.round((ms || 0) / 60000);
  if (totalMin < 1) return Math.max(0, Math.round((ms || 0) / 1000)) + 's';
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
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

// ---------- dates ----------
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

const dtf = (opts) => new Intl.DateTimeFormat(LOCALE, opts);
const F = {
  dayMonth: dtf({ day: 'numeric', month: 'short' }),
  full: dtf({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  medium: dtf({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  short: dtf({ day: 'numeric', month: 'short', year: 'numeric' }),
  monthYear: dtf({ month: 'long', year: 'numeric' }),
  monthShort: dtf({ month: 'short' }),
  time: dtf({ hour: '2-digit', minute: '2-digit' }),
  weekday: dtf({ weekday: 'short' }),
  weekdayNarrow: dtf({ weekday: 'narrow' }),
};
export const fmt = {
  dayMonth: (t) => F.dayMonth.format(t),
  full: (t) => F.full.format(t),
  medium: (t) => F.medium.format(t),
  short: (t) => F.short.format(t),
  monthYear: (t) => F.monthYear.format(t),
  monthShort: (t) => F.monthShort.format(t),
  time: (t) => F.time.format(t),
  weekday: (t) => F.weekday.format(t),
  weekdayNarrow: (t) => F.weekdayNarrow.format(t),
};

export function relDay(t, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const y = Math.floor(days / 365);
  return y === 1 ? '1 year ago' : `${y} years ago`;
}

/** Date -> value for <input type="datetime-local"> in local time */
export function toLocalInput(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0)).getTime();
}

export function workoutNameForTime(t) {
  const h = new Date(t).getHours();
  if (h < 5) return 'Night Workout';
  if (h < 12) return 'Morning Workout';
  if (h < 17) return 'Afternoon Workout';
  if (h < 22) return 'Evening Workout';
  return 'Night Workout';
}

export function plural(n, one, many) { return `${fmtNum(n, 0)} ${n === 1 ? one : (many || one + 's')}`; }

export const isStandalone = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch (e) { return false; }
};
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
