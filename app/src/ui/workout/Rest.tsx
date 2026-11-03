// The rest timer's watcher: it ends the rest on time, wherever the app is, and
// keeps the notification for a locked phone in step with it. The countdown
// itself is in the session's Action bar (src/ui/tally/RestBar.tsx).
import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';

import { getState, skipRest, useAppSelector } from '@/data/store';
import { useLang } from '@/lib/i18n';
import { cancelRestAlert, scheduleRestAlert } from '@/lib/restAlert';

const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

export function RestWatcher() {
  const r = useAppSelector((s) => s.active?.rest || null);
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
    let second: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      if (getState().active?.rest?.end !== end) return;
      // back from the background long after the end: the notification already said so
      const late = Date.now() - end > 3000;
      skipRest();
      // rest over: two light taps, 120 ms apart (docs/design/motion.md)
      if (!late) { tap(); second = setTimeout(tap, 120); }
    }, Math.max(0, end - Date.now()));
    return () => { clearTimeout(t); clearTimeout(second); };
  }, [end]);
  return null;
}
