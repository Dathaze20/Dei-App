import { describe, expect, it, vi } from 'vitest';
import {
  EXPORT_FORMAT,
  EXPORT_SCHEMA_VERSION,
  ExportContext,
  ReadableStorage,
  buildExport,
  computeRawChecksum,
  createExport,
  exportFileName,
  readAllStorage,
  serializeExport,
  verifyExportText,
} from './dataExport';

/** In-memory Storage that records every write attempt so tests can prove export is read-only. */
const makeStorage = (initial: Record<string, string>) => {
  const store = new Map(Object.entries(initial));
  const writes: string[] = [];
  const storage: ReadableStorage & Storage = {
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      writes.push(`set:${k}`);
      store.set(k, v);
    },
    removeItem: (k: string) => {
      writes.push(`remove:${k}`);
      store.delete(k);
    },
    clear: () => {
      writes.push('clear');
      store.clear();
    },
  };
  return { storage, writes, store };
};

const context: ExportContext = {
  now: new Date('2026-10-15T20:52:07.000Z'),
  origin: 'https://example.test',
  href: 'https://example.test/#/manage',
  userAgent: 'test-agent',
  appName: 'DeliOrderNYC',
  appVersion: '0.0.0',
};

const products = [
  { id: 'az_rx_fp', name: 'Arizona RX Energy', flavor: 'Caution Extreme Fruit Punch', supplierId: 'sup6', unitsPerCase: 12, costPrice: 38.99, currentStockUnits: 7, reorderThresholdUnits: 3 },
  { id: 'az_rx_perf', name: 'Arizona RX Energy', flavor: 'Caution Extreme Performance', supplierId: 'sup6', unitsPerCase: 12, costPrice: 38.99, currentStockUnits: 0, reorderThresholdUnits: 3 },
];
const suppliers = [{ id: 'sup6', name: 'Arizona', color: 'bg-teal-400' }];
const currentOrder = {
  items: [
    { productId: 'az_rx_fp', quantity: 1 },
    { productId: 'az_rx_perf', quantity: 1 },
  ],
  createdAt: '2026-10-15T20:00:00.000Z',
};

const appStorage = () =>
  makeStorage({
    inventory_products: JSON.stringify(products),
    inventory_suppliers: JSON.stringify(suppliers),
    inventory_currentOrder: JSON.stringify(currentOrder),
    inventory_deliName: "Joe's Deli",
    theme: 'dark',
    language: 'ar',
  });

describe('buildExport', () => {
  it('stamps format, schema version, timestamp and source', () => {
    const result = buildExport(appStorage().storage, context);
    expect(result.format).toBe(EXPORT_FORMAT);
    expect(result.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(result.exportedAt).toBe('2026-10-15T20:52:07.000Z');
    expect(result.source).toEqual({ origin: 'https://example.test', href: 'https://example.test/#/manage', userAgent: 'test-agent' });
    expect(result.app).toEqual({ name: 'DeliOrderNYC', version: '0.0.0' });
  });

  it('includes products, suppliers, stock, order draft, deli name and settings', () => {
    const { data } = buildExport(appStorage().storage, context);
    expect(data.products).toEqual(products);
    expect(data.suppliers).toEqual(suppliers);
    expect(data.currentOrder).toEqual(currentOrder);
    expect(data.deliName).toBe("Joe's Deli");
    expect(data.theme).toBe('dark');
    expect(data.language).toBe('ar');
    // Stock values are carried through exactly, not recalculated or reset.
    expect((data.products as typeof products).map(p => p.currentStockUnits)).toEqual([7, 0]);
  });

  it('copies every storage key verbatim, including keys the app does not know about', () => {
    const { storage } = appStorage();
    storage.setItem('some_future_key', '{"anything":true}');
    const { raw } = buildExport(storage, context);
    expect(raw.inventory_products).toBe(JSON.stringify(products));
    expect(raw.inventory_deliName).toBe("Joe's Deli");
    expect(raw.some_future_key).toBe('{"anything":true}');
    expect(Object.keys(raw)).toHaveLength(7);
  });

  it('never writes to, removes from or clears storage', () => {
    const { storage, writes, store } = appStorage();
    const before = new Map(store);
    buildExport(storage, context);
    expect(writes).toEqual([]);
    expect(store).toEqual(before);
  });

  it('summarizes counts, including cases in the order draft', () => {
    const { summary } = buildExport(appStorage().storage, context);
    expect(summary).toEqual({ storageKeyCount: 6, productCount: 2, supplierCount: 1, orderLineCount: 2, orderCaseCount: 2 });
  });

  it('marks stock and prices as unverified', () => {
    const { notes } = buildExport(appStorage().storage, context);
    expect(notes.stockValuesVerified).toBe(false);
    expect(notes.pricesVerified).toBe(false);
  });

  it('keeps the exact text of a corrupted value and reports it instead of dropping it', () => {
    const { storage } = makeStorage({ inventory_products: '[{"id":"broken"', inventory_deliName: 'Deli' });
    const result = buildExport(storage, context);
    expect(result.data.products).toBeNull();
    expect(result.raw.inventory_products).toBe('[{"id":"broken"');
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0].key).toBe('inventory_products');
    expect(result.summary.productCount).toBeNull();
  });

  it('handles empty storage (app never opened on this origin)', () => {
    const result = buildExport(makeStorage({}).storage, context);
    expect(result.raw).toEqual({});
    expect(result.data.products).toBeNull();
    expect(result.data.deliName).toBeNull();
    expect(result.summary.storageKeyCount).toBe(0);
    expect(result.parseErrors).toEqual([]);
  });
});

describe('checksum and verification', () => {
  it('produces a stable SHA-256 checksum independent of key order', async () => {
    const a = await computeRawChecksum({ b: '2', a: '1' });
    const b = await computeRawChecksum({ a: '1', b: '2' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(await computeRawChecksum({ a: '1', b: '3' })).not.toBe(a);
  });

  it('round-trips: a serialized export verifies against the storage it came from', async () => {
    const { storage } = appStorage();
    const text = serializeExport(await createExport(storage, context));
    const result = await verifyExportText(text, storage);
    expect(result).toEqual({ ok: true, problems: [] });
    expect(JSON.parse(text).raw).toEqual(readAllStorage(storage));
  });

  it('detects a truncated file', async () => {
    const text = serializeExport(await createExport(appStorage().storage, context));
    const result = await verifyExportText(text.slice(0, text.length / 2));
    expect(result.ok).toBe(false);
  });

  it('detects tampered data via the checksum', async () => {
    const exported = await createExport(appStorage().storage, context);
    exported.raw.inventory_deliName = 'Someone Else';
    const result = await verifyExportText(serializeExport(exported));
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/Checksum/);
  });

  it('detects that storage changed after the export was taken', async () => {
    const { storage } = appStorage();
    const text = serializeExport(await createExport(storage, context));
    storage.setItem('inventory_deliName', 'Renamed');
    const result = await verifyExportText(text, storage);
    expect(result.ok).toBe(false);
  });

  it('rejects files that are not exports', async () => {
    expect((await verifyExportText('{"hello":1}')).ok).toBe(false);
    expect((await verifyExportText('null')).ok).toBe(false);
  });

  it('still exports when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const exported = await createExport(appStorage().storage, context);
      expect(exported.rawChecksum).toBeNull();
      expect((await verifyExportText(serializeExport(exported))).ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('exportFileName', () => {
  it('uses local date and time with zero padding', () => {
    expect(exportFileName(new Date(2026, 0, 5, 7, 3, 9))).toBe('deliordernyc-backup-2026-01-05-070309.json');
  });
});
