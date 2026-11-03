// Offers the template in a link that opened the app (see lib/incoming.ts),
// the same way Templates ⋯ → Add shared template does with a pasted link.
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';

import { useFormat } from '@/lib/format';
import { checkPageAddress, onLink, takeLink } from '@/lib/incoming';
import { offerSharedTemplate } from '@/lib/templates';
import { toast } from '@/ui/overlay';

export function IncomingLinks() {
  const f = useFormat();
  const fmt = useRef(f);
  fmt.current = f;
  useEffect(() => {
    let busy = false;
    const next = async () => {
      if (busy) return;
      const url = takeLink();
      if (!url) return;
      busy = true;
      try {
        if (!(await offerSharedTemplate(url, fmt.current))) toast(fmt.current.tr('That doesn’t look like a Setlog template link'));
      } finally {
        busy = false;
        next(); // one that arrived meanwhile
      }
    };
    const off = onLink(next);
    // web build: the router keeps ?template= as a parameter of the screen; drop it so a reload doesn't ask again
    if (checkPageAddress()) router.setParams({ template: undefined });
    next();
    return off;
  }, []);
  return null;
}
