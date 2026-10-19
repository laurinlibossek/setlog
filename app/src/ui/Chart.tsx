// Minimal charts in the web app's style (setlog/js/charts.js): a one-line
// chart over time and a column chart. One accent hue, hairline grid, 2 px
// line, a bigger end dot with a surface ring, sparse labels; touch a point
// or bar for its value. The axis maths is the shared core's (core/chart.js).
import { useState } from 'react';
import {
  Platform, StyleSheet, Text, View, type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Circle, G, Line, Path, Text as SvgText,
} from 'react-native-svg';
import { niceTicks, tickDecimals } from '@setlog/core';

import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';

// SVG text in a browser falls back to a serif font; use the system one
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined;

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

/** The value bubble over a touched point or bar. */
function Tip({ left, width, value, sub }: { left: number; width: number; value: string; sub: string }) {
  const c = useColors();
  const x = Math.min(Math.max(left, 64), width - 64);
  return (
    <View pointerEvents="none" style={[styles.tip, { left: x - 64, backgroundColor: c.ink }]} testID="chart-tip">
      <Text style={{ color: c.bg, fontSize: 15, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: c.bg, fontSize: 12, textAlign: 'center', opacity: 0.85 }} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

type Point = { x: number; y: number };

/** points oldest first, x = ms, y in display units */
export function LineChart({
  points, height = 200, fmtAxis = (v: number) => String(v), fmtVal = (v: number) => String(v), time = false, emptyText, label, testID,
}: {
  points: Point[]; height?: number; fmtAxis?: (v: number, dec: number) => string; fmtVal?: (v: number) => string;
  time?: boolean; emptyText: string; label: string; testID?: string;
}) {
  const c = useColors();
  const f = useFormat();
  const [width, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  if (!points.length) {
    return <View onLayout={onLayout} style={styles.empty} testID={testID}><Text style={{ color: c.ink3, fontSize: 14, textAlign: 'center' }}>{emptyText}</Text></View>;
  }
  const padL = 44, padR = 16, padT = 22, padB = 26;
  const W = Math.max(width, 200), H = height;
  const iw = W - padL - padR, ih = H - padT - padB;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), 4, { time }) as number[];
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const dec = tickDecimals(ticks) as number;
  const sx = (x: number) => (x1 === x0 ? padL + iw / 2 : padL + ((x - x0) / (x1 - x0)) * iw);
  const sy = (y: number) => padT + ih - ((y - y0) / (y1 - y0 || 1)) * ih;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const area = points.length > 1 ? `${d}L${sx(points[points.length - 1].x).toFixed(1)},${padT + ih}L${sx(points[0].x).toFixed(1)},${padT + ih}Z` : '';
  const spanDays = (x1 - x0) / 86400000;
  const xLabel = (t: number) => (spanDays > 300 ? `${f.date.monthShort(t)} ${String(new Date(t).getFullYear()).slice(2)}` : f.date.dayMonth(t));
  const xTicks = points.length === 1 ? [x0] : [x0, x0 + (x1 - x0) / 2, x1];
  const showDots = points.length <= 24;
  const last = points[points.length - 1];
  const pick = (px: number) => {
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(sx(p.x) - px); if (dd < bd) { bd = dd; best = i; } });
    setSel(best);
  };
  const sp = sel !== null ? points[sel] : null;
  const anchor = (i: number) => (points.length === 1 ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle');
  return (
    <View onLayout={onLayout} style={{ marginTop: 10 }} testID={testID}
      accessible accessibilityRole="image" accessibilityLabel={`${label}: ${fmtVal(last.y)}`}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => pick(e.nativeEvent.locationX)} onResponderMove={(e) => pick(e.nativeEvent.locationX)}
      onResponderRelease={() => setTimeout(() => setSel(null), 1600)} onResponderTerminationRequest={() => true}>
      {width > 0 && (
        <Svg width={W} height={H}>
          {ticks.map((t) => (
            <G key={'t' + t}>
              <Line x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} stroke={c.line} strokeWidth={1} />
              <SvgText fontFamily={FONT} x={padL - 8} y={sy(t) + 4} textAnchor="end" fontSize={11} fill={c.ink3}>{fmtAxis(t, dec)}</SvgText>
            </G>
          ))}
          {xTicks.map((t, i) => <SvgText fontFamily={FONT} key={'x' + i} x={sx(t)} y={H - 6} textAnchor={anchor(i)} fontSize={11} fill={c.ink3}>{xLabel(t)}</SvgText>)}
          {!!area && <Path d={area} fill={c.chart} opacity={0.1} />}
          <Path d={d} fill="none" stroke={c.chart} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {showDots && points.slice(0, -1).map((p, i) => <Circle key={'p' + i} cx={sx(p.x)} cy={sy(p.y)} r={3.5} fill={c.chart} stroke={c.surface} strokeWidth={2} />)}
          <Circle cx={sx(last.x)} cy={sy(last.y)} r={5} fill={c.chart} stroke={c.surface} strokeWidth={2} />
          {!sp && <SvgText fontFamily={FONT} x={Math.min(sx(last.x), W - padR)} y={Math.max(sy(last.y) - 11, 12)} textAnchor="end" fontSize={12} fontWeight="700" fill={c.ink}>{fmtVal(last.y)}</SvgText>}
          {sp && (
            <G>
              <Line x1={sx(sp.x)} x2={sx(sp.x)} y1={padT - 6} y2={padT + ih} stroke={c.ink3} strokeWidth={1} />
              <Circle cx={sx(sp.x)} cy={sy(sp.y)} r={6} fill={c.chart} stroke={c.surface} strokeWidth={2} />
            </G>
          )}
        </Svg>
      )}
      {sp && <Tip left={sx(sp.x)} width={W} value={fmtVal(sp.y)} sub={f.date.medium(sp.x)} />}
    </View>
  );
}

/** bars oldest first; `goal` draws a reference line */
export function BarChart({
  bars, height = 170, goal = null, fmtVal = (v: number) => String(v), label, testID,
}: {
  bars: { label: string; value: number; title?: string }[]; height?: number; goal?: number | null; fmtVal?: (v: number) => string; label: string; testID?: string;
}) {
  const c = useColors();
  const { tr } = useFormat();
  const [width, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const padL = 26, padR = 8, padT = 22, padB = 24;
  const W = Math.max(width, 200), H = height;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = Math.max(1, goal || 0, ...bars.map((b) => b.value));
  const ticks = niceTicks(0, max, 3, { zero: true }) as number[];
  const top = ticks[ticks.length - 1];
  const sy = (v: number) => padT + ih - (v / top) * ih;
  const band = iw / bars.length;
  const bw = Math.min(24, band - 4);
  const barPath = (x: number, v: number) => {
    const h = Math.max(0, (v / top) * ih);
    if (h <= 0) return '';
    const r = Math.min(4, h, bw / 2);
    const y = padT + ih - h, b = padT + ih;
    return `M${x},${b}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${b}Z`;
  };
  const lastI = bars.length - 1;
  const every = Math.ceil(bars.length / 6);
  const pick = (px: number) => setSel(Math.max(0, Math.min(lastI, Math.floor((px - padL) / band))));
  const sb = sel !== null ? bars[sel] : null;
  return (
    <View onLayout={onLayout} style={{ marginTop: 10 }} testID={testID}
      accessible accessibilityRole="image" accessibilityLabel={`${label}: ${bars.length ? fmtVal(bars[lastI].value) : ''}`}
      onStartShouldSetResponder={() => true} onResponderGrant={(e) => pick(e.nativeEvent.locationX)} onResponderMove={(e) => pick(e.nativeEvent.locationX)}
      onResponderRelease={() => setTimeout(() => setSel(null), 1600)} onResponderTerminationRequest={() => true}>
      {width > 0 && (
        <Svg width={W} height={H}>
          {ticks.map((t) => (
            <G key={'t' + t}>
              <Line x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? c.lineStrong : c.line} strokeWidth={1} />
              <SvgText fontFamily={FONT} x={padL - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} fill={c.ink3}>{String(t)}</SvgText>
            </G>
          ))}
          {!!goal && (
            <G>
              <Line x1={padL} x2={W - padR} y1={sy(goal)} y2={sy(goal)} stroke={c.ink3} strokeWidth={1} strokeDasharray="4 4" />
              <SvgText fontFamily={FONT} x={W - padR} y={sy(goal) - 5} textAnchor="end" fontSize={11} fill={c.ink3}>{tr('Goal {n}', { n: goal })}</SvgText>
            </G>
          )}
          {bars.map((b, i) => {
            const x = padL + band * i + (band - bw) / 2;
            const dim = i !== lastI && sel !== i;
            return (
              <G key={'b' + i}>
                {b.value > 0 && <Path d={barPath(x, b.value)} fill={c.chart} opacity={dim ? 0.45 : 1} />}
                {(i === lastI || i === sel) && b.value > 0 && <SvgText fontFamily={FONT} x={x + bw / 2} y={sy(b.value) - 6} textAnchor="middle" fontSize={12} fontWeight="700" fill={c.ink}>{fmtVal(b.value)}</SvgText>}
                {i % every === lastI % every && <SvgText fontFamily={FONT} x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={11} fill={c.ink3}>{b.label}</SvgText>}
              </G>
            );
          })}
        </Svg>
      )}
      {sb && <Tip left={padL + band * (sel ?? 0) + band / 2} width={W} value={fmtVal(sb.value)} sub={sb.title || sb.label} />}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: 36, paddingHorizontal: 8, alignItems: 'center' },
  tip: { position: 'absolute', top: -8, width: 128, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
});
