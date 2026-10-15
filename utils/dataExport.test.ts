import { describe, expect, it, vi } from 'vitest';
import {
  EXPORT_FORMAT,
  EXPORT_SCHEMA_VERSION,
  ExportContext,
  ReadableStorage,
  buildExport,
  classifyStorage,
  computeRawChecksum,
  createExport,
  exportFileName,
  isAppOwnedKey,
  readStorageKeys,
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

const appData = {
  inventory_products: JSON.stringify(products),
  inventory_suppliers: JSON.stringify(suppliers),
  inventory_currentOrder: JSON.stringify(currentOrder),
  inventory_deliName: "Joe's Deli",
  theme: 'dark',
  language: 'ar',
};

const appStorage = () => makeStorage({ ...appData });

/** The same origin shared with another app (e.g. two projects on one github.io domain). */
const SECRET = 'other-app-session-token-do-not-export';
const sharedOriginStorage = () =>
  makeStorage({ ...appData, other_app_auth: SECRET, 'grocery:settings': '{"x":1}' });

const exportText = async (storage: ReadableStorage) => serializeExport(await createExport(storage, context));

describe('buildExport', () => {
  it('stamps format, schema version, timestamp and source', () => {
    const result = buildExport(appStorage().storage, context);
    expect(result.format).toBe(EXPORT_FORMAT);
    expect(result.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(result.exportedAt).toBe('2026-10-15T20:52:07.000Z');
    expect(result.source).toEqual({ origin: 'https://example.test', href: 'https://example.test/#/manage', userAgent: 'test-agent' });
    expect(result.app).toEqual({ name: 'DeliOrderNYC', version: '0.0.0' });
    expect(result.rawChecksumAlgorithm).toBe('SHA-256');
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

  it('copies every app-owned key verbatim', () => {
    const { raw } = buildExport(appStorage().storage, context);
    expect(raw).toEqual(appData);
  });

  it('never writes to, removes from or clears storage', () => {
    const { storage, writes, store } = sharedOriginStorage();
    const before = new Map(store);
    buildExport(storage, context);
    buildExport(storage, context, { includeOtherKeys: ['other_app_auth'] });
    classifyStorage(storage);
    expect(writes).toEqual([]);
    expect(store).toEqual(before);
  });

  it('summarizes counts, including cases in the order draft', () => {
    const { summary } = buildExport(appStorage().storage, context);
    expect(summary).toEqual({ includedKeyCount: 6, excludedKeyCount: 0, productCount: 2, supplierCount: 1, orderLineCount: 2, orderCaseCount: 2 });
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
    expect(result.summary.includedKeyCount).toBe(0);
    expect(result.parseErrors).toEqual([]);
  });
});

describe('privacy: keys from other apps on the same web address', () => {
  it('recognizes the app’s own keys, including future inventory_/deliordernyc_ keys', () => {
    for (const key of Object.keys(appData)) expect(isAppOwnedKey(key)).toBe(true);
    expect(isAppOwnedKey('inventory_orderHistory')).toBe(true);
    expect(isAppOwnedKey('deliordernyc_profile')).toBe(true);
    expect(isAppOwnedKey('other_app_auth')).toBe(false);
    expect(isAppOwnedKey('grocery:settings')).toBe(false);
    expect(isAppOwnedKey('themes')).toBe(false);
    expect(isAppOwnedKey('Inventory_products')).toBe(false);
  });

  it('excludes unrelated keys by default and never writes their values into the export', async () => {
    const text = await exportText(sharedOriginStorage().storage);
    const exported = JSON.parse(text);
    expect(Object.keys(exported.raw).sort()).toEqual(Object.keys(appData).sort());
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('{\\"x\\":1}');
  });

  it('does not silently drop them either: lists excluded keys by name and size', () => {
    const result = buildExport(sharedOriginStorage().storage, context);
    expect(result.storageKeys.excludedOther).toEqual([
      { key: 'grocery:settings', length: 7 },
      { key: 'other_app_auth', length: SECRET.length },
    ]);
    expect(result.storageKeys.includedOther).toEqual([]);
    expect(result.summary.excludedKeyCount).toBe(2);
  });

  it('keeps unknown keys with the app prefix, so possible deli data is never lost', () => {
    const { storage } = makeStorage({ ...appData, inventory_orderHistory: '[{"id":1}]' });
    const result = buildExport(storage, context);
    expect(result.raw.inventory_orderHistory).toBe('[{"id":1}]');
    expect(result.storageKeys.appOwned).toContain('inventory_orderHistory');
  });

  it('includes an unrelated key only when explicitly chosen', () => {
    const result = buildExport(sharedOriginStorage().storage, context, { includeOtherKeys: ['grocery:settings'] });
    expect(result.raw['grocery:settings']).toBe('{"x":1}');
    expect(result.raw.other_app_auth).toBeUndefined();
    expect(result.storageKeys.includedOther).toEqual(['grocery:settings']);
    expect(result.storageKeys.excludedOther.map(entry => entry.key)).toEqual(['other_app_auth']);
  });

  it('ignores requested keys that do not exist', () => {
    const result = buildExport(appStorage().storage, context, { includeOtherKeys: ['nope'] });
    expect(result.raw).toEqual(appData);
    expect(result.storageKeys.includedOther).toEqual([]);
  });

  it('classifies storage without reading values into the result', () => {
    expect(classifyStorage(sharedOriginStorage().storage)).toEqual({
      appOwnedKeys: Object.keys(appData).sort(),
      otherKeys: [
        { key: 'grocery:settings', length: 7 },
        { key: 'other_app_auth', length: SECRET.length },
      ],
    });
  });

  it('still verifies against storage when unrelated keys change later', async () => {
    const { storage } = sharedOriginStorage();
    const text = await exportText(storage);
    storage.setItem('other_app_auth', 'rotated');
    storage.setItem('another_unrelated', '1');
    expect((await verifyExportText(text, storage)).status).toBe('verified');
  });

  it('detects a deli key that appeared after the export was taken', async () => {
    const { storage } = appStorage();
    const text = await exportText(storage);
    storage.setItem('inventory_orderHistory', '[]');
    const result = await verifyExportText(text, storage);
    expect(result.status).toBe('invalid');
  });
});

describe('integrity verification', () => {
  it('produces a stable SHA-256 checksum independent of key order', async () => {
    const a = await computeRawChecksum({ b: '2', a: '1' });
    const b = await computeRawChecksum({ a: '1', b: '2' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(await computeRawChecksum({ a: '1', b: '3' })).not.toBe(a);
  });

  it('is "verified" only for a well-formed export whose checksum recomputes to the same value', async () => {
    const { storage } = appStorage();
    const text = await exportText(storage);
    const result = await verifyExportText(text, storage);
    expect(result).toEqual({ status: 'verified', checksum: 'match', problems: [], warnings: [] });
    expect(JSON.parse(text).raw).toEqual(readStorageKeys(storage, Object.keys(appData)));
  });

  it('a missing checksum is "unverified", never verified', async () => {
    const exported = await createExport(appStorage().storage, context);
    const withoutField = JSON.parse(serializeExport(exported));
    delete withoutField.rawChecksum;
    const result = await verifyExportText(JSON.stringify(withoutField));
    expect(result.status).toBe('unverified');
    expect(result.checksum).toBe('missing');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('a null checksum (Web Crypto unavailable at export) is "unverified"', async () => {
    vi.stubGlobal('crypto', undefined);
    let text: string;
    try {
      const exported = await createExport(appStorage().storage, context);
      // The data is still fully rescued even without crypto.
      expect(exported.rawChecksum).toBeNull();
      expect(exported.raw).toEqual(appData);
      text = serializeExport(exported);
    } finally {
      vi.unstubAllGlobals();
    }
    const result = await verifyExportText(text!);
    expect(result.status).toBe('unverified');
    expect(result.checksum).toBe('missing');
  });

  it('a valid checksum that cannot be checked (no Web Crypto) is "unverified", not verified', async () => {
    const text = await exportText(appStorage().storage);
    vi.stubGlobal('crypto', undefined);
    try {
      const result = await verifyExportText(text);
      expect(result.status).toBe('unverified');
      expect(result.checksum).toBe('crypto-unavailable');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a digest failure is treated as unavailable, not as a match', async () => {
    const text = await exportText(appStorage().storage);
    vi.stubGlobal('crypto', { subtle: { digest: () => Promise.reject(new Error('blocked')) } });
    try {
      expect((await verifyExportText(text)).status).toBe('unverified');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['too short', 'abc123'],
    ['not hex', 'z'.repeat(64)],
    ['uppercase', 'A'.repeat(64)],
    ['a number', 12345],
    ['an empty string', ''],
    ['an object', { sha: 'x' }],
  ])('a malformed checksum (%s) is "invalid"', async (_label, bad) => {
    const exported = JSON.parse(await exportText(appStorage().storage));
    exported.rawChecksum = bad;
    const result = await verifyExportText(JSON.stringify(exported));
    expect(result.status).toBe('invalid');
    expect(result.checksum).toBe('malformed');
  });

  it('an unknown checksum algorithm is "invalid"', async () => {
    const exported = JSON.parse(await exportText(appStorage().storage));
    exported.rawChecksumAlgorithm = 'MD5';
    expect((await verifyExportText(JSON.stringify(exported))).status).toBe('invalid');
  });

  it('a mismatched checksum (tampered data) is "invalid"', async () => {
    const exported = await createExport(appStorage().storage, context);
    exported.raw.inventory_deliName = 'Someone Else';
    const result = await verifyExportText(serializeExport(exported));
    expect(result.status).toBe('invalid');
    expect(result.checksum).toBe('mismatch');
  });

  it('a well-formed checksum for different data is "invalid"', async () => {
    const exported = await createExport(appStorage().storage, context);
    exported.rawChecksum = '0'.repeat(64);
    expect((await verifyExportText(serializeExport(exported))).status).toBe('invalid');
  });

  it('a missing checksum never hides other problems', async () => {
    const exported = JSON.parse(await exportText(appStorage().storage));
    exported.rawChecksum = null;
    exported.schemaVersion = 99;
    expect((await verifyExportText(JSON.stringify(exported))).status).toBe('invalid');
  });

  it('detects a truncated file', async () => {
    const text = await exportText(appStorage().storage);
    expect((await verifyExportText(text.slice(0, text.length / 2))).status).toBe('invalid');
  });

  it('detects that deli data changed after the export was taken', async () => {
    const { storage } = appStorage();
    const text = await exportText(storage);
    storage.setItem('inventory_deliName', 'Renamed');
    expect((await verifyExportText(text, storage)).status).toBe('invalid');
  });

  it('rejects files that are not exports', async () => {
    expect((await verifyExportText('{"hello":1}')).status).toBe('invalid');
    expect((await verifyExportText('null')).status).toBe('invalid');
    expect((await verifyExportText('[]')).status).toBe('invalid');
  });
});

describe('exportFileName', () => {
  it('uses local date and time with zero padding', () => {
    expect(exportFileName(new Date(2026, 0, 5, 7, 3, 9))).toBe('deliordernyc-backup-2026-01-05-070309.json');
  });
});
