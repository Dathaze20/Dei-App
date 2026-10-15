// utils/fileDownload.ts
//
// Saves text as a file on the device. Used for safety snapshots and recovery files.

/** Starts a download of `text` as `fileName`. Returns false if the browser blocked it. */
export const downloadTextFile = (fileName: string, text: string, type = 'application/json'): boolean => {
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
