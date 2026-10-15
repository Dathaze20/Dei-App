// utils/safetyStore.ts
//
// Where recovery snapshots and the restore journal live.
//
// They are kept in IndexedDB, not localStorage, because:
//   - IndexedDB writes are transactional (a record is written completely or not at all),
//   - it has far more room than localStorage's ~5 MB, and
//   - keeping them out of localStorage means a snapshot of the app's data can never contain an
//     earlier snapshot or a journal (no recursion, no snowballing size).

export type SnapshotPurpose = 'pre-restore' | 'pre-undo' | 'pre-start-fresh';

export interface SnapshotRecord {
  id: string;
  createdAt: string;
  purpose: SnapshotPurpose;
  /** A complete Export My Data file (format deliordernyc-export, schema 1) of the data before the change. */
  exportText: string;
  rawChecksum: string;
  byteLength: number;
}

export type JournalPhase = 'applying' | 'rolling-back' | 'rollback-failed';

export interface JournalRecord {
  id: 'active';
  restoreId: string;
  phase: JournalPhase;
  /** The verified snapshot holding the data as it was before this restore. */
  snapshotId: string;
  /** Exactly what the data keys should contain when the restore is complete. */
  target: Record<string, string>;
  purpose: SnapshotPurpose;
  startedAt: string;
  updatedAt: string;
  error?: string;
}

export interface SafetyStore {
  putSnapshot(record: SnapshotRecord): Promise<void>;
  getSnapshot(id: string): Promise<SnapshotRecord | undefined>;
  /** Newest first. */
  listSnapshots(): Promise<SnapshotRecord[]>;
  deleteSnapshot(id: string): Promise<void>;
  putJournal(record: JournalRecord): Promise<void>;
  getJournal(): Promise<JournalRecord | undefined>;
  clearJournal(): Promise<void>;
}

const newestFirst = (a: SnapshotRecord, b: SnapshotRecord) =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

// --- IndexedDB -------------------------------------------------------------------------------

const DB_NAME = 'deliordernyc-safety';
const DB_VERSION = 1;
const SNAPSHOTS = 'snapshots';
const JOURNAL = 'journal';

const promisify = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const openDatabase = (factory: IDBFactory): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(JOURNAL)) db.createObjectStore(JOURNAL, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });

/** Runs one request in its own transaction and resolves only when the transaction has committed. */
const run = async <T>(
  dbPromise: Promise<IDBDatabase>,
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await dbPromise;
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let value: T;
    promisify(action(tx.objectStore(storeName))).then(v => {
      value = v;
    }, reject);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted (storage may be full)'));
  });
};

export const createIndexedDbSafetyStore = (factory: IDBFactory | undefined = globalThis.indexedDB): SafetyStore => {
  if (!factory) throw new Error('IndexedDB is not available in this browser.');
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDatabase(factory));
  return {
    putSnapshot: async record => {
      await run(db(), SNAPSHOTS, 'readwrite', store => store.put(record));
    },
    getSnapshot: id => run(db(), SNAPSHOTS, 'readonly', store => store.get(id) as IDBRequest<SnapshotRecord | undefined>),
    listSnapshots: async () =>
      (await run(db(), SNAPSHOTS, 'readonly', store => store.getAll() as IDBRequest<SnapshotRecord[]>)).sort(newestFirst),
    deleteSnapshot: async id => {
      await run(db(), SNAPSHOTS, 'readwrite', store => store.delete(id));
    },
    putJournal: async record => {
      await run(db(), JOURNAL, 'readwrite', store => store.put(record));
    },
    getJournal: () => run(db(), JOURNAL, 'readonly', store => store.get('active') as IDBRequest<JournalRecord | undefined>),
    clearJournal: async () => {
      await run(db(), JOURNAL, 'readwrite', store => store.delete('active'));
    },
  };
};

// --- In memory (tests) -----------------------------------------------------------------------

/** A SafetyStore held in memory. Records are deep-copied, like a real database would. */
export const createMemorySafetyStore = (): SafetyStore & {
  snapshots: Map<string, SnapshotRecord>;
  journal: JournalRecord | undefined;
} => {
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const self = {
    snapshots: new Map<string, SnapshotRecord>(),
    journal: undefined as JournalRecord | undefined,
    putSnapshot: async (record: SnapshotRecord) => {
      self.snapshots.set(record.id, copy(record));
    },
    getSnapshot: async (id: string) => {
      const record = self.snapshots.get(id);
      return record ? copy(record) : undefined;
    },
    listSnapshots: async () => Array.from(self.snapshots.values()).map(copy).sort(newestFirst),
    deleteSnapshot: async (id: string) => {
      self.snapshots.delete(id);
    },
    putJournal: async (record: JournalRecord) => {
      self.journal = copy(record);
    },
    getJournal: async () => (self.journal ? copy(self.journal) : undefined),
    clearJournal: async () => {
      self.journal = undefined;
    },
  };
  return self;
};
