// Small Tally pieces for the summary, the workout page and the exercise page
// (docs/design/phases.md, phase 4): a stat strip, the highlight behind a
// number that went up, a section header, a list row, and a finished
// workout's tally. Private to those screens until the shared Tally
// components (StatStrip, Highlight, SectionHeader, ListRow) exist in
// ui/tally/; then these become thin wrappers or go.
import type { ReactNode } from 'react';
import {
  Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';

import {
  CONTROL, RADIUS, SPACE, STROKE, TYPE,
} from '@/design/tally';
import type { Workout } from '@/data/types';
import { useTally } from '@/lib/theme';
import { Icon } from '@/ui/kit';
import { Tally, type StrokeState } from '@/ui/tally/Tally';

/** The screen margin every left edge lines up on. */
export const MARGIN = SPACE.s5;

/** Tabular figures, for every number that changes or is compared. */
export const tnum: TextStyle = { fontVariant: ['tabular-nums'] };

/** Workout length as h:mm ("1:04"). */
export function hm(ms: number) {
  const min = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

/** The signal fill behind a value that went up (Highlight). Wrap the value only. */
export function Mark({ children, style, testID }: { children: string; style?: StyleProp<TextStyle>; testID?: string }) {
  const { colors: t } = useTally();
  return (
    <View style={{ backgroundColor: t.signal, borderRadius: RADIUS.s, paddingHorizontal: 4, alignSelf: 'flex-start' }} testID={testID}>
      <Text style={[{ ...TYPE.headline, color: t.onSignal }, tnum, style]} numberOfLines={1}>{children}</Text>
    </View>
  );
}

export type Stat = { label: string; value: string; unit?: string; mark?: boolean; testID?: string };

/**
 * Three (at most four) facts in a row, label above value, hairlines between
 * them. Columns start from their content's width and share what is left, so a
 * longer value ("Yesterday", "Donnerstag") isn't cut off.
 */
export function StatStrip({ stats, style }: { stats: Stat[]; style?: StyleProp<ViewStyle> }) {
  const { colors: t } = useTally();
  return (
    <View style={[{ flexDirection: 'row' }, style]}>
      {stats.map((s, i) => (
        <View key={s.label} testID={s.testID}
          style={[{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0, gap: 2, paddingHorizontal: SPACE.s3 }, i === 0 ? { paddingLeft: 0 } : { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.line }]}>
          <Text style={{ ...TYPE.footnote, color: t.ink2 }} numberOfLines={1}>{s.label}</Text>
          {s.mark ? (
            <View style={{ backgroundColor: t.signal, borderRadius: RADIUS.s, paddingHorizontal: 4, alignSelf: 'flex-start' }}>
              <Text style={[{ ...TYPE.numberM, color: t.onSignal }, tnum]} numberOfLines={1}>{s.value}</Text>
            </View>
          ) : (
            <Text style={[{ ...TYPE.numberM, color: t.ink }, tnum]} numberOfLines={1}>
              {s.value}
              {!!s.unit && <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0, color: t.ink2 }}>{` ${s.unit}`}</Text>}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

/** A section's title in Title 2, with an optional scope or action on the trailing side. */
export function SectionHead({ title, scope, action }: { title: string; scope?: string; action?: { title: string; onPress: () => void; testID?: string } }) {
  const { colors: t } = useTally();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE.s3, paddingHorizontal: MARGIN, marginTop: SPACE.s8, marginBottom: SPACE.s2 }}>
      <Text style={{ ...TYPE.title2, color: t.ink, flexShrink: 1 }} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      {!!scope && <Text style={{ ...TYPE.footnote, color: t.ink2 }} numberOfLines={1}>{scope}</Text>}
      {action && (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={10} testID={action.testID}>
          <Text style={{ ...TYPE.subhead, color: t.ink, fontWeight: '600' }}>{action.title}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** A full-width row: a title with an optional second line, trailing content and, when it opens a page, a chevron. */
export function Row({
  title, subtitle, lead, trailing, chevron, first, onPress, align = 'center', testID, titleStyle,
}: {
  title: ReactNode; subtitle?: ReactNode; lead?: ReactNode; trailing?: ReactNode; chevron?: boolean; first?: boolean;
  onPress?: () => void; align?: 'center' | 'flex-start'; testID?: string; titleStyle?: StyleProp<TextStyle>;
}) {
  const { colors: t } = useTally();
  const body = (pressed: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: align, gap: SPACE.s3, minHeight: CONTROL.rowH, paddingVertical: 6, paddingHorizontal: MARGIN, backgroundColor: pressed ? t.paper2 : 'transparent' }}>
      {!first && <View style={{ position: 'absolute', top: 0, right: 0, left: MARGIN, height: StyleSheet.hairlineWidth, backgroundColor: t.line }} />}
      {lead}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        {typeof title === 'string' ? <Text style={[{ ...TYPE.body, color: t.ink }, titleStyle]} numberOfLines={1}>{title}</Text> : title}
        {typeof subtitle === 'string' ? <Text style={{ ...TYPE.footnote, color: t.ink2 }} numberOfLines={2}>{subtitle}</Text> : subtitle}
      </View>
      {trailing}
      {chevron && <Icon name="chevron" size={13} color={t.ink3} />}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body(false)}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/** A finished workout as strokes: one group per exercise, warm-ups short, record sets in signal. */
export function workoutStrokes(w: Workout, recordSets: Set<string>): StrokeState[][] {
  return w.exercises.filter((e) => e.sets.length).map((e) => e.sets.map((s): StrokeState => (
    s.type === 'warmup' ? 'warmup' : recordSets.has(s.id) ? 'record' : 'done')));
}

/** Strokes in groups that wrap onto a new line when a long workout runs out of width; read out as one element. */
export function WorkoutTally({ groups, label, size = 'hero', testID }: { groups: StrokeState[][]; label: string; size?: 'regular' | 'hero'; testID?: string }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} testID={testID}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: STROKE.group, rowGap: SPACE.s3 }}>
      {groups.map((g, i) => <Tally key={i} groups={[g]} size={size} label="" />)}
    </View>
  );
}
