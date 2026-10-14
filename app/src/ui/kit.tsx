// Building blocks for every screen, in the web app's look: large titles,
// grouped rows on a tinted background, rounded cards, filled and tinted buttons.
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useColors, type Colors } from '@/lib/theme';

// ---------- icons ----------
/** SF Symbol on iOS, Material Symbol on Android and web. */
export const ICONS = {
  profile: { ios: 'person.crop.circle', android: 'person', web: 'person' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  workout: { ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' },
  exercises: { ios: 'dumbbell.fill', android: 'fitness_center', web: 'fitness_center' },
  measure: { ios: 'ruler', android: 'straighten', web: 'straighten' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  trophy: { ios: 'trophy.fill', android: 'emoji_events', web: 'emoji_events' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  weight: { ios: 'scalemass', android: 'scale', web: 'scale' },
  download: { ios: 'square.and.arrow.down', android: 'download', web: 'download' },
  swap: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return <SymbolView name={ICONS[name] as SymbolViewProps['name']} size={size} tintColor={color} />;
}

// ---------- text ----------
type TxtProps = { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number; tone?: 'ink' | 'ink2' | 'ink3' | 'accent' | 'danger' | 'gold' };
export function Txt({ children, style, numberOfLines, tone = 'ink' }: TxtProps) {
  const c = useColors();
  const color = { ink: c.ink, ink2: c.ink2, ink3: c.ink3, accent: c.accentText, danger: c.danger, gold: c.gold }[tone];
  return <Text style={[{ color, fontSize: 16 }, style]} numberOfLines={numberOfLines}>{children}</Text>;
}

// ---------- screens ----------
/** A tab's main screen: large title, optional button on the right, scrolling content. */
export function Screen({ title, right, children, scroll = true }: { title: string; right?: ReactNode; children: ReactNode; scroll?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const head = <LargeTitle title={title} right={right} />;
  if (!scroll) {
    return <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>{head}{children}</View>;
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 32 }}>
      {head}
      <View style={styles.page}>{children}</View>
    </ScrollView>
  );
}

export function LargeTitle({ title, right }: { title: string; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.titleRow}>
      <Text style={[styles.largeTitle, { color: c.ink }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
      {right}
    </View>
  );
}

/** Content of a pushed screen (the navigation bar gives the title). */
export function Page({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={[styles.page, { paddingTop: 12, paddingBottom: 40 }]} contentInsetAdjustmentBehavior="automatic">
      {children}
    </ScrollView>
  );
}

export function Loading() {
  const c = useColors();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.accent} /></View>;
}

// ---------- grouped lists ----------
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: c.label }]}>{children}</Text>
      {right}
    </View>
  );
}

export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[styles.group, { backgroundColor: c.surface }, style]}>{children}</View>;
}

type CellProps = {
  title: string;
  sub?: string;
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  first?: boolean;
  danger?: boolean;
  right?: ReactNode;
  /** a ">" on rows that open another screen; off for choices */
  chevron?: boolean;
  /** a checkmark for the chosen option in a list of choices */
  checked?: boolean;
  testID?: string;
};
export function Cell({ title, sub, value, icon, onPress, first, danger, right, chevron = true, checked, testID }: CellProps) {
  const c = useColors();
  const body = (pressed: boolean) => (
    <View style={[styles.cell, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}>
      {!first && <View style={[styles.hairline, { backgroundColor: c.line, left: icon ? 52 : 16 }]} />}
      {icon && <View style={[styles.cellIcon, { backgroundColor: c.accentSoft }]}><Icon name={icon} size={17} color={c.accentText} /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: danger ? c.danger : c.ink, fontSize: 16 }} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={{ color: c.ink3, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{sub}</Text>}
      </View>
      {!!value && <Text style={{ color: c.ink3, fontSize: 15, marginLeft: 8, flexShrink: 0, maxWidth: '45%' }} numberOfLines={1}>{value}</Text>}
      {right}
      {checked && <Icon name="check" size={17} color={c.accentText} />}
      {onPress && chevron && checked === undefined && <View style={{ marginLeft: 4 }}><Icon name="chevron" size={13} color={c.ink3} /></View>}
    </View>
  );
  if (!onPress) return body(false);
  return (
    <Pressable onPress={onPress} accessibilityRole={checked === undefined ? 'button' : 'radio'} accessibilityState={checked === undefined ? undefined : { checked }} testID={testID}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/** A row of mutually exclusive choices, like the web app's segmented control. */
export function Segments<T extends string>({ value, options, onChange, testID }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testID?: string }) {
  const c = useColors();
  return (
    <View style={[styles.seg, { backgroundColor: c.surface3 }]} accessibilityRole="tablist" testID={testID}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[styles.segBtn, on && { backgroundColor: c.surface, shadowOpacity: 0.12 }]}>
            <Text style={{ color: c.ink, fontWeight: on ? '600' : '500', fontSize: 14 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- cards & buttons ----------
export function Card({ children, onPress, style, testID }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; testID?: string }) {
  const c = useColors();
  const box = (pressed = false) => [styles.card, { backgroundColor: pressed ? c.surface2 : c.surface }, style];
  if (!onPress) return <View style={box()}>{children}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => box(pressed)} accessibilityRole="button" testID={testID}>{children}</Pressable>;
}

type ButtonProps = { title: string; onPress: () => void; kind?: 'primary' | 'tinted' | 'plain' | 'danger'; icon?: IconName; large?: boolean; disabled?: boolean; testID?: string };
export function Button({ title, onPress, kind = 'primary', icon, large, disabled, testID }: ButtonProps) {
  const c = useColors();
  const look = buttonLook(c, kind);
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" testID={testID}
      style={({ pressed }) => [styles.btn, large && styles.btnLarge, { backgroundColor: look.bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}>
      {icon && <Icon name={icon} size={large ? 18 : 16} color={look.ink} />}
      <Text style={{ color: look.ink, fontSize: large ? 17 : 16, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}
function buttonLook(c: Colors, kind: ButtonProps['kind']) {
  if (kind === 'tinted') return { bg: c.accentSoft, ink: c.accentText };
  if (kind === 'plain') return { bg: c.surface, ink: c.accentText };
  if (kind === 'danger') return { bg: c.dangerSoft, ink: c.danger };
  return { bg: c.primary, ink: c.primaryInk };
}

export function IconButton({ icon, onPress, label, testID }: { icon: IconName; onPress: () => void; label: string; testID?: string }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID} hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? c.surface3 : 'transparent' }]}>
      <Icon name={icon} size={22} color={c.accentText} />
    </Pressable>
  );
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16, gap: 8 }}>
      <Text style={{ color: c.ink, fontSize: 19, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {!!text && <Text style={{ color: c.ink2, fontSize: 15, textAlign: 'center', lineHeight: 21 }}>{text}</Text>}
      {children && <View style={{ marginTop: 12, alignSelf: 'stretch' }}>{children}</View>}
    </View>
  );
}

export function SearchField({ value, onChange, placeholder, testID }: { value: string; onChange: (v: string) => void; placeholder: string; testID?: string }) {
  const c = useColors();
  return (
    <View style={[styles.search, { backgroundColor: c.surface3 }]}>
      <Icon name="search" size={16} color={c.ink3} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.ink3} testID={testID}
        autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" style={{ flex: 1, color: c.ink, fontSize: 16, paddingVertical: 8 }} />
    </View>
  );
}

export const styles = StyleSheet.create({
  page: { paddingHorizontal: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 8 },
  largeTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.6, flexShrink: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  group: { borderRadius: 14, overflow: 'hidden' },
  cell: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  hairline: { position: 'absolute', top: 0, right: 0, height: StyleSheet.hairlineWidth },
  cellIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 14, padding: 14 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 12, paddingHorizontal: 16 },
  btnLarge: { minHeight: 52, borderRadius: 14 },
  iconBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', borderRadius: 10, padding: 2 },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 32, borderRadius: 8, paddingHorizontal: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, shadowOpacity: 0 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 10 },
});
