// Display formatting that depends on the user's unit settings.
import { S } from './store.js';
import {
  fmtNum, kgTo, kmTo, roundW, fmtClock, compact,
} from './util.js';
import { usesWeight } from './calc.js';

export const wUnit = () => S.settings.unit;
export const dUnit = () => S.settings.distUnit;
export const lenUnit = () => (S.settings.distUnit === 'mi' ? 'in' : 'cm');

/** 62.5 -> "62.5" in the user's unit (no unit label) */
export function w(kg, frac) {
  if (kg === null || kg === undefined) return '';
  const u = wUnit();
  return fmtNum(roundW(kgTo(kg, u), u), frac ?? (u === 'lb' ? 1 : 2));
}
export const wu = (kg) => `${w(kg)} ${wUnit()}`;
export function volume(kg) {
  const v = kgTo(kg || 0, wUnit());
  return `${v >= 10000 ? compact(v) : fmtNum(v, 0)} ${wUnit()}`;
}
export const dist = (km) => `${fmtNum(kmTo(km || 0, dUnit()), 2)} ${dUnit()}`;
export function pace(secPerKm) {
  const perUnit = dUnit() === 'mi' ? secPerKm * 1.609344 : secPerKm;
  return `${fmtClock(perUnit)} /${dUnit()}`;
}

/** One set as text: "60 kg × 8", "-20 kg × 6", "12 reps", "5 km · 25:00", "1:00" */
export function setText(s, cat, { short = false } = {}) {
  if (!s) return '';
  const u = wUnit();
  if (usesWeight(cat)) {
    const sign = cat === 'assisted_bw' && s.w ? '-' : cat === 'weighted_bw' && s.w ? '+' : '';
    const wt = (s.w || s.w === 0) ? `${sign}${w(s.w)}` : '—';
    const txt = short ? `${wt} × ${s.r ?? '—'}` : `${wt} ${u} × ${s.r ?? '—'}`;
    return s.rpe ? `${txt} @${fmtNum(s.rpe, 1)}` : txt;
  }
  if (cat === 'reps') return `${s.r ?? '—'} reps${s.rpe ? ` @${fmtNum(s.rpe, 1)}` : ''}`;
  if (cat === 'cardio') {
    const parts = [];
    if (s.d) parts.push(dist(s.d));
    if (s.t) parts.push(fmtClock(s.t));
    return parts.join(' · ') || '—';
  }
  return s.t ? fmtClock(s.t) : '—';
}

export function metricValue(kind, v) {
  switch (kind) {
    case 'weight': return `${w(v, 1)} ${wUnit()}`;
    case 'count': return fmtNum(v, 0);
    case 'distance': return dist(v);
    case 'time': return fmtClock(v);
    case 'pace': return pace(v);
    default: return fmtNum(v, 1);
  }
}

export function metricAxis(kind, v) {
  switch (kind) {
    case 'weight': return compactNum(kgTo(v, wUnit()));
    case 'distance': return fmtNum(kmTo(v, dUnit()), 1);
    case 'time': case 'pace': return fmtClock(v);
    default: return compactNum(v);
  }
}
function compactNum(v) { return Math.abs(v) >= 10000 ? compact(v) : fmtNum(v, Math.abs(v) < 10 ? 1 : 0); }

export const SET_TYPE_LABEL = { warmup: 'W', drop: 'D', failure: 'F' };
export const SET_TYPE_NAME = { normal: 'Normal', warmup: 'Warm-up', drop: 'Drop set', failure: 'Failure' };

/** Label per set: warm-ups W, drops D, failure F, numbered working sets otherwise. */
export function setLabels(sets) {
  let n = 0;
  return sets.map((s) => {
    if (s.type === 'warmup') return 'W';
    if (s.type === 'drop') return 'D';
    n++;
    if (s.type === 'failure') return 'F';
    return String(n);
  });
}
