// Display formatting in the user's units and language: the same output as the
// web app's format.js and util.js, built on the shared unit helpers.
import { useMemo } from 'react';
import {
  kgTo, kmTo, roundW, fmtClock, usesWeight, startOfDay, DAY,
} from '@setlog/core';

import { useSettings } from '@/data/store';
import type { Category, Settings, WorkSet } from '@/data/types';
import { useLang, type Tr } from './i18n';

export function makeFormat(settings: Settings, locale: string, lang: 'en' | 'de', tr: Tr) {
  const unit = settings.unit;
  const dUnit = settings.distUnit;
  const nf = new Map<string, Intl.NumberFormat>();
  const num = (n: number | null | undefined, maxFrac = 2) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return '';
    const k = String(maxFrac);
    if (!nf.has(k)) nf.set(k, new Intl.NumberFormat(locale, { maximumFractionDigits: maxFrac }));
    return nf.get(k)!.format(n);
  };
  const compact = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e6) return num(n / 1e6, 1) + 'M';
    if (a >= 1e4) return num(n / 1e3, 1) + 'k';
    return num(n, 0);
  };
  /** kg -> "62,5" in the user's unit */
  const w = (kg: number | null | undefined, frac?: number) =>
    (kg === null || kg === undefined ? '' : num(roundW(kgTo(kg, unit), unit), frac ?? (unit === 'lb' ? 1 : 2)));
  const wu = (kg: number) => `${w(kg)} ${unit}`;
  const volume = (kg: number) => {
    const v = kgTo(kg || 0, unit);
    return `${v >= 10000 ? compact(v) : num(v, 0)} ${unit}`;
  };
  const dist = (km: number) => `${num(kmTo(km || 0, dUnit), 2)} ${dUnit}`;

  /** One set as text: "60 kg × 8", "+10 kg × 6", "12 reps", "5 km · 25:00", "1:00" */
  const setText = (s: Partial<WorkSet> | null | undefined, cat: Category | undefined, short = false) => {
    if (!s) return '';
    if (usesWeight(cat)) {
      const sign = cat === 'assisted_bw' && s.w ? '-' : cat === 'weighted_bw' && s.w ? '+' : '';
      const wt = s.w || s.w === 0 ? `${sign}${w(s.w)}` : '—';
      const txt = short ? `${wt} × ${s.r ?? '—'}` : `${wt} ${unit} × ${s.r ?? '—'}`;
      return s.rpe ? `${txt} @${num(s.rpe, 1)}` : txt;
    }
    if (cat === 'reps') return `${s.r ?? '—'} ${tr(s.r === 1 ? 'rep' : 'reps')}${s.rpe ? ` @${num(s.rpe, 1)}` : ''}`;
    if (cat === 'cardio') {
      const parts = [];
      if (s.d) parts.push(dist(s.d));
      if (s.t) parts.push(fmtClock(s.t));
      return parts.join(' · ') || '—';
    }
    return s.t ? fmtClock(s.t) : '—';
  };

  /** "3 sets" / "3 Sätze" */
  const plural = (n: number, one: string, many?: string) => `${num(n, 0)} ${n === 1 ? tr(one) : tr(many || one + 's')}`;

  /** ms -> "1h 5m" / "1 h 5 min" */
  const dur = (ms: number) => {
    const totalMin = Math.round((ms || 0) / 60000);
    const de = lang === 'de';
    if (totalMin < 1) return Math.max(0, Math.round((ms || 0) / 1000)) + (de ? ' s' : 's');
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    if (de) return h === 0 ? `${m} min` : m ? `${h} h ${m} min` : `${h} h`;
    if (h === 0) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, opts);
  const F = {
    medium: dtf({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    full: dtf({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    short: dtf({ day: 'numeric', month: 'short', year: 'numeric' }),
    monthYear: dtf({ month: 'long', year: 'numeric' }),
    time: dtf({ hour: '2-digit', minute: '2-digit' }),
    weekdayLong: dtf({ weekday: 'long' }),
  };
  const date = {
    medium: (t: number) => F.medium.format(t),
    full: (t: number) => F.full.format(t),
    short: (t: number) => F.short.format(t),
    monthYear: (t: number) => F.monthYear.format(t),
    time: (t: number) => F.time.format(t),
    weekdayLong: (t: number) => F.weekdayLong.format(t),
  };

  /** "Today", "3 days ago", "2 weeks ago" … */
  const relDay = (at: number, now = Date.now()) => {
    const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
    if (days <= 0) return tr('Today');
    if (days === 1) return tr('Yesterday');
    if (days < 7) return tr('{n} days ago', { n: days });
    if (days < 14) return tr('1 week ago');
    if (days < 60) return tr('{n} weeks ago', { n: Math.floor(days / 7) });
    if (days < 365) return tr('{n} months ago', { n: Math.floor(days / 30) });
    const y = Math.floor(days / 365);
    return y === 1 ? tr('1 year ago') : tr('{n} years ago', { n: y });
  };
  /** relDay for mid-sentence use ("last done 3 days ago" / "zuletzt vor 3 Tagen") */
  const relDayLower = (at: number, now?: number) => {
    const s = relDay(at, now);
    return lang === 'de' ? s.replace(/^(Heute|Gestern)$/, (m) => m.toLowerCase()) : s.toLowerCase();
  };

  return { unit, dUnit, num, compact, w, wu, volume, dist, setText, plural, dur, date, relDay, relDayLower, clock: fmtClock };
}

export type Format = ReturnType<typeof makeFormat>;

export function useFormat(): Format & { tr: Tr; lang: 'en' | 'de' } {
  const settings = useSettings();
  const { lang, locale, tr } = useLang();
  return useMemo(() => ({ ...makeFormat(settings, locale, lang, tr), tr, lang }), [settings, locale, lang, tr]);
}

/** Labels per set: warm-ups W, drops D, failure F, numbered working sets. */
export function setLabels(sets: { type?: string }[]): string[] {
  let n = 0;
  return sets.map((s) => {
    if (s.type === 'warmup') return 'W';
    if (s.type === 'drop') return 'D';
    n++;
    if (s.type === 'failure') return 'F';
    return String(n);
  });
}
