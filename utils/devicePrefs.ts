// utils/devicePrefs.ts
//
// How this phone likes the Counter screen: favourite and recent suppliers, the supplier last
// worked on, Order or Count mode, and display density. A `deliordernyc_sys_` key, like the restore
// control keys: never exported, snapshotted or restored, and never mixed with products, orders,
// counts or backups. If it cannot be read or saved the app simply uses the defaults.
//
// The C2.2 key `deliordernyc_sys_uiMode` (Classic or Counter) is no longer read. It is left in
// place, untouched, rather than deleted: it holds nothing but that old choice.
import { SYSTEM_KEY_PREFIX } from './dataExport';

export const DEVICE_PREFS_KEY = `${SYSTEM_KEY_PREFIX}prefs`;

export type Density = 'comfortable' | 'compact';
export type WorkMode = 'order' | 'count';

export interface DevicePrefs {
  /** Pinned supplier ids, in the order they were pinned. */
  favorites: string[];
  /** Most recently chosen supplier ids, newest first. */
  recent: string[];
  lastSupplier: string;
  mode: WorkMode;
  density: Density;
}

export const MAX_RECENT = 4;

export const DEFAULT_PREFS: DevicePrefs = { favorites: [], recent: [], lastSupplier: '', mode: 'order', density: 'comfortable' };

const ids = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 200))].slice(0, max) : [];

/** Reads whatever is valid and falls back to defaults for the rest. */
export const parsePrefs = (text: string | null): DevicePrefs => {
  if (!text) return { ...DEFAULT_PREFS };
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS };
    return {
      favorites: ids(raw.favorites, 50),
      recent: ids(raw.recent, MAX_RECENT),
      lastSupplier: typeof raw.lastSupplier === 'string' ? raw.lastSupplier : '',
      mode: raw.mode === 'count' ? 'count' : 'order',
      density: raw.density === 'compact' ? 'compact' : 'comfortable',
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const readPrefs = (): DevicePrefs => {
  try {
    return parsePrefs(localStorage.getItem(DEVICE_PREFS_KEY));
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

/** Returns false when the phone would not save it (the choice then lasts until the app closes). */
export const writePrefs = (prefs: DevicePrefs): boolean => {
  try {
    localStorage.setItem(DEVICE_PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
};

/** Choosing a supplier: it becomes the last one and moves to the front of the recent list. */
export const withSupplierChosen = (prefs: DevicePrefs, supplierId: string): DevicePrefs => ({
  ...prefs,
  lastSupplier: supplierId,
  recent: [supplierId, ...prefs.recent.filter(id => id !== supplierId)].slice(0, MAX_RECENT),
});

export const withFavoriteToggled = (prefs: DevicePrefs, supplierId: string): DevicePrefs => ({
  ...prefs,
  favorites: prefs.favorites.includes(supplierId) ? prefs.favorites.filter(id => id !== supplierId) : [...prefs.favorites, supplierId],
});

/**
 * The quick suppliers next to the current one: the recently used ones, never the current
 * supplier, only suppliers that still exist, at most `max`. (Pinned suppliers were removed from
 * the screen in v0.1.5; a saved `favorites` list is kept as it is but no longer used.)
 */
export const quickSuppliers = (prefs: DevicePrefs, currentId: string, existing: ReadonlySet<string>, max = 3): string[] =>
  prefs.recent.filter(id => id !== currentId && existing.has(id)).slice(0, max);
