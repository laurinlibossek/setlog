// Template links that open the app (increment://…?template=…, the exp://
// link of Expo Go, or later the web app's https link as a universal link).
// +native-intent.tsx hands the URL over here instead of routing it, and
// <IncomingLinks /> offers the template once the app is ready. In the web
// build the page's own address is checked once at start.
import { Platform } from 'react-native';

const TEMPLATE_LINK = /[#?&]template=[A-Za-z0-9_-]{8,}/;
let pending: string | null = null;
const listeners = new Set<() => void>();

/** Whether a URL carries a shared template. */
export const isTemplateLink = (url: string) => TEMPLATE_LINK.test(url);

/** Keep a template link to offer (the newest one wins). */
export function receiveLink(url: string) {
  pending = url;
  listeners.forEach((l) => l());
}

/** The link waiting to be offered, once; null if there is none. */
export function takeLink(): string | null {
  const url = pending;
  pending = null;
  return url;
}

export function onLink(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Web build: a template link in the page address. Returns true if there was one. */
export function checkPageAddress(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const href = window.location.href;
  if (!isTemplateLink(href)) return false;
  receiveLink(href);
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
}
