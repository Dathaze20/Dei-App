// testing/storage.ts: an in-memory Web Storage with switchable faults, for tests only.

export interface Faults {
  /** Throw a quota error on every setItem once this many successful writes have happened. */
  failSetAfter?: number;
  /** Throw on every setItem / removeItem. */
  failAllWrites?: boolean;
  /** Store a damaged value for this key (simulates a write that does not read back). */
  corruptKey?: string;
  /** Called before every write; throw from it to simulate a crash at that exact point. */
  beforeWrite?: (key: string) => void;
}

export const quotaError = () => Object.assign(new Error('QuotaExceededError: the quota has been exceeded.'), { name: 'QuotaExceededError' });

export const makeStorage = (initial: Record<string, string> = {}) => {
  const store = new Map(Object.entries(initial));
  const faults: Faults = {};
  let writes = 0;
  const write = (key: string, action: () => void) => {
    faults.beforeWrite?.(key);
    if (faults.failAllWrites) throw quotaError();
    if (faults.failSetAfter !== undefined && writes >= faults.failSetAfter) throw quotaError();
    action();
    writes++;
  };
  const storage = {
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) =>
      write(k, () => store.set(k, faults.corruptKey === k ? v.slice(0, Math.floor(v.length / 2)) : String(v))),
    removeItem: (k: string) => write(k, () => store.delete(k)),
    clear: () => store.clear(),
  };
  return {
    storage,
    store,
    faults,
    /** A plain copy of everything stored, for exact comparisons. */
    dump: () => Object.fromEntries(Array.from(store.entries()).sort(([a], [b]) => a.localeCompare(b))),
  };
};
