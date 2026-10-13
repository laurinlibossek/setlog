// The app language. The dictionaries and the translate function live in
// core/i18n.js; this picks the language before anything renders (it's
// mirrored to localStorage whenever the setting changes, "auto" follows the phone).
import { translator, pickLanguage } from './core/i18n.js';

const LS_KEY = 'setlog.lang';

function detect() {
  let pref = 'auto';
  try { pref = localStorage.getItem(LS_KEY) || 'auto'; } catch (e) { /* storage unavailable */ }
  if (pref === 'en' || pref === 'de') return pref;
  const langs = typeof navigator !== 'undefined' ? [...(navigator.languages || []), navigator.language] : [];
  return pickLanguage(langs);
}

const lang = detect();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const getLang = () => lang;

/** The saved setting: 'auto' | 'en' | 'de'. */
export function getLangPref() {
  try { return localStorage.getItem(LS_KEY) || 'auto'; } catch (e) { return 'auto'; }
}

/** Remember the setting ('auto' | 'en' | 'de'); the app reloads to apply it. */
export function saveLangPref(pref) {
  try { localStorage.setItem(LS_KEY, pref); } catch (e) { /* ignore */ }
}

/** Translate `s`, filling {placeholders} from `vars`. */
export const tr = translator(lang);
