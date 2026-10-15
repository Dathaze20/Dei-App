// utils/safetyBootstrap.ts
//
// Browser wiring for the restore engine, and the startup check that runs BEFORE the app's
// screens load (so no automatic save can run while an interrupted restore is unresolved).

import { LOCK_KEY, RecoveryOutcome, RestoreEngine, createRestoreEngine } from './dataRestore';
import { createIndexedDbSafetyStore } from './safetyStore';
import { resumeWrites, suspendWrites } from './storageGuard';

export const APP_NAME = 'DeliOrderNYC';
export const APP_VERSION = '0.0.0';
const LOCK_NAME = 'deliordernyc-restore';
const NOTICE_KEY = 'deliordernyc_restore_notice'; // sessionStorage: survives the reload after a restore

/** Cross-tab mutual exclusion. Web Locks are released automatically if a tab crashes or closes. */
const withWebLock = <T,>(work: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? (locks.request(LOCK_NAME, { mode: 'exclusive' }, work) as Promise<T>) : work();
};

let engine: RestoreEngine | null = null;
let engineError: string | null = null;

/** The restore engine, or null when IndexedDB is unavailable (restore is then disabled). */
export const getRestoreEngine = (): RestoreEngine | null => {
  if (engine || engineError) return engine;
  try {
    engine = createRestoreEngine({
      storage: window.localStorage,
      store: createIndexedDbSafetyStore(),
      exportContext: () => ({
        now: new Date(),
        origin: window.location.origin,
        href: window.location.href,
        userAgent: navigator.userAgent,
        appName: APP_NAME,
        appVersion: APP_VERSION,
      }),
      estimate: async () => (navigator.storage?.estimate ? navigator.storage.estimate() : undefined),
      withLock: withWebLock,
    });
  } catch (e) {
    engineError = e instanceof Error ? e.message : String(e);
  }
  return engine;
};

export const getRestoreEngineError = (): string | null => engineError;

export type StartupNotice = 'restored' | 'undone' | 'recovered-completed' | 'recovered-rolled-back';

export type BootState =
  | { kind: 'ready'; notice: StartupNotice | null }
  | { kind: 'blocked'; reason: 'rollback-failed'; message: string; snapshotId: string }
  | { kind: 'blocked'; reason: 'recovery-unavailable'; message: string };

/** Remembers, across the reload that follows a restore, what to tell the person. */
export const setStartupNotice = (notice: StartupNotice): void => {
  try {
    sessionStorage.setItem(NOTICE_KEY, notice);
  } catch {
    /* only the notice is lost */
  }
};

const takeStartupNotice = (): StartupNotice | null => {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY) as StartupNotice | null;
    sessionStorage.removeItem(NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
};

let listening = false;

/** Pauses saving in this tab while another tab restores, and reloads when it finishes. */
const listenForOtherTabs = () => {
  if (listening) return;
  listening = true;
  window.addEventListener('storage', event => {
    if (event.key !== LOCK_KEY) return;
    if (event.newValue !== null) suspendWrites('another-tab');
    else window.location.reload();
  });
};

const hasLockKey = () => {
  try {
    return window.localStorage.getItem(LOCK_KEY) !== null;
  } catch {
    return false;
  }
};

/** Runs before the app renders. Resolves an interrupted restore if there is one. */
export const bootstrapSafety = async (): Promise<BootState> => {
  listenForOtherTabs();
  const notice = takeStartupNotice();
  if (hasLockKey() && navigator.locks) {
    // Another open tab may be restoring right now: wait for it (the lock is freed if it crashed).
    suspendWrites('another-tab');
  }
  const restoreEngine = getRestoreEngine();
  let outcome: RecoveryOutcome;
  try {
    if (!restoreEngine) throw new Error(engineError ?? 'Recovery storage unavailable');
    outcome = await restoreEngine.recover();
  } catch (e) {
    if (hasLockKey()) {
      suspendWrites('recovery-unavailable');
      return { kind: 'blocked', reason: 'recovery-unavailable', message: e instanceof Error ? e.message : String(e) };
    }
    // No restore was ever started here (the lock is set before anything is changed): safe to run.
    return { kind: 'ready', notice };
  }
  if (outcome.status !== 'rollback-failed') resumeWrites(); // any other tab's restore has finished
  switch (outcome.status) {
    case 'none':
      return { kind: 'ready', notice };
    case 'completed':
      return { kind: 'ready', notice: 'recovered-completed' };
    case 'rolled-back':
      return { kind: 'ready', notice: 'recovered-rolled-back' };
    case 'rollback-failed':
      return { kind: 'blocked', reason: 'rollback-failed', message: outcome.message, snapshotId: outcome.snapshotId };
  }
};
