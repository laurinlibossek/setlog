// One series over time (docs/design/components.md, LineChart): one 2 px ink
// line, no fill, no smoothing; dotted grid lines at the ticks with the values
// on the trailing side, a hairline baseline and three or four date labels.
// Each new record is a signal dot outlined in signal-edge; other points aren't
// drawn. Touch and drag to read a value: a hairline cursor with the value above
// it and a selection tick per point. Drawn once per data change, no animation.
// The axis maths is the shared core's (core/chart.js).
import { useRef, useState } from 'react';
import {
  Platform, Text, View, type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { niceTicks, tickDecimals } from '@setlog/core';

import { TYPE } from '@/design/tally';
import { useFormat } from '@/lib/format';
import { useTally } from '@/lib/theme';

// SVG text in a browser falls back to a serif font; use the system one
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined;
const DAY = 86400000;

export interface LineChartPoint { at: number; value: number; record?: boolean }
export interface LineChartProps {
  /** Oldest first; `at` in ms, `value` in display units. */
  points: LineChartPoint[];
  /** A value as text with its unit ("101.3 kg"), for the cursor and screen readers. */
  formatValue: (v: number) => string;
  /** An axis value as text, without the unit; `decimals` fits the tick step. */
  formatAxis?: (v: number, decimals: number) => string;
  /** Values are durations (ticks on minutes and seconds). */
  time?: boolean;
  /** Read out with the latest value, e.g. "Estimated 1RM over 6 months". */
  label: string;
  /** Shown instead of the chart when there are no points. */
  emptyText: string;
  height?: number;
  testID?: string;
}

export function LineChart({
  points, formatValue, formatAxis = (v) => String(v), time = false, label, emptyText, height = 170, testID,
}: LineChartProps) {
  const { colors: t } = useTally();
  const f = useFormat();
  const [width, setWidth] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const picked = useRef<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  if (!points.length) {
    return (
      <View onLayout={onLayout} style={{ height, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }} testID={testID}>
        <Text style={{ ...TYPE.subhead, color: t.ink2, textAlign: 'center' }}>{emptyText}</Text>
      </View>
    );
  }

  const ys = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), 4, { time }) as number[];
  const dec = tickDecimals(ticks) as number;
  const tickText = ticks.map((v) => formatAxis(v, dec));
  // the values sit on the trailing side; leave room for the longest one
  const padR = Math.max(26, Math.max(...tickText.map((s) => s.length)) * 6.6 + 8);
  const padT = 10, padB = 26;
  const W = Math.max(width, 200), H = height;
  const iw = W - padR - 4, ih = H - padT - padB;
  const x0 = points[0].at, x1 = points[points.length - 1].at;
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const sx = (x: number) => (x1 === x0 ? iw / 2 : ((x - x0) / (x1 - x0)) * iw);
  const sy = (y: number) => padT + ih - ((y - y0) / (y1 - y0 || 1)) * ih;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.at).toFixed(1)} ${sy(p.value).toFixed(1)}`).join(' ');

  // three or four date labels, evenly spread
  const span = (x1 - x0) / DAY;
  const dateText = (at: number) => (span < 75 ? f.date.dayMonth(at)
    : span > 400 ? `${f.date.monthShort(at)} ${String(new Date(at).getFullYear()).slice(2)}` : f.date.monthShort(at));
  const fractions = points.length === 1 || span < 1 ? [0.5] : iw < 260 ? [0, 0.5, 1] : [0, 1 / 3, 2 / 3, 1];
  const anchor = (fr: number) => (fr === 0 ? 'start' : fr === 1 ? 'end' : 'middle');

  const pick = (px: number) => {
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(sx(p.at) - px); if (dd < bd) { bd = dd; best = i; } });
    if (hide.current) { clearTimeout(hide.current); hide.current = null; }
    if (picked.current !== best && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    picked.current = best;
    setSel(best);
  };
  const release = () => { hide.current = setTimeout(() => { picked.current = null; setSel(null); }, 1600); };
  const sp = sel !== null ? points[sel] : null;
  const last = points[points.length - 1];
  const tipLeft = sp ? Math.min(Math.max(sx(sp.at) - 70, 0), W - 140) : 0;

  return (
    <View onLayout={onLayout} testID={testID}
      accessible accessibilityRole="image" accessibilityLabel={`${label}: ${formatValue(last.value)}`}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => pick(e.nativeEvent.locationX)} onResponderMove={(e) => pick(e.nativeEvent.locationX)}
      onResponderRelease={release} onResponderTerminate={release} onResponderTerminationRequest={() => true}>
      {width > 0 && (
        <Svg width={W} height={H}>
          {ticks.slice(1).map((v) => (
            <Line key={`g${v}`} x1={0} x2={iw} y1={sy(v)} y2={sy(v)} stroke={t.line} strokeWidth={1} strokeDasharray="2 4" />
          ))}
          <Line x1={0} x2={iw} y1={sy(y0)} y2={sy(y0)} stroke={t.line} strokeWidth={1} />
          {ticks.map((v, i) => (
            <SvgText key={`v${v}`} fontFamily={FONT} x={iw + 6} y={sy(v) + 4} textAnchor="start" fontSize={11} fontWeight="500" fill={t.ink2}>{tickText[i]}</SvgText>
          ))}
          {fractions.map((fr) => (
            <SvgText key={`d${fr}`} fontFamily={FONT} x={fr * iw} y={H - 6} textAnchor={anchor(fr)} fontSize={11} fontWeight="500" fill={t.ink2}>
              {dateText(x0 + fr * (x1 - x0))}
            </SvgText>
          ))}
          {sp && <Line x1={sx(sp.at)} x2={sx(sp.at)} y1={padT} y2={sy(y0)} stroke={t.ink3} strokeWidth={1} />}
          {points.length > 1
            ? <Path d={d} fill="none" stroke={t.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            : <Circle cx={sx(last.at)} cy={sy(last.value)} r={4} fill={t.paper} stroke={t.ink} strokeWidth={2} />}
          {points.map((p, i) => (p.record
            ? <Circle key={`r${i}`} cx={sx(p.at)} cy={sy(p.value)} r={4} fill={t.signal} stroke={t.signalEdge} strokeWidth={1.5} />
            : null))}
          {sp && !sp.record && points.length > 1 && <Circle cx={sx(sp.at)} cy={sy(sp.value)} r={4} fill={t.paper} stroke={t.ink} strokeWidth={2} />}
        </Svg>
      )}
      {sp && (
        <View pointerEvents="none" testID="chart-tip"
          style={{ position: 'absolute', top: -8, left: tipLeft, width: 140, alignItems: 'center', backgroundColor: t.paper, paddingVertical: 2 }}>
          <Text style={{ ...TYPE.headline, color: t.ink, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{formatValue(sp.value)}</Text>
          <Text style={{ ...TYPE.caption, color: t.ink2 }} numberOfLines={1}>{f.date.medium(sp.at)}</Text>
        </View>
      )}
    </View>
  );
}
