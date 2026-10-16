// @vitest-environment jsdom
//
// Runs the real InventoryProvider (startup load + automatic save effects) against corrupted and
// valid browser storage. Before this PR, unreadable data was replaced by sample data on startup.

import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import useInventory from '../hooks/useInventory';
import { getGuardState, resetGuardForTests } from '../utils/storageGuard';
import { InventoryContextType, InventoryProvider } from './InventoryContext';

const REAL = JSON.parse(readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8')).raw as Record<string, string>;

let api: InventoryContextType;
const Probe = () => {
  api = useInventory();
  return null;
};

const mount = () => render(<InventoryProvider><Probe /></InventoryProvider>);

const dumpStorage = () =>
  Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]));

beforeEach(() => {
  localStorage.clear();
  resetGuardForTests();
});
afterEach(() => {
  // Unmount, so a provider from an earlier test can't re-render and take over `api`.
  cleanup();
  localStorage.clear();
});

describe('InventoryProvider with the storage guard', () => {
  it('valid saved data loads unchanged and is not rewritten', () => {
    for (const [key, value] of Object.entries(REAL)) localStorage.setItem(key, value);
    const before = dumpStorage();
    mount();
    expect(api.products).toHaveLength(141);
    expect(api.suppliers).toHaveLength(13);
    expect(api.currentOrder.items).toHaveLength(2);
    expect(dumpStorage()).toEqual(before);
    expect(getGuardState().blocked).toEqual([]);
  });

  it('the Arizona order still totals $77.98 and editing it still saves', () => {
    for (const [key, value] of Object.entries(REAL)) localStorage.setItem(key, value);
    mount();
    const total = api.currentOrder.items.reduce((sum, item) => sum + api.getProductById(item.productId)!.costPrice * item.quantity, 0);
    expect(total.toFixed(2)).toBe('77.98');
    act(() => api.updateOrderItemQuantity(api.currentOrder.items[0].productId, 2));
    expect(JSON.parse(localStorage.getItem('inventory_currentOrder')!).items[0].quantity).toBe(2);
  });

  it.each([
    ['corrupted product records', 'inventory_products', JSON.stringify([{ id: 'real-1', name: 'Pepsi', costPrice: 'oops' }])],
    ['cut-off products', 'inventory_products', REAL.inventory_products.slice(0, 5000)],
    ['corrupted supplier records', 'inventory_suppliers', '[{"id":"sup1"}]'],
    ['damaged order data', 'inventory_currentOrder', '{"items":[{"productId":"x","quantity":"one"}]'],
  ])('%s: the original text survives startup and further use', (_label, key, damaged) => {
    for (const [k, value] of Object.entries(REAL)) localStorage.setItem(k, value);
    localStorage.setItem(key, damaged);
    mount();
    expect(localStorage.getItem(key)).toBe(damaged);
    expect(getGuardState().blocked.map(entry => entry.key)).toEqual([key]);

    // Using the app (which triggers the automatic save effects) still never overwrites it.
    act(() => {
      api.updateDeliName('Changed after load');
      api.addToOrder(api.products[0].id, 1);
      api.saveStockCount(api.products.find(p => p.supplierId === 'sup6')!.id, 4, 'classic');
    });
    expect(localStorage.getItem(key)).toBe(damaged);
    // Keys that were readable keep saving normally.
    expect(localStorage.getItem('inventory_deliName')).toBe('Changed after load');
  });

  it('data saved by another tab between this page loading and saving is never overwritten', () => {
    for (const [key, value] of Object.entries(REAL)) localStorage.setItem(key, value);
    mount();
    localStorage.setItem('inventory_deliName', 'Saved by another tab');
    act(() => api.updateDeliName('Stale edit in this tab'));
    expect(localStorage.getItem('inventory_deliName')).toBe('Saved by another tab');
    expect(getGuardState().blocked).toEqual([expect.objectContaining({ key: 'inventory_deliName', status: 'changed-elsewhere' })]);
    // Other data from this tab still saves.
    act(() => api.updateOrderItemQuantity(api.currentOrder.items[0].productId, 3));
    expect(JSON.parse(localStorage.getItem('inventory_currentOrder')!).items[0].quantity).toBe(3);
  });

  it('a brand-new device still gets the sample catalog saved (unchanged behaviour)', () => {
    mount();
    expect(JSON.parse(localStorage.getItem('inventory_products')!)).toHaveLength(141);
    expect(JSON.parse(localStorage.getItem('inventory_suppliers')!)).toHaveLength(13);
    expect(getGuardState().blocked).toEqual([]);
  });
});
