// Texts the session and the editors share: last time's sets in one line, a
// set's values, and the reps left.
import { fmtDigits, usesWeight } from '@setlog/core';

import type { Category, WorkSet } from '@/data/types';
import type { Format } from '@/lib/format';
import type { Tr } from '@/lib/i18n';
import type { Field } from './SetRow';

/** "0 left", "1 left", "2+ left" */
export const effortText = (rir: number, tr: Tr) => (rir >= 2 ? tr('2+ left') : tr('{n} left', { n: rir }));

/** Last time's working sets in one line: "80 × 8, 8, 7", "80 × 8 · 82.5 × 6", "12, 10, 8 reps". */
export function lastTimeText(prev: WorkSet[] | null, cat: Category, f: Format, tr: Tr) {
  const work = (prev || []).filter((s) => s.type !== 'warmup');
  if (!work.length) return '';
  if (usesWeight(cat)) {
    const sign = cat === 'assisted_bw' ? '−' : cat === 'weighted_bw' ? '+' : '';
    const groups: [string, (number | string)[]][] = [];
    for (const s of work) {
      const w = s.w || s.w === 0 ? `${sign}${s.w ? f.w(s.w) : '0'}` : '—';
      const last = groups[groups.length - 1];
      if (last && last[0] === w) last[1].push(s.r ?? '—');
      else groups.push([w, [s.r ?? '—']]);
    }
    return groups.map(([w, rs]) => `${w} × ${rs.join(', ')}`).join(' · ');
  }
  if (cat === 'reps') return `${work.map((s) => s.r ?? '—').join(', ')} ${tr('reps')}`;
  return work.map((s) => f.setText(s, cat, true)).join(', ');
}

/** A set's values as read out and on the Log button: "82.5 × 8", "12 reps", "5 km · 25:00". */
export function setValueText(vals: Partial<Record<Field, string>>, cat: Category, f: Format, tr: Tr) {
  if (usesWeight(cat)) return vals.w && vals.r ? `${vals.w} × ${vals.r}` : '';
  if (cat === 'reps') return vals.r ? `${vals.r} ${tr('reps')}` : '';
  if (cat === 'cardio') return [vals.d ? `${vals.d} ${f.dUnit}` : '', vals.t ? fmtDigits(vals.t) : ''].filter(Boolean).join(' · ');
  return vals.t ? fmtDigits(vals.t) : '';
}
