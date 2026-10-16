import { readFileSync } from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeStorage, quotaError } from '../testing/storage';
import { ExportContext, createExport, serializeExport } from './dataExport';
import {
  LAST_RESTORE_KEY,
  LOCK_KEY,
  analyzeBackup,
  createRestoreEngine,
  diffRestore,
  readDataKeys,
} from './dataRestore';
import { createMemorySafetyStore } from './safetyStore';
import { areWritesSuspended, resetGuardForTests } from './storageGuard';

const context = (): ExportContext => ({
  now: new Date('2026-10-15T20:00:00.000Z'),
  origin: 'https://example.test',
  href: 'https://example.test/#/manage',
  userAgent: 'test',
  appName: 'DeliOrderNYC',
  appVersion: '0.0.0',
});

/** The real 141-product catalog and the Arizona order, as exported by a browser in PR #1. */
const REAL = JSON.parse(readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8')).raw as Record<string, string>;
const realProducts = JSON.parse(REAL.inventory_products);

/** A different but valid device state ("what is on the phone now"). */
const deviceData = (): Record<string, string> => ({
  inventory_products: JSON.stringify(
    realProducts.slice(0, 120).map((p: { currentStockUnits: number; retailPrice: number }, i: number) =>
      i === 0 ? { ...p, currentStockUnits: 99, retailPrice: 9.99 } : p,
    ),
  ),
  inventory_suppliers: REAL.inventory_suppliers,
  inventory_currentOrder: JSON.stringify({ items: [{ productId: realProducts[5].id, quantity: 3 }], createdAt: '2026-10-14T10:00:00.000Z' }),
  inventory_deliName: 'Device Deli',
  inventory_futureFeature: '{"kept":"until replaced"}',
  theme: 'light',
  language: 'es',
});

const OTHER_APP = { other_app_auth: 'token-from-another-app', 'grocery:cart': '[1,2,3]' };

const setup = (data: Record<string, string> = deviceData(), withOtherApps = true) => {
  const s = makeStorage({ ...data, ...(withOtherApps ? OTHER_APP : {}) });
  const store = createMemorySafetyStore();
  const engine = createRestoreEngine({ storage: s.storage, store, exportContext: context, maxSnapshots: 3 });
  return { ...s, store, engine };
};

afterEach(() => {
  resetGuardForTests();
  vi.unstubAllGlobals();
});

describe('successful restore', () => {
  it('replaces deli data exactly, snapshots the previous data byte-for-byte, and leaves other apps alone', async () => {
    const { storage, store, engine, dump } = setup();
    const before = dump();
    const outcome = await engine.restore(REAL);
    expect(outcome.status).toBe('restored');

    // Deli data now equals the backup exactly (the extra future key that is not in the backup is removed)…
    expect(readDataKeys(storage)).toEqual(REAL);
    // …and the safety snapshot holds the previous deli data exactly.
    const snapshot = await store.getSnapshot((outcome as { snapshotId: string }).snapshotId);
    const snapshotRaw = JSON.parse(snapshot!.exportText).raw;
    const previousData = Object.fromEntries(Object.entries(before).filter(([k]) => !(k in OTHER_APP)));
    expect(snapshotRaw).toEqual(previousData);
    expect(JSON.parse(snapshot!.exportText).purpose).toBe('pre-restore');

    // Other apps' data was never touched or copied into the snapshot.
    expect(dump().other_app_auth).toBe(OTHER_APP.other_app_auth);
    expect(dump()['grocery:cart']).toBe(OTHER_APP['grocery:cart']);
    expect(snapshot!.exportText).not.toContain('token-from-another-app');

    // No journal or lock is left behind; the Undo marker is set.
    expect(store.journal).toBeUndefined();
    expect(dump()[LOCK_KEY]).toBeUndefined();
    expect(JSON.parse(dump()[LAST_RESTORE_KEY]).snapshotId).toBe(snapshot!.id);
    // Saving stays paused until the page reloads with the restored data.
    expect(areWritesSuspended()).toBe(true);
  });

  it('preserves every product id, wholesale price, retail price, units per case and stock value', async () => {
    const { storage, engine } = setup();
    await engine.restore(REAL);
    const restored = JSON.parse(readDataKeys(storage).inventory_products);
    expect(restored).toHaveLength(141);
    restored.forEach((p: Record<string, unknown>, i: number) => {
      const original = realProducts[i];
      for (const field of ['id', 'costPrice', 'retailPrice', 'unitsPerCase', 'currentStockUnits', 'reorderThresholdUnits', 'supplierId']) {
        expect(p[field]).toBe(original[field]);
      }
    });
    // The Arizona order still has its two lines at $38.99 a case: $77.98.
    const order = JSON.parse(readDataKeys(storage).inventory_currentOrder);
    const total = order.items.reduce((sum: number, item: { productId: string; quantity: number }) =>
      sum + restored.find((p: { id: string }) => p.id === item.productId).costPrice * item.quantity, 0);
    expect(total.toFixed(2)).toBe('77.98');
  });

  it('restore followed by Undo returns exactly to the previous data', async () => {
    const { storage, engine, dump } = setup();
    const before = dump();
    expect((await engine.restore(REAL)).status).toBe('restored');
    resetGuardForTests(); // the page reloads between the two in real use
    const undo = await engine.undoLastRestore();
    expect(undo.status).toBe('restored');
    const after = dump();
    delete after[LAST_RESTORE_KEY];
    expect(after).toEqual(before);
    expect(readDataKeys(storage)).toEqual(Object.fromEntries(Object.entries(before).filter(([k]) => !(k in OTHER_APP))));
  });

  it('restores onto empty storage (new device)', async () => {
    const { storage, engine } = setup({}, false);
    expect((await engine.restore(REAL)).status).toBe('restored');
    expect(readDataKeys(storage)).toEqual(REAL);
  });

  it('keeps at most 3 snapshots, always the newest', async () => {
    const { engine, store } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      resetGuardForTests();
      const target = { ...REAL, inventory_deliName: `Deli ${i}` };
      const outcome = await engine.restore(target);
      ids.push((outcome as { snapshotId: string }).snapshotId);
    }
    const kept = (await store.listSnapshots()).map(s => s.id);
    expect(kept).toHaveLength(3);
    expect(new Set(kept)).toEqual(new Set(ids.slice(-3)));
  });

  it('snapshots never contain earlier snapshots, journals or restore control keys', async () => {
    const { engine, store } = setup();
    await engine.restore(REAL);
    resetGuardForTests();
    await engine.restore({ ...REAL, inventory_deliName: 'Second' });
    for (const snapshot of await store.listSnapshots()) {
      const raw = JSON.parse(snapshot.exportText).raw;
      expect(Object.keys(raw).some(k => k.startsWith('deliordernyc_sys_'))).toBe(false);
      expect(snapshot.exportText).not.toContain('"exportText"');
      expect(snapshot.exportText).not.toContain('"snapshotId"');
    }
  });

  it('works with a large catalog of 600 products with Unicode names and decimal prices', async () => {
    const big = Array.from({ length: 600 }, (_, i) => ({
      ...realProducts[i % 141], id: `p${i}`, name: i % 2 ? 'أريزونا شاي' : 'Café niño', costPrice: 12.345 + i, retailPrice: 0.1 + 0.2, currentStockUnits: i % 7 === 0 ? 0 : i,
    }));
    const target = { ...REAL, inventory_products: JSON.stringify(big) };
    const { storage, engine } = setup();
    expect((await engine.restore(target)).status).toBe('restored');
    expect(readDataKeys(storage).inventory_products).toBe(target.inventory_products);
  });
});

describe('refusing to start (nothing changes)', () => {
  const expectUntouched = (before: Record<string, string>, after: Record<string, string>) => expect(after).toEqual(before);

  it('refuses an invalid target and changes nothing', async () => {
    const { engine, dump, store } = setup();
    const before = dump();
    const outcome = await engine.restore({ ...REAL, inventory_products: '[{"id":"broken"' });
    expect(outcome).toMatchObject({ status: 'refused', reason: 'invalid-target' });
    expectUntouched(before, dump());
    expect(store.snapshots.size).toBe(0);
  });

  it('refuses to write another app’s key, even if asked', async () => {
    const { engine, dump } = setup();
    const before = dump();
    const outcome = await engine.restore({ ...REAL, other_app_auth: 'overwrite!' });
    expect(outcome).toMatchObject({ status: 'refused', reason: 'invalid-target' });
    expectUntouched(before, dump());
  });

  it('full browser storage: refuses when there is not enough room for a safety snapshot', async () => {
    const s = makeStorage(deviceData());
    const store = createMemorySafetyStore();
    const engine = createRestoreEngine({
      storage: s.storage, store, exportContext: context, estimate: async () => ({ quota: 10_000_000, usage: 9_900_000 }),
    });
    const before = s.dump();
    expect(await engine.restore(REAL)).toMatchObject({ status: 'refused', reason: 'insufficient-space' });
    expectUntouched(before, s.dump());
    expect(areWritesSuspended()).toBe(false);
  });

  it('full browser storage: refuses when even the lock cannot be written', async () => {
    const { engine, faults, dump, store } = setup();
    const before = dump();
    faults.failAllWrites = true;
    expect(await engine.restore(REAL)).toMatchObject({ status: 'refused', reason: 'lock-failed' });
    expectUntouched(before, dump());
    expect(store.snapshots.size).toBe(0);
  });

  it('failed snapshot creation: refuses, changes nothing, and never deletes existing snapshots to make room', async () => {
    const { engine, store, dump } = setup();
    await engine.restore({ ...REAL, inventory_deliName: 'one' });
    resetGuardForTests();
    const existing = await store.listSnapshots();
    const before = dump();
    store.putSnapshot = async () => {
      throw quotaError();
    };
    expect(await engine.restore(REAL)).toMatchObject({ status: 'refused', reason: 'snapshot-failed' });
    expectUntouched(before, dump());
    expect(await store.listSnapshots()).toEqual(existing);
    expect(dump()[LOCK_KEY]).toBeUndefined();
    expect(areWritesSuspended()).toBe(false);
  });

  it('snapshot that does not read back intact: refuses and changes nothing', async () => {
    const { engine, store, dump } = setup();
    const before = dump();
    const realGet = store.getSnapshot;
    store.getSnapshot = async id => {
      const record = await realGet(id);
      return record && { ...record, exportText: record.exportText.slice(0, 100) };
    };
    expect(await engine.restore(REAL)).toMatchObject({ status: 'refused', reason: 'snapshot-unverified' });
    expectUntouched(before, dump());
  });

  it('no Web Crypto: refuses, because the safety snapshot cannot be verified', async () => {
    const { engine, dump } = setup();
    const before = dump();
    vi.stubGlobal('crypto', undefined);
    expect(await engine.restore(REAL)).toMatchObject({ status: 'refused', reason: 'no-crypto' });
    expectUntouched(before, dump());
  });

  it('journal that cannot be saved: refuses and changes nothing', async () => {
    const { engine, store, dump } = setup();
    const before = dump();
    store.putJournal = async () => {
      throw quotaError();
    };
    expect(await engine.restore(REAL)).toMatchObject({ status: 'refused', reason: 'journal-failed' });
    expectUntouched(before, dump());
  });
});

describe('failures during the restore', () => {
  /** Runs `onRollback` the moment the engine records that it is rolling back. */
  const whenRollingBack = (store: ReturnType<typeof createMemorySafetyStore>, onRollback: () => void) => {
    const putJournal = store.putJournal;
    store.putJournal = async record => {
      if (record.phase === 'rolling-back') onRollback();
      return putJournal(record);
    };
  };

  it('full storage part-way through writing: rolls back to exactly the previous data', async () => {
    const { engine, faults, dump, store } = setup();
    const before = dump();
    // The lock and the first deli key are written, then storage is "full" for the backup…
    faults.failSetAfter = 2;
    // …and space frees up for the rollback (e.g. the partial writes are being replaced).
    whenRollingBack(store, () => (faults.failSetAfter = undefined));
    const outcome = await engine.restore(REAL);
    expect(outcome.status).toBe('rolled-back');
    expect(dump()).toEqual(before);
    expect(store.journal).toBeUndefined();
    expect(areWritesSuspended()).toBe(false);
  });

  it('write that does not read back: rolls back to exactly the previous data', async () => {
    const { engine, faults, dump, store } = setup();
    const before = dump();
    faults.corruptKey = 'inventory_products'; // the stored products come back cut in half
    whenRollingBack(store, () => (faults.corruptKey = undefined));
    const outcome = await engine.restore(REAL);
    expect(outcome).toMatchObject({ status: 'rolled-back', message: 'The restored data did not read back identically.' });
    expect(dump()).toEqual(before);
    expect(store.journal).toBeUndefined();
    expect(areWritesSuspended()).toBe(false);
  });

  it('failed rollback: keeps the journal, snapshot and lock, pauses saving, and blocks further restores', async () => {
    const { engine, faults, store, dump } = setup();
    faults.failSetAfter = 2; // fails during the restore AND keeps failing during rollback
    const outcome = await engine.restore(REAL);
    expect(outcome.status).toBe('rollback-failed');
    expect(store.journal?.phase).toBe('rollback-failed');
    expect(store.journal?.error).toBeTruthy();
    expect(store.snapshots.has(store.journal!.snapshotId)).toBe(true);
    expect(dump()[LOCK_KEY]).toBeDefined();
    expect(areWritesSuspended()).toBe(true);

    // Any further destructive operation is refused while this is unresolved.
    expect(await engine.restore(REAL)).toMatchObject({ status: 'refused', reason: 'unresolved-restore' });
    expect(await engine.undoLastRestore()).toMatchObject({ status: 'refused' });
  });

  it('failed rollback can be retried once storage has room again, returning exactly to the previous data', async () => {
    const { engine, faults, store, dump } = setup();
    const before = dump();
    faults.failSetAfter = 2;
    expect((await engine.restore(REAL)).status).toBe('rollback-failed');
    faults.failSetAfter = undefined;
    expect((await engine.retryRollback()).status).toBe('rolled-back');
    expect(dump()).toEqual(before);
    expect(store.journal).toBeUndefined();
  });

  it('missing snapshot during rollback: reports failure and keeps the journal', async () => {
    const { engine, faults, store } = setup();
    faults.failSetAfter = 2;
    // The snapshot reads back fine when it is verified, then disappears before the rollback needs it.
    const getSnapshot = store.getSnapshot;
    store.getSnapshot = async id => (store.journal ? undefined : getSnapshot(id));
    const outcome = await engine.restore(REAL);
    expect(outcome.status).toBe('rollback-failed');
    expect(store.journal).toBeDefined();
  });
});

describe('interrupted restore (browser closed or crashed)', () => {
  /** Runs a restore that "crashes" (stops dead, no rollback) just before writing `crashAtKey`. */
  const crashDuringRestore = async (crashAtKey: string) => {
    const s = setup();
    const before = s.dump();
    class Crash extends Error {}
    // A real crash stops everything. The engine would catch the error and roll back, so record
    // the exact storage at the moment of the crash and make every later step fail, as if dead.
    const crashState: { dump?: Record<string, string> } = {};
    s.faults.beforeWrite = key => {
      if (key === crashAtKey && !crashState.dump) {
        crashState.dump = s.dump();
        throw new Crash('power cut');
      }
    };
    const journalAtCrash: { value?: unknown } = {};
    const putJournal = s.store.putJournal;
    s.store.putJournal = async record => {
      if (crashState.dump) throw new Error('process is dead'); // nothing after the crash happens
      journalAtCrash.value = record;
      return putJournal(record);
    };
    const clearJournal = s.store.clearJournal;
    s.store.clearJournal = async () => {
      if (crashState.dump) throw new Error('process is dead');
      return clearJournal();
    };
    await s.engine.restore(REAL).catch(() => undefined);
    return { ...s, before, crashState, journalAtCrash, putJournal, clearJournal };
  };

  it('crash in the middle of writing: next start puts the previous data back exactly', async () => {
    const s = await crashDuringRestore('inventory_currentOrder');
    // "Restart": a fresh tab with the storage exactly as the crash left it.
    resetGuardForTests();
    const restarted = makeStorage(s.crashState.dump!);
    s.store.putJournal = s.putJournal;
    s.store.clearJournal = s.clearJournal;
    expect(s.store.journal?.phase).toBe('applying');
    const engine = createRestoreEngine({ storage: restarted.storage, store: s.store, exportContext: context });
    const recovered = await engine.recover();
    expect(recovered.status).toBe('rolled-back');
    expect(restarted.dump()).toEqual(s.before);
    expect(s.store.journal).toBeUndefined();
  });

  it('crash after every key was written but before the journal was cleared: next start completes the restore', async () => {
    const s = setup();
    // Simulate: snapshot + journal written, target fully applied, then crash before clearJournal.
    const snapshotText = serializeExport({ ...(await createExport(s.storage, context())), purpose: 'pre-restore' });
    const exported = JSON.parse(snapshotText);
    await s.store.putSnapshot({ id: 'snap1', createdAt: '2026-10-15T20:00:00.000Z', purpose: 'pre-restore', exportText: snapshotText, rawChecksum: exported.rawChecksum, byteLength: snapshotText.length });
    await s.store.putJournal({ id: 'active', restoreId: 'r1', phase: 'applying', snapshotId: 'snap1', target: REAL, purpose: 'pre-restore', startedAt: 'x', updatedAt: 'x' });
    const otherKeys = Object.keys(s.dump()).filter(k => !(k in OTHER_APP) && !(k in REAL));
    for (const [k, v] of Object.entries(REAL)) s.storage.setItem(k, v);
    for (const k of otherKeys) s.storage.removeItem(k);
    s.storage.setItem(LOCK_KEY, '{}');

    const outcome = await s.engine.recover();
    expect(outcome.status).toBe('completed');
    expect(readDataKeys(s.storage)).toEqual(REAL);
    expect(s.store.journal).toBeUndefined();
    expect(s.dump()[LOCK_KEY]).toBeUndefined();
  });

  it('crash during a rollback: next start finishes the rollback', async () => {
    const s = setup();
    const before = s.dump();
    const snapshotText = serializeExport({ ...(await createExport(s.storage, context())), purpose: 'pre-restore' });
    const parsed = JSON.parse(snapshotText);
    await s.store.putSnapshot({ id: 'snap1', createdAt: 'x', purpose: 'pre-restore', exportText: snapshotText, rawChecksum: parsed.rawChecksum, byteLength: 1 });
    await s.store.putJournal({ id: 'active', restoreId: 'r1', phase: 'rolling-back', snapshotId: 'snap1', target: REAL, purpose: 'pre-restore', startedAt: 'x', updatedAt: 'x', error: 'quota' });
    // Half of the backup had been written, and half of the rollback.
    s.storage.setItem('inventory_products', REAL.inventory_products);
    s.storage.setItem('inventory_deliName', 'half-way');
    expect((await s.engine.recover()).status).toBe('rolled-back');
    expect(s.dump()).toEqual(before);
  });

  it('nothing to recover: removes a stale lock and changes nothing else', async () => {
    const { engine, storage, dump } = setup();
    storage.setItem(LOCK_KEY, '{}');
    const before = { ...dump() };
    delete before[LOCK_KEY];
    expect((await engine.recover()).status).toBe('none');
    expect(dump()).toEqual(before);
  });
});

describe('multiple open tabs', () => {
  it('only one restore runs at a time: the second waits for the first, then sees the result', async () => {
    const { storage, store } = setup();
    // A shared lock, like Web Locks across tabs.
    let chain = Promise.resolve();
    const withLock = <T,>(work: () => Promise<T>) => {
      const run = chain.then(work);
      chain = run.then(() => undefined, () => undefined);
      return run;
    };
    const tabA = createRestoreEngine({ storage, store, exportContext: context, withLock });
    const tabB = createRestoreEngine({ storage, store, exportContext: context, withLock });
    const targetB = { ...REAL, inventory_deliName: 'Tab B' };
    const [a, b] = await Promise.all([tabA.restore(REAL), tabB.restore(targetB)]);
    expect(a.status).toBe('restored');
    expect(b.status).toBe('restored');
    expect(readDataKeys(storage)).toEqual(targetB);
    // Tab B's snapshot is exactly tab A's result: nothing was interleaved.
    const snapB = await store.getSnapshot((b as { snapshotId: string }).snapshotId);
    expect(JSON.parse(snapB!.exportText).raw).toEqual(REAL);
  });

  it('the lock key other tabs listen for is set during the restore and removed afterwards', async () => {
    const { storage, engine, faults } = setup();
    const seen: (string | null)[] = [];
    faults.beforeWrite = key => {
      if (key === 'inventory_products') seen.push(storage.getItem(LOCK_KEY));
    };
    await engine.restore(REAL);
    expect(seen[0]).not.toBeNull();
    expect(storage.getItem(LOCK_KEY)).toBeNull();
  });
});

describe('analyzeBackup and diffRestore', () => {
  it('lists removals by name so nothing disappears unannounced', async () => {
    const diff = diffRestore(deviceData(), REAL);
    expect(diff.products.before).toBe(120);
    expect(diff.products.after).toBe(141);
    expect(diff.products.added).toHaveLength(21);
    expect(diff.products.changed).toEqual([
      expect.objectContaining({ id: realProducts[0].id, fields: ['currentStockUnits', 'retailPrice'] }),
    ]);
    expect(diff.orderLines).toEqual({ before: 1, after: 2 });
    // The fixture's theme is "light", like the device: unchanged settings are not listed.
    expect(diff.settings.map(c => c.key)).toEqual(['inventory_deliName', 'language']);
    expect(diff.otherDataKeys).toEqual([{ key: 'inventory_futureFeature', before: '{"kept":"until replaced"}', after: null }]);

    const reverse = diffRestore(REAL, deviceData());
    expect(reverse.products.removed).toHaveLength(21);
    expect(reverse.products.removed[0].name).toBeTruthy();
  });

  it('reports unreadable current data instead of guessing', () => {
    const diff = diffRestore({ inventory_products: '[broken' }, REAL);
    expect(diff.products.before).toBeNull();
  });

  it('an invalid backup cannot be restored', async () => {
    const analysis = await analyzeBackup('{"format":"something-else"}');
    expect(analysis.canRestore).toBe(false);
  });

  it('a backup whose deli data is corrupted cannot be restored even with a matching checksum', async () => {
    const s = makeStorage({ ...REAL, inventory_suppliers: '[{"id":"x"}]' });
    const text = serializeExport(await createExport(s.storage, context()));
    const analysis = await analyzeBackup(text);
    expect(analysis.verification.status).toBe('verified');
    expect(analysis.canRestore).toBe(false);
    expect(analysis.problems.join(' ')).toMatch(/inventory_suppliers/);
  });

  it('a backup with no deli data cannot be restored', async () => {
    const s = makeStorage({ other: '1' });
    const text = serializeExport(await createExport(s.storage, context(), { includeOtherKeys: ['other'] }));
    expect((await analyzeBackup(text)).canRestore).toBe(false);
  });

  it('never restores system keys or other apps’ keys found inside a backup', async () => {
    const exported = await createExport(makeStorage(REAL).storage, context());
    const tampered = { ...exported, raw: { ...exported.raw, other_app_auth: 'x', deliordernyc_sys_restore_lock: '{}' }, rawChecksum: null };
    const analysis = await analyzeBackup(JSON.stringify(tampered));
    expect(Object.keys(analysis.target).sort()).toEqual(Object.keys(REAL).sort());
    expect(analysis.skipped).toEqual([
      { key: 'deliordernyc_sys_restore_lock', reason: 'system' },
      { key: 'other_app_auth', reason: 'other-app' },
    ]);
  });
});

describe('stale preview: data changed after the comparison was reviewed', () => {
  /** What another tab saves after the preview: a price, a stock count, or the order. */
  const otherTabEdits: [string, (data: Record<string, string>) => Record<string, string>][] = [
    ['a product price', data => {
      const products = JSON.parse(data.inventory_products);
      products[0] = { ...products[0], costPrice: 41.5 };
      return { ...data, inventory_products: JSON.stringify(products) };
    }],
    ['a stock quantity', data => {
      const products = JSON.parse(data.inventory_products);
      products[3] = { ...products[3], currentStockUnits: 4 };
      return { ...data, inventory_products: JSON.stringify(products) };
    }],
    ['the order', data => ({
      ...data,
      inventory_currentOrder: JSON.stringify({ items: [{ productId: realProducts[7].id, quantity: 2 }], createdAt: '2026-10-15T21:00:00.000Z' }),
    })],
  ];

  const applyEdit = (storage: Storage, edited: Record<string, string>) => {
    for (const [key, value] of Object.entries(edited)) if (storage.getItem(key) !== value) storage.setItem(key, value);
  };

  it.each(otherTabEdits)('another tab changes %s before confirmation: refused, nothing changed', async (_label, edit) => {
    const { storage, engine, dump, store } = setup();
    const reviewed = readDataKeys(storage); // the preview
    applyEdit(storage, edit(reviewed)); // another tab saves
    const afterEdit = dump();
    const outcome = await engine.restore(REAL, 'pre-restore', { expectedCurrent: reviewed });
    expect(outcome).toMatchObject({ status: 'refused', reason: 'data-changed' });
    expect(dump()).toEqual(afterEdit); // the other tab's change is kept, nothing else changed
    expect(store.journal).toBeUndefined();
    expect(store.snapshots.size).toBe(0);
    expect(areWritesSuspended()).toBe(false);
  });

  it.each(otherTabEdits)('another tab changes %s after the snapshot, just before the first write: refused, nothing lost', async (_label, edit) => {
    const { storage, engine, dump, store } = setup();
    // Earlier snapshots must survive this refusal.
    await engine.restore({ ...REAL, inventory_deliName: 'earlier' });
    resetGuardForTests();
    const reviewedAfterEarlier = readDataKeys(storage);
    const earlier = await store.listSnapshots();
    // The other tab saves at the worst moment: after the snapshot and journal were saved.
    const putJournal = store.putJournal;
    store.putJournal = async record => {
      await putJournal(record);
      applyEdit(storage, edit(readDataKeys(storage)));
    };
    const outcome = await engine.restore(REAL, 'pre-restore', { expectedCurrent: reviewedAfterEarlier });
    store.putJournal = putJournal;
    expect(outcome).toMatchObject({ status: 'refused', reason: 'data-changed' });
    // The other tab's save is still there; the restore wrote nothing.
    expect(readDataKeys(storage)).toEqual(edit(reviewedAfterEarlier));
    expect(dump()[LOCK_KEY]).toBeUndefined();
    expect(store.journal).toBeUndefined();
    // Only the unused new snapshot was removed: the earlier recovery snapshot is untouched.
    expect(await store.listSnapshots()).toEqual(earlier);
    expect(areWritesSuspended()).toBe(false);
  });

  it('the same check protects Undo and Start Fresh (no preview): a save after the snapshot is never lost', async () => {
    const { storage, engine, store } = setup();
    const putJournal = store.putJournal;
    store.putJournal = async record => {
      await putJournal(record);
      storage.setItem('inventory_deliName', 'Saved by another tab mid-restore');
    };
    expect(await engine.restore(REAL)).toMatchObject({ status: 'refused', reason: 'data-changed' });
    expect(storage.getItem('inventory_deliName')).toBe('Saved by another tab mid-restore');
  });

  it('if the journal cannot be cleared after refusing, the snapshot is kept so the next start can resolve it', async () => {
    const { storage, engine, store } = setup();
    const reviewed = readDataKeys(storage);
    const putJournal = store.putJournal;
    store.putJournal = async record => {
      await putJournal(record);
      storage.setItem('inventory_deliName', 'changed');
    };
    store.clearJournal = async () => {
      throw new Error('IndexedDB unavailable');
    };
    expect(await engine.restore(REAL, 'pre-restore', { expectedCurrent: reviewed })).toMatchObject({ reason: 'data-changed' });
    expect(store.journal).toBeDefined();
    expect(store.snapshots.has(store.journal!.snapshotId)).toBe(true);
  });

  it('changes to other apps’ data after the preview do not block the restore', async () => {
    const { storage, engine, dump } = setup();
    const reviewed = readDataKeys(storage);
    storage.setItem('other_app_auth', 'rotated by the other app');
    storage.setItem('brand_new_other_app_key', '1');
    const outcome = await engine.restore(REAL, 'pre-restore', { expectedCurrent: reviewed });
    expect(outcome.status).toBe('restored');
    expect(readDataKeys(storage)).toEqual(REAL);
    expect(dump().other_app_auth).toBe('rotated by the other app');
  });

  it('an unchanged preview restores normally, and Undo still returns exactly to the reviewed data', async () => {
    const { storage, engine } = setup();
    const reviewed = readDataKeys(storage);
    expect((await engine.restore(REAL, 'pre-restore', { expectedCurrent: reviewed })).status).toBe('restored');
    expect(readDataKeys(storage)).toEqual(REAL);
    resetGuardForTests();
    expect((await engine.undoLastRestore()).status).toBe('restored');
    expect(readDataKeys(storage)).toEqual(reviewed);
  });
});

describe('C1 verified stock counts in backups', () => {
  const COUNTS = JSON.stringify({
    schemaVersion: 1,
    products: {
      [realProducts[100].id]: { counts: [{ units: 18, countedAt: '2026-10-15T09:00:00.000Z', source: 'classic', unitsPerCaseAtCount: 24 }] },
      [realProducts[101].id]: { counts: [{ units: 0, countedAt: '2026-10-15T09:01:00.000Z', source: 'classic', unitsPerCaseAtCount: 24 }] },
    },
  });
  const withCounts = () => ({ ...REAL, inventory_stockCounts: COUNTS });

  it('a pre-C1 backup reports exactly how many counted products would lose their counts', () => {
    const diff = diffRestore(withCounts(), REAL);
    expect(diff.stockCounts).toEqual({ before: 2, after: 0, lost: 2, changed: true });
    // The counts are not dumped as raw text among other keys.
    expect(diff.otherDataKeys).toEqual([]);
  });

  it('a backup with the same counts loses nothing', () => {
    expect(diffRestore(withCounts(), withCounts()).stockCounts).toEqual({ before: 2, after: 2, lost: 0, changed: false });
  });

  it('a device without counts loses nothing from any backup', () => {
    expect(diffRestore(REAL, REAL).stockCounts.lost).toBe(0);
    expect(diffRestore(REAL, withCounts()).stockCounts).toEqual({ before: 0, after: 2, lost: 0, changed: true });
  });

  it('export → restore keeps counts byte-for-byte, and the backup verifies', async () => {
    const source = setup(withCounts(), false);
    const exported = await createExport(source.storage, context());
    expect(exported.raw.inventory_stockCounts).toBe(COUNTS);
    expect(exported.data.stockCounts).toEqual(JSON.parse(COUNTS));
    expect(exported.summary.verifiedCountProductCount).toBe(2);
    const analysis = await analyzeBackup(serializeExport(exported));
    expect(analysis.verification.status).toBe('verified');
    expect(analysis.canRestore).toBe(true);

    const target = setup({}, false);
    expect((await target.engine.restore(analysis.target)).status).toBe('restored');
    expect(readDataKeys(target.storage).inventory_stockCounts).toBe(COUNTS);
  });

  it('restoring a pre-C1 backup removes the counts, and Undo brings them back exactly', async () => {
    const { storage, engine } = setup(withCounts(), false);
    expect((await engine.restore(REAL)).status).toBe('restored');
    expect(readDataKeys(storage).inventory_stockCounts).toBeUndefined();
    resetGuardForTests();
    expect((await engine.undoLastRestore()).status).toBe('restored');
    expect(readDataKeys(storage).inventory_stockCounts).toBe(COUNTS);
  });

  it('a backup with corrupted counts cannot be restored', async () => {
    const source = setup({ ...REAL, inventory_stockCounts: '{"schemaVersion":1,"products":{"x":{"counts":[{"units":-3}]}}}' }, false);
    const analysis = await analyzeBackup(serializeExport(await createExport(source.storage, context())));
    expect(analysis.canRestore).toBe(false);
  });

  it('crash in the middle of a restore: the next start puts the counts back exactly', async () => {
    const s = setup(withCounts(), false);
    const before = s.dump();
    class Crash extends Error {}
    let crashDump: Record<string, string> | undefined;
    s.faults.beforeWrite = key => {
      if (key === 'inventory_products' && !crashDump) {
        crashDump = s.dump();
        throw new Crash('power cut');
      }
    };
    const putJournal = s.store.putJournal;
    s.store.putJournal = async record => {
      if (crashDump) throw new Error('process is dead');
      return putJournal(record);
    };
    const clearJournal = s.store.clearJournal;
    s.store.clearJournal = async () => {
      if (crashDump) throw new Error('process is dead');
      return clearJournal();
    };
    await s.engine.restore(REAL).catch(() => undefined);
    resetGuardForTests();
    const restarted = makeStorage(crashDump!);
    s.store.putJournal = putJournal;
    s.store.clearJournal = clearJournal;
    const engine = createRestoreEngine({ storage: restarted.storage, store: s.store, exportContext: context });
    expect((await engine.recover()).status).toBe('rolled-back');
    expect(restarted.dump()).toEqual(before);
  });

  it('every real PR #1 backup still restores (none has counts, so nothing is lost on a new device)', async () => {
    const files = ['pr1-b291176-arizona-demo.json', 'pr1-c3d8d63-arizona-demo.json'];
    for (const file of files) {
      const analysis = await analyzeBackup(readFileSync(`fixtures/exports/${file}`, 'utf8'));
      expect(analysis.canRestore).toBe(true);
      const { engine, storage } = setup({}, false);
      expect((await engine.restore(analysis.target)).status).toBe('restored');
      expect(readDataKeys(storage)).toEqual(analysis.target);
    }
  });
});
