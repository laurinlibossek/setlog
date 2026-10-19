// The editing screens (template editor, Edit workout) keep their draft in the
// store while they are open, so the shared exercise blocks, the exercise
// picker and the reorder screen work on it like on the running workout.
// Leaving with unsaved changes asks first (Cancel, back gesture, Android back).
import { useLayoutEffect, useRef, useState } from 'react';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';

import { closeEdit, openEdit, useAppSelector } from '@/data/store';
import type { EditDraft } from '@/data/types';
import { useLang } from '@/lib/i18n';
import { ask } from '@/ui/overlay';

export function useEditor<D extends EditDraft>(make: () => D | null) {
  const [init] = useState(make);
  useLayoutEffect(() => {
    if (!init) return undefined;
    openEdit(init);
    return () => closeEdit(init.id);
  }, [init]);
  const cur = useAppSelector((s) => s.edit);
  const draft = (cur && init && cur.id === init.id ? cur : init) as D | null;
  const navigation = useNavigation();
  const leaving = useRef(false);
  const { tr } = useLang();
  usePreventRemove(!!draft?.dirty, ({ data }) => {
    if (leaving.current) { navigation.dispatch(data.action); return; }
    ask({
      title: tr('Discard changes?'), ok: tr('Discard'), cancel: tr('Keep editing'), destructive: true, testID: 'confirm-discard-changes',
    }).then((ok) => {
      if (!ok) return;
      leaving.current = true;
      navigation.dispatch(data.action);
    });
  });
  /** Close the screen without asking (after Save). */
  const leave = () => { leaving.current = true; router.back(); };
  return { draft, leave };
}
