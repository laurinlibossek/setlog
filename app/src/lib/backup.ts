// "Back up now": the whole log as one file through the share sheet (Save to
// Files, iCloud Drive…), the same format the web app writes and reads.
import Constants from 'expo-constants';

import { backupText, markBackedUp } from '@/data/store';
import { toast } from '@/ui/overlay';
import { dateStamp, saveTextFile } from './files';
import type { Tr } from './i18n';

export const appVersion = () => Constants.expoConfig?.version || '';

export async function backupNow(tr: Tr) {
  const r = await saveTextFile(`setlog-backup-${dateStamp()}.json`, backupText(appVersion()), 'application/json', 'public.json', tr('Back up now'));
  if (r === 'failed') { toast(tr('Couldn’t make the backup')); return; }
  await markBackedUp();
  toast(r === 'shared' ? tr('Backup ready') : tr('Backup downloaded'));
}
