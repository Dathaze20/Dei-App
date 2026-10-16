// utils/storageGuard.ts
//
// The single gate between the app's automatic saving and localStorage.
//
// Loading: each saved value is checked (utils/dataValidation.ts). If it is missing, the app uses
// its built-in sample data exactly as before. If it is present but unreadable, the original text
// is LEFT IN PLACE and that key is BLOCKED: the app shows sample data in memory, but nothing is
// ever written over the original until the person explicitly chooses Restore or Start Fresh.
//
// Saving: every automatic save goes through `guardedSetItem`, which refuses to write
//   - a blocked key,
//   - anything while writes are suspended (a restore is running here or in another tab, or
//     startup found an unresolved restore),
//   - a key that another tab or window changed since this page last read or wrote it (this
//     page's copy is stale; saving it would silently overwrite the newer data), and
//   - a value identical to what is already stored (no needless rewrites at startup).

import { validateStoredValue } from './dataValidation';

export type LoadStatus = 'missing' | 'ok' | 'invalid' | 'unavailable';

export interface BlockedKey {
  key: string;
  status: 'invalid' | 'unavailable' | 'changed-elsewhere';
  problems: string[];
  /** What the app is showing instead, serialized. Used only if the person chooses Start Fresh. */
  fallbackText: string;
}

export interface GuardState {
  blocked: BlockedKey[];
  suspendedReason: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const blocked = new Map<string, BlockedKey>();
/** The exact text this page last read or wrote for each key (null = it was missing). */
const lastKnown = new Map<string, string | null>();
let suspendedReason: string | null = null;
const listeners = new Set<() => void>();
let snapshot: GuardState = { blocked: [], suspendedReason: null };

const emit = () => {
  snapshot = { blocked: Array.from(blocked.values()), suspendedReason };
  listeners.forEach(listener => listener());
};

export const subscribeGuard = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Stable object for React's useSyncExternalStore. */
export const getGuardState = (): GuardState => snapshot;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export interface LoadResult<T> {
  value: T;
  status: LoadStatus;
}

/**
 * Loads one saved key.
 * - `parse`: turns the stored text into the in-memory value (JSON.parse, or identity for text).
 * - `fallback`: what to use when the key is missing or unreadable.
 * - `serialize`: how the fallback would be saved (kept for Start Fresh).
 */
export const loadGuarded = <T>(
  key: string,
  options: { parse: (text: string) => T; fallback: () => T; serialize: (value: T) => string },
  storage: StorageLike | null = defaultStorage(),
): LoadResult<T> => {
  const block = (status: 'invalid' | 'unavailable', problems: string[]): LoadResult<T> => {
    const value = options.fallback();
    blocked.set(key, { key, status, problems, fallbackText: options.serialize(value) });
    emit();
    return { value, status };
  };

  let text: string | null;
  try {
    if (!storage) throw new Error('Browser storage is not available.');
    text = storage.getItem(key);
  } catch (e) {
    return block('unavailable', [e instanceof Error ? e.message : String(e)]);
  }
  lastKnown.set(key, text);
  if (text === null) return { value: options.fallback(), status: 'missing' };

  const validation = validateStoredValue(key, text);
  if (!validation.ok) return block('invalid', validation.problems);
  try {
    return { value: options.parse(text), status: 'ok' };
  } catch (e) {
    return block('invalid', [e instanceof Error ? e.message : String(e)]);
  }
};

/** Reads a plain-text setting (theme, language) and remembers it for the stale-copy check. */
export const readTracked = (key: string, storage: StorageLike | null = defaultStorage()): string | null => {
  try {
    const text = storage ? storage.getItem(key) : null;
    lastKnown.set(key, text);
    return text;
  } catch {
    return null;
  }
};

export const isKeyBlocked = (key: string): boolean => blocked.has(key);

export const areWritesSuspended = (): boolean => suspendedReason !== null;

/** Pauses all automatic saving, e.g. while a restore runs. */
export const suspendWrites = (reason: string): void => {
  suspendedReason = reason;
  emit();
};

export const resumeWrites = (): void => {
  suspendedReason = null;
  emit();
};

/**
 * The only way the app's automatic saving may write. Returns true when the stored value now
 * equals `value`, false when the write was refused or failed. Never throws.
 */
export const guardedSetItem = (key: string, value: string, storage: StorageLike | null = defaultStorage()): boolean => {
  if (suspendedReason !== null || blocked.has(key) || !storage) return false;
  try {
    const current = storage.getItem(key);
    if (current === value) {
      lastKnown.set(key, value);
      return true;
    }
    if (lastKnown.has(key) && current !== lastKnown.get(key)) {
      // Someone else wrote this key after this page read it. Never overwrite newer data.
      blocked.set(key, {
        key,
        status: 'changed-elsewhere',
        problems: ['It was changed in another tab or window after this page loaded.'],
        fallbackText: value,
      });
      emit();
      return false;
    }
    storage.setItem(key, value);
    lastKnown.set(key, value);
    return true;
  } catch (e) {
    console.error(`Could not save "${key}":`, e);
    return false;
  }
};

/**
 * Checks, without writing, that a key still holds what this page last read or wrote. If another
 * tab or window changed it since, the key is blocked exactly as a refused save would block it,
 * and false is returned. Used before an action that depends on this page's copy being current.
 */
export const confirmUnchanged = (key: string, storage: StorageLike | null = defaultStorage()): boolean => {
  if (blocked.has(key) || !storage) return false;
  try {
    const current = storage.getItem(key);
    if (lastKnown.has(key) && current !== lastKnown.get(key)) {
      blocked.set(key, {
        key,
        status: 'changed-elsewhere',
        problems: ['It was changed in another tab or window after this page loaded.'],
        fallbackText: lastKnown.get(key) ?? '',
      });
      emit();
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

/** Test helper: forget all blocked keys and suspension. Not used by the app. */
export const resetGuardForTests = (): void => {
  blocked.clear();
  lastKnown.clear();
  suspendedReason = null;
  emit();
};
