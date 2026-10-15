// utils/dataRestore.ts
//
// Replace-only restore with a mandatory, verified safety snapshot, a write-ahead journal,
// read-back verification, automatic rollback, startup recovery and Undo.
//
// localStorage cannot write several keys atomically, so atomicity is NOT claimed. Instead every
// restore follows this order, and each step is recorded before the next one starts:
//
//   1. Refuse to start unless: no earlier restore is unresolved, the backup's deli data passes
//      validation, the browser can compute SHA-256, and there appears to be enough space.
//   2. Pause all automatic saving (storageGuard) and set a lock key other tabs listen for.
//   3. Save a snapshot of the current deli data to IndexedDB, read it back and verify it
//      (byte-for-byte and by SHA-256). If that fails, stop: nothing has been changed.
//   4. Write a journal to IndexedDB naming the snapshot and the exact target data.
//   5. Write the target data to localStorage, then read every key back and compare.
//   6. Match: clear the journal. Mismatch or error: write the snapshot data back, read it back.
//   7. If even that fails, keep the journal, snapshot and lock, mark the journal
//      "rollback-failed" and refuse every further restore until it is resolved.
//
// If the browser closes or crashes at any point, the journal is still in IndexedDB. On the next
// start, `recover()` runs before the app loads: if the target was fully written it finishes the
// restore, otherwise it puts the snapshot data back.
//
// Only DeliOrderNYC's data keys are ever written or removed. Other apps' keys and system keys
// are never touched.

import {
  DataExport,
  ExportContext,
  KNOWN_STORAGE_KEYS,
  ReadableStorage,
  SYSTEM_KEY_PREFIX,
  VerificationResult,
  classifyStorage,
  createExport,
  isDataKey,
  isSystemKey,
  rawCanonical,
  readStorageKeys,
  serializeExport,
  verifyExportText,
} from './dataExport';
import { validateStoredValue } from './dataValidation';
import { JournalRecord, SafetyStore, SnapshotPurpose, SnapshotRecord } from './safetyStore';
import { resumeWrites, suspendWrites } from './storageGuard';

export const LOCK_KEY = `${SYSTEM_KEY_PREFIX}restore_lock`;
export const LAST_RESTORE_KEY = `${SYSTEM_KEY_PREFIX}last_restore`;
export const MAX_SNAPSHOTS = 3;
/** Extra free space required on top of twice the snapshot and journal size. */
export const SPACE_MARGIN_BYTES = 1024 * 1024;

export interface WritableStorage extends ReadableStorage {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The deli data currently in storage (data keys only, exact text). */
export const readDataKeys = (storage: ReadableStorage): Record<string, string> =>
  readStorageKeys(storage, classifyStorage(storage).appOwnedKeys);

const sameData = (a: Record<string, string>, b: Record<string, string>) => rawCanonical(a) === rawCanonical(b);

// --- Analysing a backup ----------------------------------------------------------------------

export interface SkippedKey {
  key: string;
  reason: 'other-app' | 'system';
}

export interface BackupAnalysis {
  verification: VerificationResult;
  /** False when the backup must not be restored at all. */
  canRestore: boolean;
  /** True when the person must explicitly accept an unverified backup. */
  requiresAcknowledgement: boolean;
  /** Reasons the backup cannot be restored (beyond verification problems). */
  problems: string[];
  /** Exactly what DeliOrderNYC's data keys will contain after the restore. */
  target: Record<string, string>;
  /** Keys in the file that will NOT be restored. Their values are never written. */
  skipped: SkippedKey[];
  exportedAt: string | null;
  sourceOrigin: string | null;
}

export const analyzeBackup = async (text: string): Promise<BackupAnalysis> => {
  const verification = await verifyExportText(text);
  const empty: BackupAnalysis = {
    verification,
    canRestore: false,
    requiresAcknowledgement: false,
    problems: [],
    target: {},
    skipped: [],
    exportedAt: null,
    sourceOrigin: null,
  };
  if (verification.status === 'invalid') return empty;

  const parsed = JSON.parse(text) as DataExport;
  const target: Record<string, string> = {};
  const skipped: SkippedKey[] = [];
  for (const key of Object.keys(parsed.raw).sort()) {
    if (isSystemKey(key)) skipped.push({ key, reason: 'system' });
    else if (isDataKey(key)) target[key] = parsed.raw[key];
    else skipped.push({ key, reason: 'other-app' });
  }

  const problems: string[] = [];
  if (Object.keys(target).length === 0) problems.push('The backup contains no DeliOrderNYC data.');
  for (const key of Object.keys(target)) {
    const result = validateStoredValue(key, target[key]);
    if (!result.ok) problems.push(...result.problems.map(problem => `${key}: ${problem}`));
  }

  return {
    ...empty,
    canRestore: problems.length === 0,
    requiresAcknowledgement: verification.status === 'unverified',
    problems,
    target,
    skipped,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
    sourceOrigin: typeof parsed.source?.origin === 'string' ? parsed.source.origin : null,
  };
};

// --- Describing the change -------------------------------------------------------------------

export interface NamedItem {
  id: string;
  name: string;
}

export interface ChangedItem extends NamedItem {
  fields: string[];
}

export interface ListDiff {
  before: number | null;
  after: number | null;
  added: NamedItem[];
  removed: NamedItem[];
  changed: ChangedItem[];
}

export interface ValueChange {
  key: string;
  before: string | null;
  after: string | null;
}

export interface RestoreDiff {
  products: ListDiff;
  suppliers: ListDiff;
  orderLines: { before: number | null; after: number | null };
  settings: ValueChange[];
  /** Other app-owned keys (e.g. future inventory_* data) that are added, removed or changed. */
  otherDataKeys: ValueChange[];
}

type AnyRecord = Record<string, unknown> & { id?: unknown };

const parseList = (text: string | undefined): AnyRecord[] | null => {
  if (text === undefined) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};

const labelOf = (record: AnyRecord): string =>
  [record.name, record.flavor].filter(part => typeof part === 'string' && part).join(' ') || String(record.id);

const diffLists = (beforeText: string | undefined, afterText: string | undefined): ListDiff => {
  const before = parseList(beforeText);
  const after = parseList(afterText);
  const index = (list: AnyRecord[] | null) => new Map((list ?? []).map(item => [String(item.id), item]));
  const b = index(before);
  const a = index(after);
  const added: NamedItem[] = [];
  const removed: NamedItem[] = [];
  const changed: ChangedItem[] = [];
  a.forEach((item, id) => {
    const old = b.get(id);
    if (!old) {
      added.push({ id, name: labelOf(item) });
      return;
    }
    const fields = Array.from(new Set([...Object.keys(old), ...Object.keys(item)]))
      .filter(field => JSON.stringify(old[field]) !== JSON.stringify(item[field]))
      .sort();
    if (fields.length > 0) changed.push({ id, name: labelOf(item), fields });
  });
  b.forEach((item, id) => {
    if (!a.has(id)) removed.push({ id, name: labelOf(item) });
  });
  return { before: before ? before.length : null, after: after ? after.length : null, added, removed, changed };
};

const countOrderLines = (text: string | undefined): number | null => {
  if (text === undefined) return 0;
  try {
    const value = JSON.parse(text);
    return Array.isArray(value?.items) ? value.items.length : null;
  } catch {
    return null;
  }
};

const SETTINGS_KEYS: string[] = [KNOWN_STORAGE_KEYS.deliName.key, KNOWN_STORAGE_KEYS.theme.key, KNOWN_STORAGE_KEYS.language.key];
const LIST_KEYS: string[] = [KNOWN_STORAGE_KEYS.products.key, KNOWN_STORAGE_KEYS.suppliers.key, KNOWN_STORAGE_KEYS.currentOrder.key];

export const diffRestore = (current: Record<string, string>, target: Record<string, string>): RestoreDiff => {
  const { products, suppliers, currentOrder } = KNOWN_STORAGE_KEYS;
  const change = (key: string): ValueChange => ({ key, before: current[key] ?? null, after: target[key] ?? null });
  const differs = (key: string) => (current[key] ?? null) !== (target[key] ?? null);
  const others = Array.from(new Set([...Object.keys(current), ...Object.keys(target)]))
    .filter(key => !SETTINGS_KEYS.includes(key) && !LIST_KEYS.includes(key))
    .sort();
  return {
    products: diffLists(current[products.key], target[products.key]),
    suppliers: diffLists(current[suppliers.key], target[suppliers.key]),
    orderLines: { before: countOrderLines(current[currentOrder.key]), after: countOrderLines(target[currentOrder.key]) },
    settings: SETTINGS_KEYS.filter(differs).map(change),
    otherDataKeys: others.filter(differs).map(change),
  };
};

// --- The engine ------------------------------------------------------------------------------

export type RefusalReason =
  | 'unresolved-restore'
  | 'invalid-target'
  | 'no-crypto'
  | 'insufficient-space'
  | 'lock-failed'
  | 'snapshot-failed'
  | 'snapshot-unverified'
  | 'journal-failed'
  | 'no-snapshot'
  | 'data-changed';

export const DATA_CHANGED_MESSAGE =
  "DeliOrderNYC's data on this device changed after it was reviewed (for example in another tab). " +
  'Nothing was changed. Check the backup again to review the updated comparison.';

export interface RestoreOptions {
  /**
   * The exact deli data (data keys only) the person reviewed in the preview. If the data on the
   * device no longer matches it when the restore is about to write, the restore is refused.
   * Other apps' keys and system keys are not part of it, so changes to them never block a restore.
   */
  expectedCurrent?: Record<string, string>;
}

export type RestoreOutcome =
  | { status: 'restored'; snapshotId: string }
  | { status: 'refused'; reason: RefusalReason; message: string }
  | { status: 'rolled-back'; snapshotId: string; message: string }
  | { status: 'rollback-failed'; snapshotId: string; message: string };

export type RecoveryOutcome =
  | { status: 'none' }
  | { status: 'completed'; snapshotId: string }
  | { status: 'rolled-back'; snapshotId: string; message: string }
  | { status: 'rollback-failed'; snapshotId: string; message: string };

export interface StorageEstimate {
  quota?: number;
  usage?: number;
}

export interface RestoreEnvironment {
  storage: WritableStorage;
  store: SafetyStore;
  /** Metadata for snapshot files. */
  exportContext: () => ExportContext;
  /** Free-space estimate (navigator.storage.estimate). Undefined = unknown. */
  estimate?: () => Promise<StorageEstimate | undefined>;
  /** Cross-tab mutual exclusion (Web Locks). Defaults to running directly. */
  withLock?: <T>(work: () => Promise<T>) => Promise<T>;
  newId?: () => string;
  maxSnapshots?: number;
}

export interface LastRestoreInfo {
  snapshotId: string;
  restoredAt: string;
  purpose: SnapshotPurpose;
}

export const readLastRestore = (storage: ReadableStorage): LastRestoreInfo | null => {
  try {
    const text = storage.getItem(LAST_RESTORE_KEY);
    return text ? (JSON.parse(text) as LastRestoreInfo) : null;
  } catch {
    return null;
  }
};

/** Parses a snapshot's deli data, or null if the snapshot is not intact. */
export const snapshotData = async (snapshot: SnapshotRecord | undefined): Promise<Record<string, string> | null> => {
  if (!snapshot) return null;
  const verification = await verifyExportText(snapshot.exportText);
  if (verification.status !== 'verified') return null;
  const parsed = JSON.parse(snapshot.exportText) as DataExport;
  if (parsed.rawChecksum !== snapshot.rawChecksum) return null;
  const data: Record<string, string> = {};
  for (const key of Object.keys(parsed.raw)) if (isDataKey(key)) data[key] = parsed.raw[key];
  return data;
};

export const createRestoreEngine = (env: RestoreEnvironment) => {
  const { storage, store } = env;
  const withLock = env.withLock ?? (<T,>(work: () => Promise<T>) => work());
  const newId = env.newId ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const maxSnapshots = env.maxSnapshots ?? MAX_SNAPSHOTS;

  const refuse = (reason: RefusalReason, message: string): RestoreOutcome => ({ status: 'refused', reason, message });

  /** Writes `target` into the data keys: set every target key, then remove data keys not in it. */
  const apply = (target: Record<string, string>) => {
    const existing = classifyStorage(storage).appOwnedKeys;
    for (const key of Object.keys(target)) storage.setItem(key, target[key]);
    for (const key of existing) if (!(key in target)) storage.removeItem(key);
  };

  const tryClearLock = () => {
    try {
      storage.removeItem(LOCK_KEY);
    } catch {
      /* best effort: a stale lock is cleaned up at the next start */
    }
  };

  const pruneSnapshots = async () => {
    // Only called after a newer snapshot has been saved and verified. Never deletes to make room.
    const all = await store.listSnapshots();
    for (const old of all.slice(maxSnapshots)) {
      try {
        await store.deleteSnapshot(old.id);
      } catch {
        /* keeping an extra copy is harmless */
      }
    }
  };

  /** Puts the snapshot's data back. Never deletes the snapshot or (on failure) the journal. */
  const rollback = async (journal: JournalRecord, cause: string) => {
    const previous = await snapshotData(await store.getSnapshot(journal.snapshotId).catch(() => undefined));
    const fail = async (message: string) => {
      try {
        await store.putJournal({ ...journal, phase: 'rollback-failed', updatedAt: new Date().toISOString(), error: message });
      } catch {
        /* the earlier journal entry is still there and still points at the snapshot */
      }
      return { status: 'rollback-failed' as const, snapshotId: journal.snapshotId, message };
    };
    if (!previous) return fail(`${cause} The safety snapshot could not be read or verified, so the data could not be put back automatically.`);
    try {
      await store.putJournal({ ...journal, phase: 'rolling-back', updatedAt: new Date().toISOString(), error: cause });
    } catch {
      /* the "applying" entry still triggers a rollback at the next start */
    }
    try {
      apply(previous);
    } catch (e) {
      return fail(`${cause} Putting the previous data back also failed: ${errorText(e)}`);
    }
    if (!sameData(readDataKeys(storage), previous)) {
      return fail(`${cause} The previous data was written back but did not read back identically.`);
    }
    try {
      await store.clearJournal();
    } catch {
      /* harmless: the next start sees "rolling-back", rolls back again (idempotent) and clears it */
    }
    tryClearLock();
    return { status: 'rolled-back' as const, snapshotId: journal.snapshotId, message: cause };
  };

  const createVerifiedSnapshot = async (purpose: SnapshotPurpose): Promise<SnapshotRecord | RestoreOutcome> => {
    const exported = await createExport(storage, env.exportContext());
    if (!exported.rawChecksum) {
      return refuse('no-crypto', 'This browser cannot compute SHA-256 here, so a verified safety snapshot cannot be made.');
    }
    const exportText = serializeExport({ ...exported, purpose });
    const record: SnapshotRecord = {
      id: newId(),
      createdAt: new Date().toISOString(),
      purpose,
      exportText,
      rawChecksum: exported.rawChecksum,
      byteLength: byteLength(exportText),
    };
    try {
      await store.putSnapshot(record);
    } catch (e) {
      return refuse('snapshot-failed', `The safety snapshot could not be saved (${errorText(e)}). Nothing was changed.`);
    }
    let readBack: SnapshotRecord | undefined;
    try {
      readBack = await store.getSnapshot(record.id);
    } catch {
      readBack = undefined;
    }
    const verified = readBack?.exportText === exportText && (await snapshotData(readBack)) !== null;
    if (!verified) {
      await store.deleteSnapshot(record.id).catch(() => undefined); // only this new, unusable record
      return refuse('snapshot-unverified', 'The safety snapshot did not read back intact. Nothing was changed.');
    }
    return record;
  };

  const hasEnoughSpace = async (snapshotBytes: number, target: Record<string, string>) => {
    if (!env.estimate) return true;
    let estimate: StorageEstimate | undefined;
    try {
      estimate = await env.estimate();
    } catch {
      return true;
    }
    if (estimate?.quota === undefined || estimate.usage === undefined) return true;
    const needed = 2 * (snapshotBytes + byteLength(JSON.stringify(target))) + SPACE_MARGIN_BYTES;
    return estimate.quota - estimate.usage >= needed;
  };

  /**
   * Replaces DeliOrderNYC's data with `target`. On success, automatic saving stays paused: the
   * caller must reload the page so every screen reads the restored data.
   */
  const restore = (
    target: Record<string, string>,
    purpose: SnapshotPurpose = 'pre-restore',
    options: RestoreOptions = {},
  ): Promise<RestoreOutcome> =>
    withLock(async () => {
      const { expectedCurrent } = options;
      const matchesReview = (data: Record<string, string>) => !expectedCurrent || sameData(data, expectedCurrent);

      try {
        if (await store.getJournal()) {
          return refuse('unresolved-restore', 'An earlier restore has not been resolved. Resolve it before starting another.');
        }
      } catch (e) {
        return refuse('journal-failed', `The recovery database is not available (${errorText(e)}). Nothing was changed.`);
      }

      const badKeys = Object.keys(target).filter(key => !isDataKey(key));
      const invalid = Object.keys(target).flatMap(key =>
        validateStoredValue(key, target[key]).problems.map(problem => `${key}: ${problem}`),
      );
      if (badKeys.length > 0 || invalid.length > 0) {
        return refuse('invalid-target', [...badKeys.map(key => `${key} is not DeliOrderNYC data.`), ...invalid].join(' '));
      }

      // Check 1 of 3: the data still matches the reviewed preview (cheap, before any work).
      if (!matchesReview(readDataKeys(storage))) return refuse('data-changed', DATA_CHANGED_MESSAGE);

      const currentBytes = byteLength(JSON.stringify(readDataKeys(storage)));
      if (!(await hasEnoughSpace(currentBytes, target))) {
        return refuse('insufficient-space', 'There is not enough free browser storage to save a safety snapshot first. Nothing was changed.');
      }

      suspendWrites('restore');
      const giveUp = (outcome: RestoreOutcome) => {
        tryClearLock();
        resumeWrites();
        return outcome;
      };

      try {
        storage.setItem(LOCK_KEY, JSON.stringify({ startedAt: new Date().toISOString() }));
      } catch (e) {
        return giveUp(refuse('lock-failed', `Browser storage is full or blocked (${errorText(e)}). Nothing was changed.`));
      }

      const snapshot = await createVerifiedSnapshot(purpose);
      if ('status' in snapshot) return giveUp(snapshot);
      const snapshotRaw = (await snapshotData(snapshot)) ?? {};

      /**
       * Gives up after a snapshot (and maybe a journal) were saved for a restore that will not run.
       * Nothing in localStorage was changed. The journal is cleared first; only if that worked is
       * the new, unused snapshot deleted (never an older recovery copy). If the journal could not
       * be cleared, the snapshot is kept so the next start can still resolve the journal.
       */
      const abandon = async (outcome: RestoreOutcome) => {
        let journalCleared = true;
        try {
          await store.clearJournal();
        } catch {
          journalCleared = false;
        }
        if (journalCleared) await store.deleteSnapshot(snapshot.id).catch(() => undefined);
        return giveUp(outcome);
      };

      // Check 2 of 3: the safety snapshot holds exactly the reviewed data.
      if (!matchesReview(snapshotRaw)) return abandon(refuse('data-changed', DATA_CHANGED_MESSAGE));

      const now = new Date().toISOString();
      const journal: JournalRecord = {
        id: 'active',
        restoreId: newId(),
        phase: 'applying',
        snapshotId: snapshot.id,
        target,
        purpose,
        startedAt: now,
        updatedAt: now,
      };
      try {
        await store.putJournal(journal);
        const readBack = await store.getJournal();
        if (!readBack || rawCanonical(readBack.target) !== rawCanonical(target) || readBack.snapshotId !== snapshot.id) {
          throw new Error('the journal did not read back intact');
        }
      } catch (e) {
        return abandon(refuse('journal-failed', `The restore journal could not be saved (${errorText(e)}). Nothing was changed.`));
      }

      // Check 3 of 3, immediately before the first write (nothing is awaited between this check and
      // the writes): the data must still equal the snapshot, and the reviewed preview if there was
      // one. Otherwise another tab saved something after the snapshot was taken, and writing now
      // would lose it.
      const beforeWrite = readDataKeys(storage);
      if (!sameData(beforeWrite, snapshotRaw) || !matchesReview(beforeWrite)) {
        return abandon(refuse('data-changed', DATA_CHANGED_MESSAGE));
      }

      let failure: string | null = null;
      try {
        apply(target);
        if (!sameData(readDataKeys(storage), target)) failure = 'The restored data did not read back identically.';
      } catch (e) {
        failure = `Writing the backup failed: ${errorText(e)}.`;
      }

      if (failure) {
        const outcome = await rollback(journal, failure);
        if (outcome.status === 'rolled-back') {
          await pruneSnapshots().catch(() => undefined);
          resumeWrites();
        }
        return outcome; // rollback-failed: journal, snapshot and lock are kept; saving stays paused
      }

      try {
        await store.clearJournal();
      } catch {
        /* harmless: the next start sees the target fully written and completes the restore */
      }
      try {
        storage.setItem(LAST_RESTORE_KEY, JSON.stringify({ snapshotId: snapshot.id, restoredAt: new Date().toISOString(), purpose }));
      } catch {
        /* only affects the Undo shortcut; the snapshot itself is kept */
      }
      tryClearLock();
      await pruneSnapshots().catch(() => undefined);
      return { status: 'restored', snapshotId: snapshot.id };
    });

  /** Runs at startup, before the app loads. Finishes or rolls back an interrupted restore. */
  const recover = (): Promise<RecoveryOutcome> =>
    withLock(async () => {
      const journal = await store.getJournal();
      if (!journal) {
        tryClearLock();
        return { status: 'none' as const };
      }
      suspendWrites('recovery');
      if (journal.phase === 'applying' && sameData(readDataKeys(storage), journal.target)) {
        await store.clearJournal().catch(() => undefined);
        tryClearLock();
        resumeWrites();
        return { status: 'completed' as const, snapshotId: journal.snapshotId };
      }
      const cause = journal.error ?? 'The previous restore was interrupted before it finished.';
      const outcome = await rollback(journal, cause);
      if (outcome.status === 'rolled-back') resumeWrites();
      return outcome;
    });

  /** Undo the most recent restore by restoring its safety snapshot (with a new snapshot first). */
  const undoLastRestore = async (): Promise<RestoreOutcome> => {
    const last = readLastRestore(storage);
    if (!last) return refuse('no-snapshot', 'There is no restore to undo.');
    let snapshot: SnapshotRecord | undefined;
    try {
      snapshot = await store.getSnapshot(last.snapshotId);
    } catch {
      snapshot = undefined;
    }
    const data = await snapshotData(snapshot);
    if (!data) return refuse('no-snapshot', 'The safety snapshot for the last restore is missing or damaged.');
    const outcome = await restore(data, 'pre-undo');
    if (outcome.status === 'restored') {
      try {
        storage.removeItem(LAST_RESTORE_KEY);
      } catch {
        /* the shortcut stays visible; using it again would restore the undo's own snapshot */
      }
    }
    return outcome;
  };

  return {
    restore,
    recover,
    undoLastRestore,
    retryRollback: () =>
      withLock(async (): Promise<RecoveryOutcome> => {
        const journal = await store.getJournal();
        if (!journal) return { status: 'none' };
        const outcome = await rollback(journal, journal.error ?? 'Retrying the rollback.');
        if (outcome.status === 'rolled-back') resumeWrites();
        return outcome;
      }),
    listSnapshots: () => store.listSnapshots(),
    getJournal: () => store.getJournal(),
  };
};

export type RestoreEngine = ReturnType<typeof createRestoreEngine>;
