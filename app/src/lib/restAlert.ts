// Rest timer alerts while the phone is locked or the app is in the
// background: a local notification scheduled for the moment the rest ends,
// replaced when the timer changes and cancelled when it's skipped. While the
// app is open the timer buzzes instead, so the notification stays hidden.
// Local notifications work in Expo Go; there's nothing to do on the web.
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const ID = 'rest-timer';
const CHANNEL = 'rest';
const supported = Platform.OS === 'ios' || Platform.OS === 'android';
let setUp = false;
let asked = false;

function setup() {
  if (setUp || !supported) return;
  setUp = true;
  Notifications.setNotificationHandler({
    // shown only when the app isn't in front (the open app buzzes by itself)
    handleNotification: async () => {
      const away = AppState.currentState !== 'active';
      return { shouldShowBanner: away, shouldShowList: away, shouldPlaySound: away, shouldSetBadge: false };
    },
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Rest timer', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 150, 250], sound: 'default',
    }).catch(() => {});
  }
}

/** May we notify? Asks once (the first time a rest timer starts). */
async function allowed(): Promise<boolean> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
    if (asked || !p.canAskAgain) return false;
    asked = true;
    const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return r.granted;
  } catch {
    return false;
  }
}

let seq = 0;

/** Schedule (or move) the alert for a rest ending at `end` (ms). */
export async function scheduleRestAlert(end: number, title: string, body: string) {
  if (!supported) return;
  setup();
  const mine = ++seq;
  if (!(await allowed()) || mine !== seq) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(ID);
    if (mine !== seq || end <= Date.now() + 500) return;
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: { title, body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: end, channelId: CHANNEL },
    });
  } catch {
    // no alert this time; the timer itself still runs
  }
}

/** The rest was skipped or the workout ended. */
export async function cancelRestAlert() {
  if (!supported || !setUp) return;
  seq++;
  try {
    await Notifications.cancelScheduledNotificationAsync(ID);
    await Notifications.dismissNotificationAsync(ID);
  } catch {
    // nothing scheduled
  }
}
