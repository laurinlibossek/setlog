// Action sheets, choice dialogs, text prompts and toasts, drawn by the app
// itself so they look the same on iPhone, Android and web and can sit on top
// of a modal screen. Every modal screen mounts its own <OverlayHost />; the
// newest mounted host shows them (a host behind a native modal can't be seen).
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import {
  Animated, BackHandler, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLang } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { Icon, type IconName } from './kit';

export type SheetAction<T> = { label: string; value: T; destructive?: boolean; checked?: boolean; icon?: IconName; testID?: string };
export type ChoiceOption<T> = { label: string; sub?: string; value: T; tone?: 'primary' | 'danger' | 'plain'; testID?: string };

type Open =
  | { kind: 'sheet'; title?: string; message?: string; actions: SheetAction<unknown>[]; resolve: (v: unknown) => void }
  | { kind: 'choice'; title: string; message?: string; options: ChoiceOption<unknown>[]; cancel?: string | false; resolve: (v: unknown) => void }
  | { kind: 'prompt'; title: string; message?: string; value: string; placeholder?: string; multiline?: boolean; ok?: string; resolve: (v: unknown) => void };
type OpenInput = Open extends infer O ? (O extends unknown ? Omit<O, 'resolve'> : never) : never;
type Toast = { id: number; text: string; action?: { label: string; fn: () => void } };

// ---------- state ----------
let hosts: string[] = [];
let open: Open | null = null;
let openId = 0;
let toastNow: Toast | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function show<T>(o: OpenInput): Promise<T | undefined> {
  if (open) open.resolve(undefined); // a new one replaces the old
  Keyboard.dismiss();
  return new Promise((resolve) => {
    open = { ...(o as Open), resolve: resolve as (v: unknown) => void };
    openId++;
    emit();
  });
}
function close(value: unknown) {
  const o = open;
  open = null;
  emit();
  o?.resolve(value);
}

/** A list of actions sliding up from the bottom, plus Cancel. Resolves to the chosen value (undefined for Cancel). */
export function actionSheet<T>(o: { title?: string; message?: string; actions: (SheetAction<T> | null | false | undefined)[] }) {
  return show<T>({ kind: 'sheet', title: o.title, message: o.message, actions: o.actions.filter(Boolean) as SheetAction<unknown>[] });
}

/** A dialog with a few big choices (each can have a line of detail). */
export function choose<T>(o: { title: string; message?: string; options: ChoiceOption<T>[]; cancel?: string | false }) {
  return show<T>({ kind: 'choice', ...o } as OpenInput);
}

/** Yes/no in the dialog style. */
export async function ask(o: { title: string; message?: string; ok: string; cancel: string; destructive?: boolean; testID?: string }) {
  const v = await choose<boolean>({
    title: o.title, message: o.message, cancel: false,
    options: [
      { label: o.ok, value: true, tone: o.destructive ? 'danger' : 'primary', testID: o.testID || 'dialog-ok' },
      { label: o.cancel, value: false, tone: 'plain', testID: 'dialog-cancel' },
    ],
  });
  return v === true;
}

/** Ask for a line (or a few lines) of text. Resolves to null on Cancel. */
export async function prompt(o: { title: string; message?: string; value?: string; placeholder?: string; multiline?: boolean; ok?: string }) {
  const v = await show<string>({ kind: 'prompt', value: '', ...o });
  return typeof v === 'string' ? v : null;
}

/** A short message at the bottom, with an optional button (Undo). */
export function toast(text: string, action?: { label: string; fn: () => void }) {
  if (toastTimer) clearTimeout(toastTimer);
  toastNow = { id: Date.now(), text, action };
  emit();
  toastTimer = setTimeout(() => { toastNow = null; toastTimer = null; emit(); }, action ? 5000 : 2600);
}
const hideToast = () => { if (toastTimer) clearTimeout(toastTimer); toastNow = null; toastTimer = null; emit(); };

// ---------- host ----------
export function OverlayHost() {
  const id = useId();
  useSyncExternalStore(subscribe, () => version, () => version);
  useEffect(() => {
    hosts = [...hosts.filter((h) => h !== id), id];
    emit();
    return () => { hosts = hosts.filter((h) => h !== id); emit(); };
  }, [id]);
  useEffect(() => {
    if (!open || Platform.OS !== 'android' || hosts[hosts.length - 1] !== id) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(undefined); return true; });
    return () => sub.remove();
  });
  if (hosts[hosts.length - 1] !== id) return null;
  return (
    <>
      {toastNow && <ToastView key={toastNow.id} t={toastNow} />}
      {open && <Layer key={openId} o={open} />}
    </>
  );
}

function Layer({ o }: { o: Open }) {
  const c = useColors();
  const { tr } = useLang();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start(); }, [fade]);
  const middle = o.kind !== 'sheet';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close(undefined)} accessibilityLabel={tr('Close')} />
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[styles.wrap, middle && styles.middle, {
        opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [middle ? 12 : 40, 0] }) }],
      }]}>
        {o.kind === 'sheet' && <SheetView o={o} />}
        {o.kind === 'choice' && <ChoiceView o={o} />}
        {o.kind === 'prompt' && <PromptView o={o} />}
      </Animated.View>
    </View>
  );
}

function SheetView({ o }: { o: Extract<Open, { kind: 'sheet' }> }) {
  const c = useColors();
  const { tr } = useLang();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ gap: 8, paddingHorizontal: 8, paddingBottom: Math.max(insets.bottom, 8), width: '100%', maxWidth: 560 }} accessibilityViewIsModal>
      <View style={[styles.group, { backgroundColor: c.surface }]}>
        <ScrollView style={{ maxHeight: 520 }} bounces={false}>
          {(!!o.title || !!o.message) && (
            <View style={styles.sheetHead}>
              {!!o.title && <Text style={{ color: c.ink2, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>{o.title}</Text>}
              {!!o.message && <Text style={{ color: c.ink3, fontSize: 13, textAlign: 'center', marginTop: 2, lineHeight: 18 }}>{o.message}</Text>}
            </View>
          )}
          {o.actions.map((a, i) => (
            <Pressable key={i} onPress={() => close(a.value)} accessibilityRole="button" accessibilityState={a.checked === undefined ? undefined : { selected: a.checked }} testID={a.testID}
              style={({ pressed }) => [styles.action, { borderTopColor: c.line, borderTopWidth: i === 0 && !o.title && !o.message ? 0 : StyleSheet.hairlineWidth, backgroundColor: pressed ? c.surface2 : 'transparent' }]}>
              {a.icon && <Icon name={a.icon} size={19} color={a.destructive ? c.danger : c.accentText} />}
              <Text style={{ color: a.destructive ? c.danger : c.accentText, fontSize: 18 }} numberOfLines={1}>{a.label}</Text>
              {a.checked && <Icon name="check" size={17} color={c.accentText} />}
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <Pressable onPress={() => close(undefined)} accessibilityRole="button" testID="sheet-cancel"
        style={({ pressed }) => [styles.group, styles.action, { backgroundColor: pressed ? c.surface2 : c.surface }]}>
        <Text style={{ color: c.accentText, fontSize: 18, fontWeight: '600' }}>{tr('Cancel')}</Text>
      </Pressable>
    </View>
  );
}

function ChoiceView({ o }: { o: Extract<Open, { kind: 'choice' }> }) {
  const c = useColors();
  const { tr } = useLang();
  const look = (tone: ChoiceOption<unknown>['tone']) => (tone === 'danger' ? { bg: c.dangerSoft, ink: c.danger }
    : tone === 'plain' ? { bg: c.surface3, ink: c.ink } : { bg: c.primary, ink: c.primaryInk });
  return (
    <View style={[styles.dialog, { backgroundColor: c.surface }]} accessibilityRole="alert" accessibilityViewIsModal>
      <Text style={{ color: c.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{o.title}</Text>
      {!!o.message && <Text style={{ color: c.ink2, fontSize: 15, textAlign: 'center', marginTop: 6, lineHeight: 21 }}>{o.message}</Text>}
      <View style={{ gap: 8, marginTop: 16 }}>
        {o.options.map((opt, i) => {
          const l = look(opt.tone);
          return (
            <Pressable key={i} onPress={() => close(opt.value)} accessibilityRole="button" testID={opt.testID}
              style={({ pressed }) => [styles.choice, { backgroundColor: l.bg, opacity: pressed ? 0.8 : 1 }]}>
              <Text style={{ color: l.ink, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{opt.label}</Text>
              {!!opt.sub && <Text style={{ color: l.ink, fontSize: 13, textAlign: 'center', marginTop: 2, opacity: 0.85 }}>{opt.sub}</Text>}
            </Pressable>
          );
        })}
        {o.cancel !== false && (
          <Pressable onPress={() => close(undefined)} accessibilityRole="button" testID="dialog-cancel" style={styles.choice}>
            <Text style={{ color: c.accentText, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{o.cancel || tr('Cancel')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PromptView({ o }: { o: Extract<Open, { kind: 'prompt' }> }) {
  const c = useColors();
  const { tr } = useLang();
  const [v, setV] = useState(o.value);
  return (
    <View style={[styles.dialog, { backgroundColor: c.surface, marginBottom: 160 }]} accessibilityViewIsModal>
      <Text style={{ color: c.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{o.title}</Text>
      {!!o.message && <Text style={{ color: c.ink2, fontSize: 14, textAlign: 'center', marginTop: 4 }}>{o.message}</Text>}
      <TextInput value={v} onChangeText={setV} autoFocus multiline={o.multiline} placeholder={o.placeholder} placeholderTextColor={c.ink3}
        onSubmitEditing={o.multiline ? undefined : () => close(v)} returnKeyType={o.multiline ? 'default' : 'done'} testID="prompt-input"
        style={[styles.promptInput, { color: c.ink, backgroundColor: c.surface2, borderColor: c.line, minHeight: o.multiline ? 84 : 44 }]} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Pressable onPress={() => close(undefined)} accessibilityRole="button" testID="prompt-cancel" style={[styles.choice, { flex: 1, backgroundColor: c.surface3 }]}>
          <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{tr('Cancel')}</Text>
        </Pressable>
        <Pressable onPress={() => close(v)} accessibilityRole="button" testID="prompt-ok" style={[styles.choice, { flex: 1, backgroundColor: c.primary }]}>
          <Text style={{ color: c.primaryInk, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>{o.ok || tr('Save')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ToastView({ t }: { t: Toast }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: insets.bottom + 70, paddingHorizontal: 16 }]}>
      <View style={[styles.toast, { backgroundColor: c.ink }]} accessibilityLiveRegion="polite" testID="toast">
        <Text style={{ color: c.bg, fontSize: 15, fontWeight: '500', flexShrink: 1 }}>{t.text}</Text>
        {t.action && (
          <Pressable onPress={() => { hideToast(); t.action!.fn(); }} accessibilityRole="button" hitSlop={8} testID="toast-action">
            <Text style={{ color: c.bg, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' }}>{t.action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center' },
  middle: { justifyContent: 'center', padding: 24 },
  group: { borderRadius: 14, overflow: 'hidden' },
  sheetHead: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  action: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  dialog: { width: '100%', maxWidth: 380, borderRadius: 18, padding: 20 },
  choice: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 48, justifyContent: 'center' },
  promptInput: { marginTop: 14, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, textAlignVertical: 'top' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 520, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
