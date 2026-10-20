// utils/uiMode.ts
//
// Which screen style this phone opens with: the original Classic View, or the new Counter screen
// (opt-in during C2; Classic stays available until the owner approves replacing it).
//
// Stored under a `deliordernyc_sys_` key: a device-only display preference, like the restore
// control keys. It is never exported, snapshotted or restored, never touches products, orders,
// counts or backups, and losing it simply means the app opens in Classic View.
import { SYSTEM_KEY_PREFIX } from './dataExport';

export type UiMode = 'classic' | 'counter';

export const UI_MODE_KEY = `${SYSTEM_KEY_PREFIX}uiMode`;

export const readUiMode = (): UiMode => {
  try {
    return localStorage.getItem(UI_MODE_KEY) === 'counter' ? 'counter' : 'classic';
  } catch {
    return 'classic';
  }
};

/** Returns false when the phone would not save it (the choice then lasts until the app closes). */
export const saveUiMode = (mode: UiMode): boolean => {
  try {
    localStorage.setItem(UI_MODE_KEY, mode);
    return true;
  } catch {
    return false;
  }
};
