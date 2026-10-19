// Handing a file to the user: the share sheet on the phone (Save to Files,
// AirDrop, Mail…), a download in a browser.
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type SaveResult = 'shared' | 'downloaded' | 'failed';

const pad = (n: number) => String(n).padStart(2, '0');
export const dateStamp = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export async function saveTextFile(name: string, text: string, mime: string, uti: string, dialogTitle: string): Promise<SaveResult> {
  if (Platform.OS === 'web') {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return 'downloaded';
    } catch {
      return 'failed';
    }
  }
  try {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    if (!(await Sharing.isAvailableAsync())) return 'failed';
    await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: uti, dialogTitle });
    return 'shared';
  } catch {
    return 'failed';
  }
}
