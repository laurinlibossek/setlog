import { Alert, Platform } from 'react-native';

import type { Tr } from './i18n';

/** A plain message box (Alert on the phone, alert() in a browser). */
export function notice(title: string, message: string) {
  if (Platform.OS === 'web') globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** Logging arrives in the next step; until then the start buttons say so. */
export const notYet = (tr: Tr) => notice(tr('Coming next'), tr('Logging workouts comes in the next update. Until then, keep logging in the Setlog web app.'));

/** Ask before something that can't be undone. Resolves to true for OK. */
export function confirm(title: string, message: string, ok: string, cancel: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm ? globalThis.confirm(`${title}\n\n${message}`) : true);
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
