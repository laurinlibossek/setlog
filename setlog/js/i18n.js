// Translations. The English text is the key; de.js maps it to German.
// The language is known before anything renders: it's mirrored to
// localStorage whenever the setting changes ("auto" follows the phone).
import DE from './i18n-de.js';

const LS_KEY = 'setlog.lang';

function detect() {
  let pref = 'auto';
  try { pref = localStorage.getItem(LS_KEY) || 'auto'; } catch (e) { /* storage unavailable */ }
  if (pref === 'en' || pref === 'de') return pref;
  const langs = typeof navigator !== 'undefined' ? [...(navigator.languages || []), navigator.language] : [];
  const first = langs.find(Boolean) || 'en';
  return /^de\b/i.test(first) ? 'de' : 'en';
}

let lang = detect();
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
export function tr(s, vars) {
  let out = lang === 'de' && DE[s] !== undefined ? DE[s] : s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return out;
}
