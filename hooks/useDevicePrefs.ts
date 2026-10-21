import { useCallback, useSyncExternalStore } from 'react';
import { DevicePrefs, readPrefs, writePrefs } from '../utils/devicePrefs';

// One shared copy of this phone's display preferences (utils/devicePrefs.ts) for every screen.
let current: DevicePrefs | null = null;
const listeners = new Set<() => void>();

const snapshot = () => (current ??= readPrefs());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Changes the preferences now; saving is best effort (they still apply until the app closes). */
export const updatePrefs = (change: (prefs: DevicePrefs) => DevicePrefs) => {
  current = change(snapshot());
  writePrefs(current);
  listeners.forEach(listener => listener());
};

/** For tests: forget the in-memory copy so the next read comes from storage. */
export const resetPrefsCache = () => {
  current = null;
};

export const useDevicePrefs = (): [DevicePrefs, (change: (prefs: DevicePrefs) => DevicePrefs) => void] => {
  const prefs = useSyncExternalStore(subscribe, snapshot, snapshot);
  return [prefs, useCallback(updatePrefs, [])];
};
