// utils/fileDownload.ts
//
// Saves text as a file on the device. Used for backups, safety snapshots and recovery files.
// In a browser this is a normal download. The Android app's WebView has no downloads, so there
// Android's own "Save to…" screen is shown instead (the person picks the folder, e.g. Downloads).

import { DeliNative, isAndroidApp } from './nativeApp';

export type SaveOutcome = 'started' | 'saved' | 'cancelled' | 'failed';

/** Saves `text` as `fileName`; resolves when the browser download started or the file was saved. */
export const saveTextFile = async (fileName: string, text: string, type = 'application/json'): Promise<SaveOutcome> => {
  if (isAndroidApp()) {
    try {
      const { saved } = await DeliNative.saveTextFile({ fileName, text, mimeType: type });
      return saved ? 'saved' : 'cancelled';
    } catch {
      return 'failed';
    }
  }
  return downloadInBrowser(fileName, text, type) ? 'started' : 'failed';
};

/** Starts a download of `text` as `fileName`. Returns false if the browser blocked it. */
export const downloadTextFile = (fileName: string, text: string, type = 'application/json'): boolean => {
  if (isAndroidApp()) {
    void saveTextFile(fileName, text, type);
    return true;
  }
  return downloadInBrowser(fileName, text, type);
};

const downloadInBrowser = (fileName: string, text: string, type: string): boolean => {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
};

const pad = (n: number) => String(n).padStart(2, '0');

/** `deliordernyc-snapshot-pre-restore-2026-10-15-165200.json` (local time). */
export const snapshotFileName = (purpose: string, isoDate: string): string => {
  const d = new Date(isoDate);
  return `deliordernyc-snapshot-${purpose}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
};
