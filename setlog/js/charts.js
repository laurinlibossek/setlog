// Minimal SVG charts: a single-series line chart and a column chart.
// One accent hue, hairline grid, 2px line, >=8px end dot with a surface ring,
// crosshair + tooltip on touch/hover, sparse direct labels.
import { html, useState, useRef, useLayoutEffect } from './lib.js';
import { fmt } from './util.js';

function useWidth() {
  const ref = useRef();
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const TIME_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
function niceStep(range, count, time) {
  const raw = range / count;
  if (time) return TIME_STEPS.find((s) => s >= raw) || Math.ceil(raw / 3600) * 3600;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
export function niceTicks(min, max, count = 4, { zero = false, time = false } = {}) {
  if (zero) min = Math.min(0, min);
  if (min === max) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; if (zero) min = Math.max(0, min); }
  const step = niceStep(max - min, count, time);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/**
 * points: [{x: ms, y: number (display units)}] oldest first
 * fmtAxis(v), fmtVal(v): number -> string
 */
export function LineChart({
  points, height = 200, fmtAxis = String, fmtVal = String, time = false, emptyText = 'No data yet', label,
}) {
  const [ref, width] = useWidth();
  const [sel, setSel] = useState(null);
  if (!points.length) return html`<div class="chart" ref=${ref}><div class="chart-empty">${emptyText}</div></div>`;

  const padL = 44, padR = 16, padT = 22, padB = 26;
  const W = Math.max(width, 200), H = height;
  const iw = W - padL - padR, ih = H - padT - padB;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), 4, { time });
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const tickStep = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const dec = tickStep >= 1 ? 0 : tickStep >= 0.1 ? 1 : 2;
  const sx = (x) => (x1 === x0 ? padL + iw / 2 : padL + ((x - x0) / (x1 - x0)) * iw);
  const sy = (y) => padT + ih - ((y - y0) / (y1 - y0 || 1)) * ih;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const area = points.length > 1
    ? `${d}L${sx(points[points.length - 1].x).toFixed(1)},${padT + ih}L${sx(points[0].x).toFixed(1)},${padT + ih}Z` : '';
  const spanDays = (x1 - x0) / 86400000;
  const xLabel = (t) => (spanDays > 300 ? `${fmt.monthShort(t)} ${String(new Date(t).getFullYear()).slice(2)}` : fmt.dayMonth(t));
  const xTicks = points.length === 1 ? [x0] : [x0, x0 + (x1 - x0) / 2, x1];
  const showDots = points.length <= 24;
  const last = points[points.length - 1];

  const pick = (e) => {
    const svg = e.currentTarget;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(sx(p.x) - px); if (dd < bd) { bd = dd; best = i; } });
    setSel(best);
  };
  const sp = sel !== null ? points[sel] : null;
  const tipLeft = sp ? Math.min(Math.max(sx(sp.x), 60), W - 60) : 0;

  return html`<div class="chart" ref=${ref}>
    <svg width="100%" height=${H} viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${label || 'Chart'}
      onPointerDown=${pick} onPointerMove=${(e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e); }}
      onPointerLeave=${(e) => { if (e.pointerType === 'mouse') setSel(null); }}>
      ${ticks.map((t) => html`<g key=${'t' + t}>
        <line class="grid" x1=${padL} x2=${W - padR} y1=${sy(t)} y2=${sy(t)} />
        <text x=${padL - 8} y=${sy(t) + 4} text-anchor="end">${fmtAxis(t, dec)}</text></g>`)}
      ${xTicks.map((t, i) => html`<text key=${'x' + i} x=${sx(t)} y=${H - 6}
        text-anchor=${points.length === 1 ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}>${xLabel(t)}</text>`)}
      ${area && html`<path class="area" d=${area} />`}
      <path class="line" d=${d} />
      ${showDots && points.slice(0, -1).map((p, i) => html`<circle key=${'p' + i} class="pt" cx=${sx(p.x)} cy=${sy(p.y)} r="3.5" />`)}
      <circle class="pt" cx=${sx(last.x)} cy=${sy(last.y)} r="5" />
      ${!sp && html`<text class="endlabel" x=${Math.min(sx(last.x), W - padR)} y=${Math.max(sy(last.y) - 11, 12)} text-anchor="end">${fmtVal(last.y)}</text>`}
      ${sp && html`<g>
        <line class="cross" x1=${sx(sp.x)} x2=${sx(sp.x)} y1=${padT - 6} y2=${padT + ih} />
        <circle class="pt" cx=${sx(sp.x)} cy=${sy(sp.y)} r="6" />
      </g>`}
      <rect x="0" y="0" width=${W} height=${H} fill="transparent" />
    </svg>
    ${sp && html`<div class="chart-tip" style=${`left:${(tipLeft / W) * 100}%;top:-6px`}>
      <strong>${fmtVal(sp.y)}</strong>${fmt.medium(sp.x)}</div>`}
  </div>`;
}

/** bars: [{label, value, title}] ; goal: optional reference value */
export function BarChart({
  bars, height = 170, goal = null, fmtVal = String, label, highlightLast = true,
}) {
  const [ref, width] = useWidth();
  const [sel, setSel] = useState(null);
  const padL = 26, padR = 8, padT = 22, padB = 24;
  const W = Math.max(width, 200), H = height;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = Math.max(1, goal || 0, ...bars.map((b) => b.value));
  const ticks = niceTicks(0, max, 3, { zero: true });
  const top = ticks[ticks.length - 1];
  const sy = (v) => padT + ih - (v / top) * ih;
  const band = iw / bars.length;
  const bw = Math.min(24, band - 4);
  const barPath = (x, v) => {
    const h = Math.max(0, (v / top) * ih);
    if (h <= 0) return '';
    const r = Math.min(4, h, bw / 2);
    const y = padT + ih - h, b = padT + ih;
    return `M${x},${b}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${b}Z`;
  };
  const sb = sel !== null ? bars[sel] : null;
  const lastI = bars.length - 1;
  return html`<div class="chart" ref=${ref}>
    <svg width="100%" height=${H} viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${label || 'Chart'}
      onPointerLeave=${(e) => { if (e.pointerType === 'mouse') setSel(null); }}>
      ${ticks.map((t) => html`<g key=${'t' + t}>
        <line class=${t === 0 ? 'baseline' : 'grid'} x1=${padL} x2=${W - padR} y1=${sy(t)} y2=${sy(t)} />
        <text x=${padL - 6} y=${sy(t) + 4} text-anchor="end">${t}</text></g>`)}
      ${goal && html`<g><line class="goal" x1=${padL} x2=${W - padR} y1=${sy(goal)} y2=${sy(goal)} />
        <text class="goallabel" x=${W - padR} y=${sy(goal) - 5} text-anchor="end">Goal ${goal}</text></g>`}
      ${bars.map((b, i) => {
        const x = padL + band * i + (band - bw) / 2;
        const dim = highlightLast && i !== lastI;
        return html`<g key=${'b' + i}>
          <path class=${'bar' + (dim && sel !== i ? ' dim' : '')} d=${barPath(x, b.value)} />
          ${(i === lastI || i === sel) && b.value > 0 && html`<text class="endlabel" x=${x + bw / 2} y=${sy(b.value) - 6} text-anchor="middle">${fmtVal(b.value)}</text>`}
          ${(i % Math.ceil(bars.length / 6) === (lastI % Math.ceil(bars.length / 6))) && html`<text x=${x + bw / 2} y=${H - 6} text-anchor="middle">${b.label}</text>`}
          <rect x=${padL + band * i} y=${padT - 10} width=${band} height=${ih + 10} fill="transparent"
            onPointerDown=${() => setSel(i)} onPointerEnter=${(e) => { if (e.pointerType === 'mouse') setSel(i); }} />
        </g>`;
      })}
    </svg>
    ${sb && html`<div class="chart-tip" style=${`left:${((padL + band * sel + band / 2) / W) * 100}%;top:-8px`}>
      <strong>${fmtVal(sb.value)}</strong>${sb.title || sb.label}</div>`}
  </div>`;
}
