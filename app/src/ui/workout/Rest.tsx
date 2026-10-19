// The rest timer: a pill in the workout's top bar that counts down, a panel
// to change or skip it (or start one by hand), and the watcher that ends it.
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { REST_PRESETS } from '@setlog/core';

import {
  adjustRest, getState, skipRest, startRest, useAppSelector,
} from '@/data/store';
import { useFormat } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { cancelRestAlert, scheduleRestAlert } from '@/lib/restAlert';
import { useColors } from '@/lib/theme';
import { useNow } from '@/lib/useNow';
import { Button, Icon } from '@/ui/kit';

const useRest = () => useAppSelector((s) => s.active?.rest || null);

export function RestPill({ onPress }: { onPress: () => void }) {
  const r = useRest();
  const now = useNow(250, !!r);
  const c = useColors();
  const { tr, clock } = useFormat();
  if (!r) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={tr('Rest timer')} testID="rest-pill"
        style={[styles.pill, { backgroundColor: c.surface3, minWidth: 40, paddingHorizontal: 10 }]}>
        <Icon name="timer" size={17} color={c.ink2} />
      </Pressable>
    );
  }
  const left = Math.max(0, Math.ceil((r.end - now) / 1000));
  const pct = Math.max(0, Math.min(1, (r.end - now) / 1000 / r.total));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={tr('Rest timer, {n} seconds left', { n: left })} testID="rest-pill"
      style={[styles.pill, { backgroundColor: c.primarySoft }]}>
      <View style={[StyleSheet.absoluteFill, { width: `${pct * 100}%`, backgroundColor: c.primary, opacity: 0.18 }]} />
      <Icon name="timer" size={15} color={c.primaryText} />
      <Text style={{ color: c.primaryText, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] }} testID="rest-left">{clock(left)}</Text>
    </Pressable>
  );
}

/** The panel over the workout. Closes by itself when a running timer ends or is skipped. */
export function RestPanel({ onClose }: { onClose: () => void }) {
  const r = useRest();
  const now = useNow(200, !!r);
  const c = useColors();
  const { tr, clock } = useFormat();
  const wasRunning = useRef(false);
  useEffect(() => {
    if (r) wasRunning.current = true;
    else if (wasRunning.current) onClose();
  }, [r, onClose]);
  const body = !r ? (
    <>
      <Text style={[styles.title, { color: c.ink }]}>{tr('Rest timer')}</Text>
      <Text style={{ color: c.ink2, fontSize: 15, textAlign: 'center', marginTop: 6 }}>{tr('Starts on its own when you check off a set. Start one by hand:')}</Text>
      <View style={styles.grid}>
        {(REST_PRESETS as number[]).map((s) => (
          <Pressable key={s} onPress={() => startRest(s, tr('Rest'))} accessibilityRole="button" testID={`rest-start-${s}`}
            style={({ pressed }) => [styles.preset, { backgroundColor: pressed ? c.surface3 : c.surface2 }]}>
            <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{clock(s)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 12 }}><Button kind="plain" title={tr('Close')} onPress={onClose} testID="rest-close" /></View>
    </>
  ) : (
    <>
      <Text style={[styles.big, { color: c.ink }]} testID="rest-big">{clock(Math.max(0, Math.ceil((r.end - now) / 1000)))}</Text>
      <Text style={{ color: c.ink3, fontSize: 14, textAlign: 'center' }}>{tr('of {time}', { time: clock(r.total) })}{r.label ? ` · ${r.label}` : ''}</Text>
      <View style={[styles.track, { backgroundColor: c.surface3 }]}>
        <View style={{ width: `${Math.max(0, Math.min(1, (r.end - now) / 1000 / r.total)) * 100}%`, height: '100%', borderRadius: 4, backgroundColor: c.accent }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        <View style={{ flex: 1 }}><Button kind="tinted" title={tr('−15 s')} onPress={() => adjustRest(-15)} testID="rest-minus" /></View>
        <View style={{ flex: 1 }}><Button kind="tinted" title={tr('+15 s')} onPress={() => adjustRest(15)} testID="rest-plus" /></View>
      </View>
      <View style={{ marginTop: 8 }}><Button title={tr('Skip rest')} onPress={() => { skipRest(); onClose(); }} testID="rest-skip" /></View>
    </>
  );
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityLabel={tr('Close')} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={[styles.panel, { backgroundColor: c.surface }]} accessibilityViewIsModal testID="rest-panel">{body}</View>
      </View>
    </View>
  );
}

/**
 * Ends the rest timer on time (with a buzz), wherever the app is, and keeps
 * the notification for a locked phone in step with it.
 */
export function RestWatcher() {
  const r = useRest();
  const end = r?.end;
  const label = r?.label || '';
  const alerts = useAppSelector((s) => s.settings.restAlert !== false);
  const { tr } = useLang();
  useEffect(() => {
    if (!end || !alerts) { cancelRestAlert(); return; }
    const named = label && label !== tr('Rest');
    scheduleRestAlert(end, tr('Rest is over'), named ? tr('Time for your next set of {name}', { name: label }) : tr('Time for your next set'));
  }, [end, alerts]); // label and language don't move the alert
  useEffect(() => {
    if (!end) return undefined;
    const t = setTimeout(() => {
      if (getState().active?.rest?.end !== end) return;
      // back from the background long after the end: the notification already said so
      const late = Date.now() - end > 3000;
      skipRest();
      if (!late) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, Math.max(0, end - Date.now()));
    return () => clearTimeout(t);
  }, [end]);
  return null;
}

const styles = StyleSheet.create({
  pill: { height: 34, minWidth: 84, paddingHorizontal: 12, borderRadius: 17, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 380, borderRadius: 18, padding: 20 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  big: { fontSize: 56, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  track: { height: 8, borderRadius: 4, marginTop: 14, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  preset: { width: '31%', flexGrow: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
