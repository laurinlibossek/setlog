// Links that open the app on iPhone and Android. A shared template link isn't
// a screen: it is kept for <IncomingLinks /> to offer, and the app opens (or
// stays) where it is. Every other link is routed as usual.
import { isTemplateLink, receiveLink } from '@/lib/incoming';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (path && isTemplateLink(path)) {
      receiveLink(path);
      return initial ? '/' : null;
    }
  } catch {
    // never let a strange link crash the app
  }
  return path;
}
