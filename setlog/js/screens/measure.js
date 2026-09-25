// Measure tab: body weight, body fat, calories and body-part measurements.
import { tr } from '../i18n.js';
import { html, useState } from '../lib.js';
import { Icon } from '../icons.js';
import {
  useStore, addMeasurement, deleteMeasurement, measurementsOf,
} from '../store.js';
import { MEASUREMENTS, MEASUREMENT_BY_ID } from '../seed.js';
import { LineChart } from '../charts.js';
import {
  Screen, push, openDialog, actionSheet, toast, Seg,
} from '../ui.js';
import {
  fmt, relDay, fmtNum, parseNum, kgTo, toKg, DAY, toLocalInput, fromLocalInput, roundW,
} from '../util.js';
import { bwUnit, lenUnit } from '../format.js';

const IN_PER_CM = 1 / 2.54;
function unitOf(def) {
  if (def.kind === 'weight') return bwUnit();
  if (def.kind === 'percent') return '%';
  if (def.kind === 'kcal') return 'kcal';
  return lenUnit();
}
function toDisplay(def, v) {
  if (def.kind === 'weight') return roundW(kgTo(v, bwUnit()), bwUnit());
  if (def.kind === 'length') return lenUnit() === 'in' ? Math.round(v * IN_PER_CM * 10) / 10 : Math.round(v * 10) / 10;
  return v;
}
function fromDisplay(def, v) {
  if (def.kind === 'weight') return toKg(v, bwUnit());
  if (def.kind === 'length') return lenUnit() === 'in' ? v / IN_PER_CM : v;
  return v;
}
function fmtVal(def, v) {
  const d = toDisplay(def, v);
  return `${fmtNum(d, def.kind === 'kcal' ? 0 : 1)} ${unitOf(def)}`;
}

export function logMeasurement(def, preset = null) {
  return openDialog((close) => html`<${LogDialog} def=${def} close=${close} preset=${preset} />`);
}
function LogDialog({ def, close }) {
  const last = measurementsOf(def.id)[0];
  const [val, setVal] = useState('');
  const [when, setWhen] = useState(toLocalInput(Date.now()));
  const save = (e) => {
    e.preventDefault();
    const n = parseNum(val);
    if (n === null || n <= 0) { toast(tr('Enter a number')); return; }
    const at = fromLocalInput(when) || Date.now();
    addMeasurement({ type: def.id, value: fromDisplay(def, n), at });
    toast(tr('{name} logged', { name: def.label }));
    close(true);
  };
  return html`<form class="dialog" onSubmit=${save}>
    <h3>${def.label}</h3>
    <div class="field"><label for="m-val">${tr('Value ({unit})', { unit: unitOf(def) })}</label>
      <input id="m-val" class="input tnum" inputmode=${def.kind === 'kcal' ? 'numeric' : 'decimal'} autofocus
        placeholder=${last ? String(toDisplay(def, last.value)) : ''} value=${val} onInput=${(e) => setVal(e.target.value)}
        style="font-size:24px;font-weight:700;text-align:center" /></div>
    <div class="field"><label for="m-when">${tr('When')}</label>
      <input id="m-when" class="input" type="datetime-local" value=${when} onChange=${(e) => setWhen(e.target.value)} /></div>
    <div class="btns two">
      <button type="button" class="btn" onClick=${() => close(false)}>${tr('Cancel')}</button>
      <button type="submit" class="btn btn-primary" id="m-save">${tr('Save')}</button>
    </div>
  </form>`;
}

function Row({ def }) {
  const list = measurementsOf(def.id);
  const last = list[0];
  let sub = tr('No entries yet');
  if (last) {
    sub = relDay(last.at);
    const ref = list.find((m) => m.at <= last.at - 28 * DAY);
    if (ref) {
      const diff = toDisplay(def, last.value) - toDisplay(def, ref.value);
      sub += ` · ${tr('{change} in 4 weeks', { change: `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${fmtNum(Math.abs(diff), 1)} ${unitOf(def)}` })}`;
    }
  }
  return html`<button class="cell" onClick=${() => push('measure-detail', { type: def.id })}>
    <div class="cell-main"><div class="cell-title">${def.label}</div><div class="cell-sub">${sub}</div></div>
    <div class="cell-value tnum" style="color:var(--ink);font-weight:650">${last ? fmtVal(def, last.value) : ''}</div>
    <span class="chev"><${Icon} name="chevronRight" /></span>
  </button>`;
}

export function MeasureTab() {
  useStore('measurements', 'settings');
  const core = MEASUREMENTS.filter((m) => m.group === 'core');
  const body = MEASUREMENTS.filter((m) => m.group === 'body');
  return html`<${Screen} large=${tr('Measure')}>
    <button class="btn btn-primary btn-block btn-lg" id="log-bodyweight" onClick=${() => logMeasurement(MEASUREMENT_BY_ID.bodyweight)}>
      <${Icon} name="scale" />${tr('Log body weight')}</button>
    <div class="section"><span class="section-title">${tr('Body')}</span></div>
    <div class="group">${core.map((d) => html`<${Row} key=${d.id} def=${d} />`)}</div>
    <div class="section"><span class="section-title">${tr('Circumference')}</span></div>
    <div class="group">${body.map((d) => html`<${Row} key=${d.id} def=${d} />`)}</div>
  <//>`;
}

const RANGES = [{ value: 30, label: tr('1M') }, { value: 90, label: tr('3M') }, { value: 365, label: tr('1Y') }, { value: 0, label: tr('All') }];

export function MeasureDetailScreen({ type }) {
  useStore('measurements', 'settings');
  const def = MEASUREMENT_BY_ID[type];
  const [range, setRange] = useState(90);
  const [limit, setLimit] = useState(30);
  const list = measurementsOf(type);
  const from = range ? Date.now() - range * DAY : 0;
  const pts = list.filter((m) => m.at >= from).slice().reverse().map((m) => ({ x: m.at, y: toDisplay(def, m.value) }));
  const rowMenu = async (m) => {
    const c = await actionSheet({ title: `${fmtVal(def, m.value)} · ${fmt.short(m.at)}`, actions: [{ label: tr('Delete entry'), value: 'del', destructive: true }] });
    if (c === 'del') {
      deleteMeasurement(m.id);
      toast(tr('Entry deleted'), { action: { label: tr('Undo'), fn: () => addMeasurement({ type: m.type, value: m.value, at: m.at }) } });
    }
  };
  const fv = (v) => `${fmtNum(v, def.kind === 'kcal' ? 0 : 1)} ${unitOf(def)}`;
  return html`<${Screen} nav=${{ back: '', title: def.label, right: html`<button class="nav-btn" onClick=${() => logMeasurement(def)} aria-label=${tr('Add entry')}><${Icon} name="plus" /></button>` }}>
    <h1 class="large-title" style="font-size:28px">${def.label}</h1>
    <div class="card">
      <div class="card-title">${list[0] ? fmtVal(def, list[0].value) : '—'}</div>
      <div class="card-sub">${list[0] ? `${tr('Latest')} · ${fmt.short(list[0].at)}` : tr('Log your first entry to start the chart')}</div>
      <${LineChart} points=${pts} fmtVal=${fv} fmtAxis=${(v, dec) => fmtNum(v, dec)} label=${def.label}
        emptyText=${list.length ? tr('No entries in this range') : tr('No entries yet')} />
      <div style="margin-top:10px"><${Seg} value=${range} onChange=${setRange} options=${RANGES} /></div>
    </div>
    <button class="btn btn-tinted btn-block" style="margin-top:12px" onClick=${() => logMeasurement(def)}><${Icon} name="plus" />${tr('Add entry')}</button>
    ${list.length > 0 && html`<div class="section"><span class="section-title">${tr('History')}</span></div>
      <div class="group">${list.slice(0, limit).map((m) => html`<button class="cell" key=${m.id} onClick=${() => rowMenu(m)}>
        <div class="cell-main"><div class="cell-title tnum">${fmtVal(def, m.value)}</div></div>
        <div class="cell-value">${fmt.short(m.at)} · ${fmt.time(m.at)}</div></button>`)}</div>
      ${list.length > limit && html`<button class="btn btn-tinted btn-block" style="margin-top:10px" onClick=${() => setLimit(limit + 60)}>${tr('Show more')}</button>`}`}
  <//>`;
}
