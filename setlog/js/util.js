// Web helpers on top of core/units.js: locale-aware number and date
// formatting, relative dates and plurals in the app language, platform checks.
import { tr, getLang } from './i18n.js';
import { configureUnits, startOfDay, DAY } from './core/units.js';

export {
  uid, clamp, debounce, slug, parseNum, numToInput, parsePlates, KG_PER_LB, KM_PER_MI, kgTo, toKg, kmTo, toKm, roundW,
  fmtClock, digitsToSec, secToDigits, fmtDigits, DAY, startOfDay, startOfWeek, addDays, startOfMonth, addMonths,
} from './core/units.js';

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
configureUnits({ decimal: DECIMAL });

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

export function compact(n) {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e6) return fmtNum(n / 1e6, 1) + 'M';
  if (a >= 1e4) return fmtNum(n / 1e3, 1) + 'k';
  return fmtNum(n, 0);
}

// ---------- durations ----------
/** ms -> "1h 5m" / "45m" / "30s" */
export function fmtDur(ms) {
  const totalMin = Math.round((ms || 0) / 60000);
  const de = getLang() === 'de';
  if (totalMin < 1) return Math.max(0, Math.round((ms || 0) / 1000)) + (de ? ' s' : 's');
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  if (de) return h === 0 ? `${m} min` : m ? `${h} h ${m} min` : `${h} h`;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ---------- dates ----------
// dates follow the app language (a German UI on an English phone still gets German dates)
const DATE_LOCALE = getLang() === 'de' && !/^de\b/i.test(LOCALE) ? 'de-DE' : LOCALE;
const dtf = (opts) => new Intl.DateTimeFormat(DATE_LOCALE, opts);
const F = {
  dayMonth: dtf({ day: 'numeric', month: 'short' }),
  full: dtf({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  medium: dtf({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  short: dtf({ day: 'numeric', month: 'short', year: 'numeric' }),
  monthYear: dtf({ month: 'long', year: 'numeric' }),
  monthShort: dtf({ month: 'short' }),
  time: dtf({ hour: '2-digit', minute: '2-digit' }),
  weekday: dtf({ weekday: 'short' }),
  weekdayLong: dtf({ weekday: 'long' }),
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
  weekdayLong: (t) => F.weekdayLong.format(t),
  weekdayNarrow: (t) => F.weekdayNarrow.format(t),
};

export function relDay(at, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (days <= 0) return tr('Today');
  if (days === 1) return tr('Yesterday');
  if (days < 7) return tr('{n} days ago', { n: days });
  if (days < 14) return tr('1 week ago');
  if (days < 60) return tr('{n} weeks ago', { n: Math.floor(days / 7) });
  if (days < 365) return tr('{n} months ago', { n: Math.floor(days / 30) });
  const y = Math.floor(days / 365);
  return y === 1 ? tr('1 year ago') : tr('{n} years ago', { n: y });
}

/** relDay for use mid-sentence ("last done 3 days ago" / "zuletzt vor 3 Tagen"). */
export function relDayLower(at, now) {
  const s = relDay(at, now);
  return getLang() === 'de' ? s.replace(/^(Heute|Gestern)$/, (m) => m.toLowerCase()) : s.toLowerCase();
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
  if (h < 5) return tr('Night Workout');
  if (h < 12) return tr('Morning Workout');
  if (h < 17) return tr('Afternoon Workout');
  if (h < 22) return tr('Evening Workout');
  return tr('Night Workout');
}

/** "3 sets" — both forms go through the dictionary ("set" → "Satz", "sets" → "Sätze"). */
export function plural(n, one, many) { return `${fmtNum(n, 0)} ${n === 1 ? tr(one) : tr(many || one + "s")}`; }

export const isStandalone = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch (e) { return false; }
};
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
