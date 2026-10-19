// Measurements: units for each kind (body weight in the body-weight unit,
// circumferences in cm or in) and logging a new entry.
import {
  MEASUREMENT_BY_ID, kgTo, toKg, roundW, parseNum,
} from '@setlog/core';

import { addMeasurement, getState } from '@/data/store';
import type { Settings } from '@/data/types';
import { promptNumber, toast } from '@/ui/overlay';
import type { Format } from './format';
import type { Tr } from './i18n';

export type MeasureDef = { id: string; label: string; kind: 'weight' | 'percent' | 'kcal' | 'length'; group: 'core' | 'body' };

export const measureDef = (id: string) => (MEASUREMENT_BY_ID as Record<string, MeasureDef>)[id];

const IN_PER_CM = 1 / 2.54;
export const bodyUnit = (st: Settings) => (st.bodyUnit || st.unit) as 'kg' | 'lb';
export const lengthUnit = (st: Settings) => st.sizeUnit || (st.distUnit === 'mi' ? 'in' : 'cm');

export function unitOf(d: MeasureDef, st: Settings) {
  if (d.kind === 'weight') return bodyUnit(st);
  if (d.kind === 'percent') return '%';
  if (d.kind === 'kcal') return 'kcal';
  return lengthUnit(st);
}

/** Stored value (kg, cm) -> the number shown. */
export function toDisplay(d: MeasureDef, v: number, st: Settings) {
  if (d.kind === 'weight') return roundW(kgTo(v, bodyUnit(st)), bodyUnit(st));
  if (d.kind === 'length') return lengthUnit(st) === 'in' ? Math.round(v * IN_PER_CM * 10) / 10 : Math.round(v * 10) / 10;
  return v;
}

/** The number typed -> stored value (kg, cm). */
export function fromDisplay(d: MeasureDef, v: number, st: Settings) {
  if (d.kind === 'weight') return toKg(v, bodyUnit(st));
  if (d.kind === 'length') return lengthUnit(st) === 'in' ? v / IN_PER_CM : v;
  return v;
}

export const fmtMeasure = (d: MeasureDef, v: number, st: Settings, f: Format) => `${f.num(toDisplay(d, v, st), d.kind === 'kcal' ? 0 : 1)} ${unitOf(d, st)}`;

/** Ask for a new entry and save it. Resolves to true when one was logged. */
export async function logMeasurement(d: MeasureDef, f: Format & { tr: Tr }): Promise<boolean> {
  const { tr } = f;
  const st = getState().settings;
  const last = getState().measurements.find((m) => m.type === d.id);
  const r = await promptNumber({
    title: tr(d.label), unit: unitOf(d, st), integer: d.kind === 'kcal',
    placeholder: last ? f.num(toDisplay(d, last.value, st), 1) : undefined,
  });
  if (!r) return false;
  const n = parseNum(r.text);
  if (n === null || n <= 0) { toast(tr('Enter a number')); return false; }
  await addMeasurement({ type: d.id, value: fromDisplay(d, n, st), at: r.at });
  toast(tr('{name} logged', { name: tr(d.label) }));
  return true;
}
