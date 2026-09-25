// Gym tools: plate calculator and 1RM calculator.
import { tr } from './i18n.js';
import { html, useState } from './lib.js';
import { S } from './store.js';
import { platesFor, est1RM, formulaLabel } from './calc.js';
import {
  parseNum, fmtNum, toKg, kgTo, roundW,
} from './util.js';
import { NavBar, openScreenModal, Seg } from './ui.js';

// competition plate colours by weight (kg); lb plates use the nearest match
const PLATE_STYLE = {
  25: ['#d93a2b', 1], 20: ['#2a6fd6', 0.94], 15: ['#e0b100', 0.86], 10: ['#2a9a4a', 0.78],
  5: ['#e9edf2', 0.6], 2.5: ['#1d2229', 0.5], 1.25: ['#a7afba', 0.42], 0.5: ['#a7afba', 0.36],
  45: ['#2a6fd6', 1], 35: ['#e0b100', 0.9], 2: ['#1d2229', 0.48], 1: ['#a7afba', 0.4],
};
function plateVisual(p) {
  const [color, scale] = PLATE_STYLE[p] || ['#8b95a3', 0.5];
  return { color, h: Math.round(104 * scale), w: p >= 10 ? 15 : p >= 2.5 ? 11 : 8 };
}

export function openTools(initial = {}) {
  return openScreenModal((close) => html`<${Tools} close=${close} initial=${initial} />`);
}

function Tools({ close, initial }) {
  const [tab, setTab] = useState(initial.tab || 'plates');
  return html`
    <${NavBar} title=${tr('Tools')} solid right=${html`<button class="nav-btn strong" onClick=${() => close()}>${tr('Done')}</button>`} />
    <div class="scroll"><div class="page stack" style="padding-top:12px">
      <${Seg} value=${tab} onChange=${setTab} options=${[{ value: 'plates', label: tr('Plate calculator') }, { value: 'rm', label: tr('1RM calculator') }]} />
      ${tab === 'plates' ? html`<${Plates} initial=${initial.weight} />` : html`<${OneRM} />`}
    </div></div>`;
}

function Plates({ initial }) {
  const st = S.settings;
  const u = st.unit;
  const [val, setVal] = useState(initial ? fmtNum(roundW(kgTo(initial, u), u), 2).replace(/[^\d.,]/g, '') : '');
  const [bar, setBar] = useState(st.bar);
  const target = parseNum(val);
  const res = target !== null ? platesFor(target, bar, st.plates) : null;
  const loaded = res ? bar + res.plates.reduce((a, p) => a + p * 2, 0) : null;
  const barOptions = u === 'lb' ? [45, 35, 33, 25, 15, 0] : [20, 15, 10, 7.5, 0];
  return html`<div class="stack">
    <div class="field"><label for="plate-target">${tr('Target weight ({unit})', { unit: u })}</label>
      <input id="plate-target" class="input tnum" inputmode="decimal" value=${val} placeholder=${u === 'lb' ? '225' : '100'}
        onInput=${(e) => setVal(e.target.value)} style="font-size:24px;font-weight:700;text-align:center" /></div>
    <div class="field"><span class="label">${tr('Bar')}</span>
      <${Seg} value=${bar} onChange=${setBar} options=${barOptions.map((b) => ({ value: b, label: b ? `${b}` : tr('None') }))} /></div>
    ${res && target !== null && html`<div class="card">
      ${target < bar ? html`<p class="center muted" style="margin:8px 0">${tr('That’s lighter than the bar.')}</p>` : html`
        <div class="card-title center">${tr('Each side')}</div>
        <div class="plate-bar" aria-hidden="true">
          <div class="shaft"></div><div class="collar"></div>
          ${res.plates.map((p, i) => { const v = plateVisual(p); return html`<div key=${i} class="plate" style=${`height:${v.h}px;width:${v.w}px;background:${v.color};color:${p === 5 ? '#333' : '#fff'}`}></div>`; })}
          <div class="sleeve"></div>
        </div>
        <div class="plate-legend">${res.plates.length ? res.plates.map((p, i) => html`<span key=${i} class="plate-chip">${fmtNum(p, 2)}</span>`) : html`<span class="muted">${tr('Just the bar')}</span>`}</div>
        <p class="center small muted" style="margin:10px 0 0">
          ${tr('Loaded:')} <strong class="tnum" style="color:var(--ink)">${fmtNum(loaded, 2)} ${u}</strong>
          ${res.remainder > 0 ? html` · ${tr('{w} can’t be loaded with your plates', { w: `${fmtNum(res.remainder, 2)} ${u}` })}` : ''}</p>`}
    </div>`}
    <p class="footnote">${tr('Plates and bar weights can be changed in Settings → Plates.')}</p>
  </div>`;
}

function OneRM() {
  const u = S.settings.unit;
  const [wv, setW] = useState('');
  const [rv, setR] = useState('');
  const wN = parseNum(wv), rN = parseNum(rv);
  const kg = wN !== null ? toKg(wN, u) : null;
  const oneRm = kg && rN ? est1RM(kg, Math.round(rN), S.settings.formula) : 0;
  const pct = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];
  const repsAt = { 100: 1, 95: 2, 90: 4, 85: 6, 80: 8, 75: 10, 70: 12, 65: 15, 60: 18, 50: 25 };
  return html`<div class="stack">
    <div class="row">
      <div class="field grow"><label for="rm-w">${tr('Weight ({unit})', { unit: u })}</label>
        <input id="rm-w" class="input tnum" inputmode="decimal" value=${wv} onInput=${(e) => setW(e.target.value)} /></div>
      <div class="field grow"><label for="rm-r">${tr('Reps')}</label>
        <input id="rm-r" class="input tnum" inputmode="numeric" value=${rv} onInput=${(e) => setR(e.target.value)} /></div>
    </div>
    ${oneRm > 0 && html`<div class="card center">
      <div class="muted small">${tr('Estimated 1RM')}</div>
      <div style="font-size:40px;font-weight:800;letter-spacing:-0.02em">${fmtNum(roundW(kgTo(oneRm, u), u), 1)} ${u}</div>
      <div class="muted small">${S.settings.formula === 'average' ? formulaLabel('average') : tr('{name} formula', { name: formulaLabel(S.settings.formula) })}</div>
    </div>
    <div class="group"><table class="rm-table"><thead><tr><th>${tr('% of 1RM')}</th><th>${tr('≈ reps')}</th><th>${tr('Weight')}</th></tr></thead><tbody>
      ${pct.map((p) => html`<tr key=${p}><td>${p}%</td><td class="muted">${repsAt[p]}</td><td><strong>${fmtNum(roundW(kgTo(oneRm * p / 100, u), u), 1)} ${u}</strong></td></tr>`)}
    </tbody></table></div>`}
  </div>`;
}
