// Entry point: app shell, tabs, service worker, wake lock, theme.
import { html, render } from './lib.js';
import { Component as PComponent } from './vendor/preact.js';
import { Icon } from './icons.js';
import {
  S, load, useStore, subscribe, ui, flushActive, emit,
} from './store.js';
import {
  nav, TABS, setTab, ModalHost, ToastHost, toast,
} from './ui.js';
import { WorkoutSheet, MiniBar } from './sheet.js';
import { WorkoutTab, TemplateEditScreen } from './screens/workout.js';
import { HistoryTab, WorkoutDetailScreen, WorkoutEditScreen } from './screens/history.js';
import { ExercisesTab, ExerciseDetailScreen } from './screens/exercises.js';
import { MeasureTab, MeasureDetailScreen } from './screens/measure.js';
import { ProfileTab, SettingsScreen } from './screens/profile.js';
import { beep, unlockAudio } from './sound.js';
import { backupJSON, saveFile, dateStamp } from './io.js';

const ROOTS = {
  profile: ProfileTab, history: HistoryTab, workout: WorkoutTab, exercises: ExercisesTab, measure: MeasureTab,
};
const SCREENS = {
  settings: SettingsScreen,
  'workout-detail': WorkoutDetailScreen,
  'workout-edit': WorkoutEditScreen,
  'template-edit': TemplateEditScreen,
  exercise: ExerciseDetailScreen,
  'measure-detail': MeasureDetailScreen,
};
const TAB_META = {
  profile: { label: 'Profile', icon: 'user' },
  history: { label: 'History', icon: 'history' },
  workout: { label: 'Workout', icon: 'plusCircle' },
  exercises: { label: 'Exercises', icon: 'dumbbell' },
  measure: { label: 'Measure', icon: 'ruler' },
};

function TabStack({ tab }) {
  useStore('nav');
  const stack = nav.stacks[tab];
  const Root = ROOTS[tab];
  return html`
    <div class="screen" hidden=${stack.length > 0}><${Root} /></div>
    ${stack.map((entry, i) => {
      const Scr = SCREENS[entry.screen];
      return html`<div class="screen" key=${entry.key} hidden=${i !== stack.length - 1}><${Scr} ...${entry.props} /></div>`;
    })}`;
}

function TabBar() {
  useStore('nav');
  return html`<nav class="tabbar" aria-label="Main">${TABS.map((t) => html`<button key=${t} id=${'tab-' + t}
    class=${'tab' + (nav.tab === t ? ' on' : '')} aria-current=${nav.tab === t ? 'page' : undefined}
    onClick=${() => setTab(t)}><${Icon} name=${TAB_META[t].icon} />${TAB_META[t].label}</button>`)}</nav>`;
}

// Shell deliberately doesn't subscribe to 'active': typing in the running
// workout must not re-render every tab. The mini bar offset is pure CSS (:has).
function Shell() {
  useStore('ready', 'nav');
  if (!S.ready) return html`<div class="boot"><div class="boot-mark">Setlog</div><div>Loading…</div></div>`;
  return html`
    ${TABS.map((t) => html`<div key=${t} class="tab-panel" hidden=${nav.tab !== t}><${TabStack} tab=${t} /></div>`)}
    <${MiniBar} />
    <${TabBar} />
    <${WorkoutSheet} />
    <${ModalHost} />
    <${ToastHost} />`;
}

class ErrorBoundary extends PComponent {
  constructor() { super(); this.state = { error: null }; }
  componentDidCatch(error) { console.error(error); this.setState({ error }); }
  render() {
    if (!this.state.error) return this.props.children;
    return html`<div class="page stack" style="padding-top:calc(var(--safe-top) + 40px)">
      <h1 class="large-title">Something went wrong</h1>
      <p class="ink2">Your data is safe on this phone. Reload the app; if this keeps happening, save a backup first.</p>
      <pre class="small muted" style="white-space:pre-wrap;overflow-wrap:anywhere">${String(this.state.error?.message || this.state.error)}</pre>
      <button class="btn btn-primary btn-block" onClick=${() => location.reload()}>Reload</button>
      <button class="btn btn-block" onClick=${() => saveFile(`setlog-backup-${dateStamp()}.json`, backupJSON(), 'application/json')}>Save a backup</button>
    </div>`;
  }
}

// ---------- theme ----------
function applyTheme() {
  const t = S.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  else if (!window.SETLOG_PREVIEW) root.removeAttribute('data-theme'); // the preview host sets its own
  requestAnimationFrame(() => {
    const bg = getComputedStyle(root).getPropertyValue('--bar-bg').trim() || '#f1f3f6';
    const solid = getComputedStyle(root).getPropertyValue('--bg').trim() || bg;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', solid));
  });
}

// ---------- screen wake lock ----------
let wakeLock = null;
let wakeBusy = false;
async function syncWakeLock() {
  const want = !!S.active && S.settings.keepAwake && document.visibilityState === 'visible';
  if (wakeBusy) return;
  wakeBusy = true;
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; } finally { wakeBusy = false; }
}

// ---------- service worker ----------
let userRequestedReload = false;
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || window.SETLOG_PREVIEW) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = () => {
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      toast('A new version of Setlog is ready', {
        ms: 60000,
        action: {
          label: 'Update',
          fn: () => { flushActive(); userRequestedReload = true; reg.waiting?.postMessage('skipWaiting'); },
        },
      });
    };
    if (reg.waiting) offer();
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed') offer(); });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => { /* e.g. sandboxed preview */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userRequestedReload) { userRequestedReload = false; location.reload(); }
  });
}

// ---------- boot ----------
let lastSaveErrorToast = 0;
ui.toast = (m) => toast(m);
ui.onSaveError = () => {
  if (Date.now() - lastSaveErrorToast < 15000) return;
  lastSaveErrorToast = Date.now();
  toast('Couldn’t save to storage. Make a backup in Settings to be safe.');
};
ui.onRestDone = (late) => {
  if (document.visibilityState !== 'visible') return;
  if (late < 4000) {
    if (S.settings.sound) beep();
    toast('Rest over — time for the next set');
  }
};

document.addEventListener('pointerdown', unlockAudio, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushActive();
  syncWakeLock();
});
window.addEventListener('pagehide', () => flushActive());
subscribe(['active', 'settings'], syncWakeLock);
subscribe(['settings'], applyTheme);

render(html`<${ErrorBoundary}><${Shell} /><//>`, document.getElementById('app'));
registerSW();
load().then(() => { applyTheme(); syncWakeLock(); }).catch((e) => {
  console.error(e);
  S.ready = true;
  emit('ready');
  toast('Couldn’t load your data: ' + (e?.message || e));
});

