import { describe, expect, it } from 'vitest';
import { makeStorage } from '../testing/storage';
import { Product, Supplier } from '../types';
import { createExport, isDataKey, isSystemKey, serializeExport } from './dataExport';
import { analyzeBackup } from './dataRestore';
import { validateStoredValue } from './dataValidation';
import { BACKUP_LOG_KEY } from './backupLog';
import { supplierDraftSummary } from './supplierDraft';
import { resolveSupplierWorkflow } from './supplierWorkflow';
import {
  ORDER_HISTORY_KEY,
  emptyOrderHistory,
  snapshotFromGroup,
  validateOrderHistoryValue,
  withSnapshot,
  withStatus,
  withoutEntry,
} from './orderHistory';

const suppliers: Supplier[] = [
  { id: 'sup6', name: 'Arizona', color: '' },
  { id: 'sup1', name: "Boar's Head", color: '' },
];
const products = [
  { id: 'az_fp', name: 'Arizona RX Energy', flavor: 'Caution Extreme Fruit Punch', size: '16 oz', supplierId: 'sup6', unitsPerCase: 12, costPrice: 38.99, retailPrice: 3, category: '', currentStockUnits: 0, reorderThresholdUnits: 12 },
  { id: 'bh_turkey', name: 'OvenGold Turkey Breast', flavor: 'Roasted', size: 'per lb', supplierId: 'sup1', unitsPerCase: 10, costPrice: 70, retailPrice: 15, category: '', currentStockUnits: 0, reorderThresholdUnits: 0 },
] as Product[];
const getProduct = (id: string) => products.find(p => p.id === id);
const getSupplier = (id: string) => suppliers.find(s => s.id === id);
const group = (items: { productId: string; quantity: number; unit?: 'item' }[], supplierId: string) =>
  supplierDraftSummary(items, supplierId, getProduct, getSupplier, resolveSupplierWorkflow).groups[0];
const now = new Date('2026-10-21T15:00:00Z');

describe('order history', () => {
  it('snapshots names, sizes, units and prices as they were', () => {
    const entry = snapshotFromGroup(group([{ productId: 'az_fp', quantity: 2 }], 'sup6'), 'ORDER TEXT', now, 'ord-1');
    expect(entry).toEqual({
      id: 'ord-1', savedAt: now.toISOString(), supplierId: 'sup6', supplierName: 'Arizona', status: 'prepared', text: 'ORDER TEXT',
      lines: [{ productId: 'az_fp', name: 'Arizona RX Energy', flavor: 'Caution Extreme Fruit Punch', size: '16 oz', quantity: 2, unit: 'case', unitPrice: 38.99, lineTotal: 77.98 }],
      subtotal: 77.98,
    });
    const list = snapshotFromGroup(group([{ productId: 'bh_turkey', quantity: 3, unit: 'item' }], 'sup1'), 'LIST', now, 'ord-2');
    expect(list.lines[0]).toMatchObject({ unit: 'item', unitPrice: null, lineTotal: null });
    expect(list.subtotal).toBeNull();
    expect(validateOrderHistoryValue({ schemaVersion: 1, entries: [entry, list] })).toEqual([]);
  });

  it('does not add the same unchanged order twice, but does add a changed one', () => {
    const first = snapshotFromGroup(group([{ productId: 'az_fp', quantity: 2 }], 'sup6'), 't', now, 'a');
    let { doc } = withSnapshot(emptyOrderHistory(), first);
    const again = withSnapshot(doc, snapshotFromGroup(group([{ productId: 'az_fp', quantity: 2 }], 'sup6'), 't', now, 'b'));
    expect(again.existing?.id).toBe('a');
    expect(again.doc).toBe(doc);
    doc = withSnapshot(doc, snapshotFromGroup(group([{ productId: 'az_fp', quantity: 3 }], 'sup6'), 't', now, 'c')).doc;
    expect(doc.entries.map(e => e.id)).toEqual(['c', 'a']);
  });

  it('Sent is set and undone only by the person; removing one keeps the rest', () => {
    const doc = withSnapshot(emptyOrderHistory(), snapshotFromGroup(group([{ productId: 'az_fp', quantity: 1 }], 'sup6'), 't', now, 'a')).doc;
    const sent = withStatus(doc, 'a', 'sent', now);
    expect(sent.entries[0]).toMatchObject({ status: 'sent', sentAt: now.toISOString() });
    expect(withStatus(sent, 'a', 'prepared').entries[0]).not.toHaveProperty('sentAt');
    expect(withoutEntry(sent, 'zzz')).toEqual(sent);
  });

  it('rejects malformed histories instead of loading part of them', () => {
    expect(validateOrderHistoryValue([])).not.toEqual([]);
    expect(validateOrderHistoryValue({ schemaVersion: 1 })).not.toEqual([]);
    const entry = { id: 'a', savedAt: 'x', supplierId: 's', supplierName: 'S', status: 'prepared', lines: [], subtotal: null, text: '' };
    expect(validateOrderHistoryValue({ schemaVersion: 1, entries: [entry] })[0]).toMatch(/date/);
    const ok = { ...entry, savedAt: now.toISOString() };
    expect(validateOrderHistoryValue({ schemaVersion: 1, entries: [ok, ok] })[0]).toMatch(/more than once/);
    expect(validateOrderHistoryValue({ schemaVersion: 1, entries: [{ ...ok, status: 'delivered' }] })[0]).toMatch(/status/);
    expect(validateOrderHistoryValue({ schemaVersion: 1, entries: [{ ...ok, lines: [{ productId: 'p', quantity: 'two' }] }] })[0]).toMatch(/line/);
    expect(validateStoredValue(ORDER_HISTORY_KEY, '{oops').ok).toBe(false);
  });
});

describe('v0.1.3 data and backups', () => {
  it('order history is deli data (backed up and restored); the backup log is device-only', () => {
    expect(isDataKey(ORDER_HISTORY_KEY)).toBe(true);
    expect(isSystemKey(BACKUP_LOG_KEY)).toBe(true);
    expect(isDataKey(BACKUP_LOG_KEY)).toBe(false);
  });

  it('a backup with order history restores it; one with a damaged history is refused', async () => {
    const entry = snapshotFromGroup(group([{ productId: 'az_fp', quantity: 2 }], 'sup6'), 't', now, 'a');
    const history = JSON.stringify(withSnapshot(emptyOrderHistory(), entry).doc);
    const base = { inventory_products: JSON.stringify(products), inventory_suppliers: JSON.stringify(suppliers), [BACKUP_LOG_KEY]: '{"last":{}}' };
    const ctx = { now, origin: 'o', href: 'h', userAgent: 'u', appName: 'DeliOrderNYC', appVersion: '0' };

    const good = await analyzeBackup(serializeExport(await createExport(makeStorage({ ...base, [ORDER_HISTORY_KEY]: history }).storage, ctx)));
    expect(good.canRestore).toBe(true);
    expect(good.target[ORDER_HISTORY_KEY]).toBe(history);
    expect(good.target).not.toHaveProperty(BACKUP_LOG_KEY);

    const bad = await analyzeBackup(serializeExport(await createExport(makeStorage({ ...base, [ORDER_HISTORY_KEY]: '{"entries":3}' }).storage, ctx)));
    expect(bad.canRestore).toBe(false);
  });

  it('v0.1.2 data (no history, no backup log, older preferences) loads as it is', async () => {
    const v012 = {
      inventory_products: JSON.stringify(products),
      inventory_suppliers: JSON.stringify(suppliers),
      inventory_currentOrder: JSON.stringify({ items: [{ productId: 'az_fp', quantity: 1 }], createdAt: now.toISOString() }),
      deliordernyc_sys_prefs: JSON.stringify({ favorites: ['sup6'], recent: [], lastSupplier: 'sup6', mode: 'count', density: 'compact' }),
    };
    for (const [key, value] of Object.entries(v012)) expect(validateStoredValue(key, value).ok).toBe(true);
    const analysis = await analyzeBackup(serializeExport(await createExport(makeStorage(v012).storage, { now, origin: 'o', href: 'h', userAgent: 'u', appName: 'DeliOrderNYC', appVersion: '0' })));
    expect(analysis.canRestore).toBe(true);
    expect(analysis.target).not.toHaveProperty(ORDER_HISTORY_KEY);
  });
});
