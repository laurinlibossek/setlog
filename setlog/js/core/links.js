// Public addresses both apps link to. The contact email lives here and only
// here: the privacy pages read it from this file, and the GitHub Pages deploy
// stops while it's still the placeholder in square brackets, so it never goes live.
export const WEB_APP_URL = 'https://laurinlibossek.github.io/setlog/';
export const CONTACT_EMAIL = '[EMAIL]';
export const SUPPORT_URL = 'https://github.com/laurinlibossek/setlog/issues';

/** The privacy policy page for a language, relative to the web app: German for 'de', English otherwise. */
export const privacyPage = (lang) => (lang === 'de' ? 'datenschutz.html' : 'privacy.html');
