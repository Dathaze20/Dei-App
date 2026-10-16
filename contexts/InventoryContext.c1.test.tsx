// @vitest-environment jsdom
//
// C1 through the real InventoryProvider: verified stock counts (inventory_stockCounts) and
// Boar's Head item ordering, against real browser storage.

import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useInventory from '../hooks/useInventory';
import { getGuardState, resetGuardForTests } from '../utils/storageGuard';
import { InventoryContextType, InventoryProvider, SaveCountResult } from './InventoryContext';

const REAL = JSON.parse(readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8')).raw as Record<string, string>;
const KEY = 'inventory_stockCounts';
const ARIZONA = 'az_rx_fruitpunch_slim11_5';

let api: InventoryContextType;
const Probe = () => {
  api = useInventory();
  return null;
};
const mount = () => render(<InventoryProvider><Probe /></InventoryProvider>);
const seedReal = (extra: Record<string, string> = {}) => {
  for (const [key, value] of Object.entries({ ...REAL, ...extra })) localStorage.setItem(key, value);
};
const dump = () => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]));
const product = (id: string) => api.products.find(p => p.id === id)!;
const save = (id: string, units: number, source: 'classic' | 'confirmed-legacy' = 'classic') => {
  let result: SaveCountResult | undefined;
  act(() => {
    result = api.saveStockCount(id, units, source);
  });
  return result!;
};

beforeEach(() => {
  localStorage.clear();
  resetGuardForTests();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('verified stock counts', () => {
  it('nothing is written at startup, and every product starts not counted', () => {
    seedReal();
    const before = dump();
    mount();
    expect(dump()).toEqual(before);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(api.getStock(product(ARIZONA))).toEqual({ state: 'unverified', legacyUnits: product(ARIZONA).currentStockUnits });
  });

  it('a count is saved only to inventory_stockCounts; products (and every old stock number) stay byte-identical', () => {
    seedReal();
    mount();
    const productsBefore = localStorage.getItem('inventory_products');
    expect(save(ARIZONA, 18)).toMatchObject({ ok: true, count: { units: 18, source: 'classic', unitsPerCaseAtCount: 24 } });
    expect(save(ARIZONA, 20)).toMatchObject({ ok: true });
    expect(save(ARIZONA, 22)).toMatchObject({ ok: true });
    expect(localStorage.getItem('inventory_products')).toBe(productsBefore);
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.products[ARIZONA].counts.map((c: { units: number }) => c.units)).toEqual([22, 20]);
    expect(api.getStock(product(ARIZONA))).toMatchObject({ state: 'verified', units: 22, previous: { units: 20 } });
  });

  it('counts survive a reload', () => {
    seedReal();
    mount();
    save(ARIZONA, 18);
    cleanup();
    resetGuardForTests();
    mount();
    expect(api.getStock(product(ARIZONA))).toMatchObject({ state: 'verified', units: 18 });
  });

  it('confirming an old number records it as a count with its own source', () => {
    seedReal();
    mount();
    const old = product(ARIZONA).currentStockUnits;
    expect(save(ARIZONA, old, 'confirmed-legacy')).toMatchObject({ ok: true, count: { units: old, source: 'confirmed-legacy' } });
  });

  it.each([1.5, -1, Number.NaN])('refuses %s units and writes nothing', units => {
    seedReal();
    mount();
    expect(save(ARIZONA, units)).toEqual({ ok: false, reason: 'invalid' });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("Boar's Head products cannot be stock-counted", () => {
    seedReal();
    mount();
    expect(api.getStock(product('bh_turkey'))).toEqual({ state: 'not-tracked' });
    expect(save('bh_turkey', 3)).toEqual({ ok: false, reason: 'not-tracked' });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('a failed save (storage full) is reported as not saved and changes nothing', () => {
    seedReal();
    mount();
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return setItem.call(this, key, value);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(save(ARIZONA, 18)).toEqual({ ok: false, reason: 'write-failed' });
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(api.getStock(product(ARIZONA)).state).toBe('unverified');
  });

  it('corrupted counts: the text is kept, nothing is shown as counted, and saving is refused', () => {
    const damaged = '{"schemaVersion":1,"products":{"az_rx_fruitpunch_slim11_5":{"counts":[{"units":"lots"}]}}}';
    seedReal({ [KEY]: damaged });
    mount();
    expect(getGuardState().blocked.map(b => b.key)).toEqual([KEY]);
    expect(api.getStock(product(ARIZONA)).state).toBe('unavailable');
    expect(save(ARIZONA, 18)).toEqual({ ok: false, reason: 'blocked' });
    act(() => api.updateDeliName('Other data still saves'));
    expect(localStorage.getItem(KEY)).toBe(damaged);
    expect(localStorage.getItem('inventory_deliName')).toBe('Other data still saves');
  });

  it('another tab counted after this page loaded: this save is refused, the other count survives, and nothing here shows as counted', () => {
    seedReal();
    mount();
    const otherTab = JSON.stringify({ schemaVersion: 1, products: { mon_orig_can16: { counts: [{ units: 5, countedAt: '2026-10-15T08:00:00.000Z', source: 'classic', unitsPerCaseAtCount: 24 }] } } });
    localStorage.setItem(KEY, otherTab);
    expect(save(ARIZONA, 18)).toEqual({ ok: false, reason: 'blocked' });
    expect(localStorage.getItem(KEY)).toBe(otherTab);
    expect(getGuardState().blocked).toEqual([expect.objectContaining({ key: KEY, status: 'changed-elsewhere' })]);
    expect(api.getStock(product(ARIZONA)).state).toBe('unavailable');
  });

  it('deleting a product keeps its counts hidden; a new product never inherits them', () => {
    seedReal();
    mount();
    save(ARIZONA, 18);
    act(() => api.deleteProduct(ARIZONA));
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored.products[ARIZONA]).toBeUndefined();
    expect(stored.retired).toEqual([expect.objectContaining({ productId: ARIZONA, counts: [expect.objectContaining({ units: 18 })] })]);

    // Even if the clock gives a new product an id that has count history, it gets another id.
    const counted = 'prod_1760000000000';
    save('mon_orig_can16', 4);
    localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(KEY)!), products: { [counted]: { counts: [{ units: 9, countedAt: '2026-10-15T08:00:00.000Z', source: 'classic', unitsPerCaseAtCount: 1 }] } } }));
    cleanup();
    resetGuardForTests();
    mount();
    vi.spyOn(Date.prototype, 'getTime').mockReturnValue(1760000000000);
    act(() => api.addProduct({ name: 'New', flavor: 'x', category: 'Snacks', supplierId: 'sup4', size: '1oz', unitsPerCase: 1, costPrice: 1, retailPrice: 1, reorderThresholdUnits: 0 }));
    const created = api.products[0];
    expect(created.id).not.toBe(counted);
    expect(api.getStock(created).state).toBe('unverified');
  });
});

describe("Boar's Head item ordering", () => {
  it('new Boar\'s Head lines are items; other suppliers keep the pre-C1 case line shape', () => {
    seedReal({ inventory_currentOrder: JSON.stringify({ items: [], createdAt: '2026-10-15T08:00:00.000Z' }) });
    mount();
    act(() => {
      api.addToOrder('bh_turkey', 1);
      api.addToOrder(ARIZONA, 1);
      api.addToOrder('bh_turkey', 1);
    });
    expect(JSON.parse(localStorage.getItem('inventory_currentOrder')!).items).toEqual([
      { productId: 'bh_turkey', quantity: 2, unit: 'item' },
      { productId: ARIZONA, quantity: 1 },
    ]);
  });

  it('a saved pre-C1 Boar\'s Head case line keeps its meaning; new items go on their own line until it is converted', () => {
    const legacy = { items: [{ productId: 'bh_turkey', quantity: 2 }], createdAt: '2026-10-01T08:00:00.000Z' };
    seedReal({ inventory_currentOrder: JSON.stringify(legacy) });
    mount();
    act(() => api.addToOrder('bh_turkey', 1));
    expect(api.currentOrder.items).toEqual([{ productId: 'bh_turkey', quantity: 2 }, { productId: 'bh_turkey', quantity: 1, unit: 'item' }]);

    act(() => api.updateOrderItemQuantity('bh_turkey', 3, 'case'));
    expect(api.currentOrder.items[0]).toEqual({ productId: 'bh_turkey', quantity: 3 });

    act(() => api.convertOrderLineToItems('bh_turkey'));
    expect(api.currentOrder.items).toEqual([{ productId: 'bh_turkey', quantity: 4, unit: 'item' }]);
  });

  it('removing one line leaves the other unit\'s line alone', () => {
    const order = { items: [{ productId: 'bh_turkey', quantity: 2 }, { productId: 'bh_turkey', quantity: 1, unit: 'item' }], createdAt: '2026-10-01T08:00:00.000Z' };
    seedReal({ inventory_currentOrder: JSON.stringify(order) });
    mount();
    act(() => api.removeFromOrder('bh_turkey', 'item'));
    expect(api.currentOrder.items).toEqual([{ productId: 'bh_turkey', quantity: 2 }]);
  });

  it('a case supplier line can never be converted to items', () => {
    seedReal();
    mount();
    const before = api.currentOrder.items;
    act(() => api.convertOrderLineToItems(ARIZONA));
    expect(api.currentOrder.items).toEqual(before);
  });
});
