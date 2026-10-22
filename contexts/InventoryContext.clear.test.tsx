// @vitest-environment jsdom
//
// v0.1.7 "Clear count" through the real InventoryProvider: a product goes back to "not counted"
// (unknown, never 0), older counts never come back as stock, Undo, restart, recount, blocked
// storage, other products untouched, and older app versions reading the result.

import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useInventory from '../hooks/useInventory';
import { getStockView, validateStockCountsValue, withCount, withoutCount, StockCountsDoc } from '../utils/stockCounts';
import { resetGuardForTests } from '../utils/storageGuard';
import { validateStoredValue } from '../utils/dataValidation';
import { DEFAULT_WORKFLOW } from '../utils/supplierWorkflow';
import { ClearCountResult, InventoryContextType, InventoryProvider } from './InventoryContext';

const REAL = JSON.parse(readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8')).raw as Record<string, string>;
const KEY = 'inventory_stockCounts';
const A = 'az_rx_fruitpunch_slim11_5';
const B = 'az_rx_caution_slim11_5';

let api: InventoryContextType;
const Probe = () => {
  api = useInventory();
  return null;
};
const mount = () => render(<InventoryProvider><Probe /></InventoryProvider>);
const seed = () => Object.entries(REAL).forEach(([k, v]) => localStorage.setItem(k, v));
const product = (id: string) => api.products.find(p => p.id === id)!;
const doc = () => JSON.parse(localStorage.getItem(KEY)!) as StockCountsDoc;
const run = <T,>(fn: () => T): T => {
  let out: T;
  act(() => {
    out = fn();
  });
  return out!;
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

describe('Clear count', () => {
  it('puts one product back to not counted (not 0); the other product keeps its count', () => {
    seed();
    mount();
    run(() => api.saveStockCount(A, 5, 'counter'));
    run(() => api.saveStockCount(A, 3, 'counter'));
    run(() => api.saveStockCount(B, 7, 'counter'));
    const result = run(() => api.clearStockCount(A));
    expect(result.ok).toBe(true);
    expect(api.getStock(product(A)).state).toBe('unverified');
    expect(api.getStock(product(B))).toMatchObject({ state: 'verified', units: 7 });
    // The counts are kept for the record, out of the active list.
    expect(doc().products[A].counts).toEqual([]);
    expect(doc().products[A].cleared?.[0].counts.map(c => c.units)).toEqual([3, 5]);
  });

  it('Undo right after brings the same count back; Undo twice does nothing more', () => {
    seed();
    mount();
    run(() => api.saveStockCount(A, 3, 'counter'));
    const { clearedAt } = run(() => api.clearStockCount(A)) as Extract<ClearCountResult, { ok: true }>;
    expect(run(() => api.undoClearStockCount(A, clearedAt))).toBe(true);
    expect(api.getStock(product(A))).toMatchObject({ state: 'verified', units: 3 });
    expect(doc().products[A].cleared).toBeUndefined();
    expect(run(() => api.undoClearStockCount(A, clearedAt))).toBe(false);
  });

  it('survives a restart, and a new count after clearing does not bring the older ones back', () => {
    seed();
    mount();
    run(() => api.saveStockCount(A, 3, 'counter'));
    run(() => api.clearStockCount(A));
    cleanup();
    resetGuardForTests();
    mount();
    expect(api.getStock(product(A)).state).toBe('unverified');
    run(() => api.saveStockCount(A, 9, 'counter'));
    const view = api.getStock(product(A));
    expect(view).toMatchObject({ state: 'verified', units: 9, previous: null });
    // Undo of that new count goes back to not counted, never to the cleared 3.
    const countedAt = (view as { countedAt: string }).countedAt;
    run(() => api.undoStockCounts([{ productId: A, countedAt }]));
    expect(api.getStock(product(A)).state).toBe('unverified');
    expect(doc().products[A].cleared?.[0].counts[0].units).toBe(3);
  });

  it('Undo after a newer count does nothing (the newer count stays)', () => {
    seed();
    mount();
    run(() => api.saveStockCount(A, 3, 'counter'));
    const { clearedAt } = run(() => api.clearStockCount(A)) as Extract<ClearCountResult, { ok: true }>;
    run(() => api.saveStockCount(A, 4, 'counter'));
    expect(run(() => api.undoClearStockCount(A, clearedAt))).toBe(false);
    expect(api.getStock(product(A))).toMatchObject({ state: 'verified', units: 4 });
  });

  it('refuses when nothing is counted, for Boar\'s Head, and when storage is blocked', () => {
    seed();
    mount();
    expect(run(() => api.clearStockCount(A))).toEqual({ ok: false, reason: 'not-counted' });
    expect(run(() => api.clearStockCount('bh_turkey'))).toEqual({ ok: false, reason: 'not-tracked' });
    run(() => api.saveStockCount(A, 3, 'counter'));
    const before = localStorage.getItem(KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const result = run(() => api.clearStockCount(A));
    expect(result.ok).toBe(false);
    vi.restoreAllMocks();
    expect(localStorage.getItem(KEY)).toBe(before);
    expect(api.getStock(product(A))).toMatchObject({ state: 'verified', units: 3 });
  });

  it('the saved document is valid for backups, and an older app version reads it as not counted', () => {
    seed();
    mount();
    run(() => api.saveStockCount(A, 3, 'counter'));
    run(() => api.clearStockCount(A));
    expect(validateStoredValue(KEY, localStorage.getItem(KEY)!).ok).toBe(true);
    expect(validateStockCountsValue(doc())).toEqual([]);
    // v0.1.6 read the newest entry of `counts`; an empty list is "not counted" there too.
    const old = doc();
    expect(old.products[A].counts[0]).toBeUndefined();
    expect(getStockView(product(A), DEFAULT_WORKFLOW, old, true).state).toBe('unverified');
  });
});

describe('withoutCount keeps the cleared record', () => {
  it('removing the only active count after a clear keeps the entry with its cleared counts', () => {
    const count = (units: number, at: string) => ({ units, countedAt: at, source: 'counter' as const, unitsPerCaseAtCount: 24 });
    let d: StockCountsDoc = { schemaVersion: 1, products: { x: { counts: [], cleared: [{ clearedAt: '2026-10-01T00:00:00.000Z', counts: [count(3, '2026-09-30T00:00:00.000Z')] }] } } };
    d = withCount(d, 'x', count(9, '2026-10-02T00:00:00.000Z'));
    d = withoutCount(d, 'x', '2026-10-02T00:00:00.000Z');
    expect(d.products.x).toEqual({ counts: [], cleared: [{ clearedAt: '2026-10-01T00:00:00.000Z', counts: [count(3, '2026-09-30T00:00:00.000Z')] }] });
  });
});
