import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { makeStorage } from '../testing/storage';
import { createRestoreEngine, readDataKeys } from './dataRestore';
import { SnapshotRecord, createIndexedDbSafetyStore } from './safetyStore';
import { resetGuardForTests } from './storageGuard';

const snapshot = (id: string, createdAt: string): SnapshotRecord => ({
  id, createdAt, purpose: 'pre-restore', exportText: `{"id":"${id}"}`, rawChecksum: 'a'.repeat(64), byteLength: 10,
});

describe('IndexedDB safety store', () => {
  it('stores, lists newest first, and deletes snapshots', async () => {
    const store = createIndexedDbSafetyStore(new IDBFactory());
    await store.putSnapshot(snapshot('old', '2026-10-01T00:00:00.000Z'));
    await store.putSnapshot(snapshot('new', '2026-10-15T00:00:00.000Z'));
    expect((await store.listSnapshots()).map(s => s.id)).toEqual(['new', 'old']);
    expect(await store.getSnapshot('old')).toEqual(snapshot('old', '2026-10-01T00:00:00.000Z'));
    await store.deleteSnapshot('old');
    expect((await store.listSnapshots()).map(s => s.id)).toEqual(['new']);
  });

  it('stores and clears the journal', async () => {
    const store = createIndexedDbSafetyStore(new IDBFactory());
    expect(await store.getJournal()).toBeUndefined();
    const journal = { id: 'active' as const, restoreId: 'r', phase: 'applying' as const, snapshotId: 's', target: { a: '1' }, purpose: 'pre-restore' as const, startedAt: 'x', updatedAt: 'x' };
    await store.putJournal(journal);
    expect(await store.getJournal()).toEqual(journal);
    await store.clearJournal();
    expect(await store.getJournal()).toBeUndefined();
  });

  it('keeps data across "page reloads" (a new connection to the same database)', async () => {
    const factory = new IDBFactory();
    await createIndexedDbSafetyStore(factory).putSnapshot(snapshot('kept', '2026-10-15T00:00:00.000Z'));
    expect((await createIndexedDbSafetyStore(factory).getSnapshot('kept'))?.id).toBe('kept');
  });

  it('runs a full restore and Undo end to end on IndexedDB', async () => {
    const REAL = JSON.parse(readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8')).raw;
    const factory = new IDBFactory();
    const device = makeStorage({ inventory_deliName: 'Device', inventory_products: '[]', inventory_suppliers: '[]' });
    const before = device.dump();
    const context = () => ({ now: new Date(), origin: 'o', href: 'h', userAgent: 'u', appName: 'DeliOrderNYC', appVersion: '0' });
    const engine = createRestoreEngine({ storage: device.storage, store: createIndexedDbSafetyStore(factory), exportContext: context });
    expect((await engine.restore(REAL)).status).toBe('restored');
    expect(readDataKeys(device.storage)).toEqual(REAL);
    resetGuardForTests();
    // After a "reload", a new engine on the same database can undo it.
    const reloaded = createRestoreEngine({ storage: device.storage, store: createIndexedDbSafetyStore(factory), exportContext: context });
    expect((await reloaded.undoLastRestore()).status).toBe('restored');
    const after = device.dump();
    delete after.deliordernyc_sys_last_restore;
    expect(after).toEqual(before);
  });

  it('reports that IndexedDB is unavailable instead of pretending', () => {
    expect(() => createIndexedDbSafetyStore(undefined as unknown as IDBFactory)).toThrow(/not available/);
  });
});
