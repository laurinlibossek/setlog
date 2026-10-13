// Translations. The English text is the key; each dictionary maps it to
// another language. Unknown keys fall back to the English text.
import DE from './i18n-de.js';

export const DICTIONARIES = { de: DE };
export const LANGUAGES = ['en', 'de'];

/** A tr(text, vars) function for `lang` that fills {placeholders} from `vars`. */
export function translator(lang) {
  const dict = DICTIONARIES[lang] || {};
  return (s, vars) => {
    let out = dict[s] !== undefined ? dict[s] : s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return out;
  };
}

/** 'de' when the first preferred language is German, otherwise 'en'. */
export function pickLanguage(preferred = []) {
  const first = preferred.find(Boolean) || 'en';
  return /^de\b/i.test(first) ? 'de' : 'en';
}
