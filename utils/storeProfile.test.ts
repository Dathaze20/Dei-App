import { describe, expect, it } from 'vitest';
import { Product } from '../types';
import { HistoryEntry } from './orderHistory';
import { supplierPattern } from './orderPatterns';
import { proposeReorder } from './reorder';
import { StockView } from './stockCounts';
import {
  daysToNextDelivery, deliveryCycleDays, emptyStoreProfile, fact, isEstimate, validateStoreProfileValue, withProductFact, withSupplierFact,
} from './storeProfile';

// Wednesday 21 October 2026, 10:00.
const NOW = new Date(2026, 9, 21, 10, 0);
const GT: Product = {
  id: 'az_gt_bot16', name: 'Arizona', category: 'Iced Tea', supplierId: 'sup6', flavor: 'Green Tea', size: '16 oz. Bottle',
  unitsPerCase: 24, costPrice: 20, retailPrice: 2, reorderThresholdUnits: 6, currentStockUnits: 0,
};
const verified = (units: number, hoursAgo: number): StockView => ({
  state: 'verified', units, countedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(), source: 'counter', previous: null,
});

describe('store profile', () => {
  it('starts empty: every fact unknown, with a local store id', () => {
    const p = emptyStoreProfile(NOW);
    expect(p.suppliers).toEqual({});
    expect(p.products).toEqual({});
    expect(p.storeId).toMatch(/^store-/);
    expect(validateStoreProfileValue(p)).toEqual([]);
  });

  it('records each fact with its source and time; removing the last fact removes the entry', () => {
    let p = emptyStoreProfile(NOW);
    p = withSupplierFact(p, 'sup6', 'deliveryDays', fact([2], 'owner-estimate', NOW));
    p = withProductFact(p, GT.id, 'weeklyCases', fact(8, 'owner-estimate', NOW));
    expect(p.products[GT.id].weeklyCases).toEqual({ value: 8, source: 'owner-estimate', at: NOW.toISOString() });
    expect(isEstimate(p.products[GT.id].weeklyCases)).toBe(true);
    expect(validateStoreProfileValue(p)).toEqual([]);
    p = withProductFact(p, GT.id, 'weeklyCases', null);
    expect(p.products[GT.id]).toBeUndefined();
  });

  it('rejects invalid facts (bad day, negative cases, unknown source, version)', () => {
    const p = emptyStoreProfile(NOW);
    expect(validateStoreProfileValue({ ...p, suppliers: { s: { deliveryDays: { value: [9], source: 'owner-estimate', at: NOW.toISOString() } } } })).toHaveLength(1);
    expect(validateStoreProfileValue({ ...p, products: { x: { weeklyCases: { value: -1, source: 'owner-estimate', at: NOW.toISOString() } } } })).toHaveLength(1);
    expect(validateStoreProfileValue({ ...p, products: { x: { weeklyCases: { value: 3, source: 'ai-guess', at: NOW.toISOString() } } } })).toHaveLength(1);
    expect(validateStoreProfileValue({ ...p, schemaVersion: 2 })).toHaveLength(1);
    expect(validateStoreProfileValue('x')).toHaveLength(1);
  });

  it('delivery days: next delivery and the cycle it must cover', () => {
    expect(daysToNextDelivery([2], NOW)).toBe(6); // Wednesday → next Tuesday
    expect(daysToNextDelivery([3], NOW)).toBe(0); // today
    expect(daysToNextDelivery([], NOW)).toBeNull();
    expect(deliveryCycleDays([2], 2)).toBe(7);
    expect(deliveryCycleDays([2, 5], 2)).toBe(3); // Tuesday → Friday
    expect(deliveryCycleDays([2, 5], 5)).toBe(4); // Friday → Tuesday
  });
});

describe('reorder proposals', () => {
  const profile = { weeklyCases: fact(8, 'owner-estimate' as const, NOW) };

  it('calculated only with a baseline, delivery days and a fresh verified count, showing its working', () => {
    const p = proposeReorder(GT, verified(30, 5), profile, [2], NOW);
    // rate 8×24/7 per day; 6 days to Tuesday + 7-day cycle = 13 days → 356.6 units + 6 keep − 30 on hand → 14 cases.
    expect(p).toMatchObject({ kind: 'calculated', cases: 14, missing: [] });
    expect(p.basis).toMatchObject({ unitsPerCase: 24, onHand: { units: 30 }, keepOnHand: 6, daysUntilDelivery: 6, cycleDays: 7 });
    expect(p.basis.weekly?.source).toBe('owner-estimate');
  });

  it('a stale count is not used: the typical order is offered and labelled as such', () => {
    const p = proposeReorder(GT, verified(30, 72), profile, [2], NOW);
    expect(p).toMatchObject({ kind: 'typical', cases: 8, missing: ['fresh-count'] });
  });

  it('unknown stock (never counted) is not zero: typical order, never a calculation', () => {
    const p = proposeReorder(GT, { state: 'unverified', legacyUnits: 0 }, profile, [2, 5], NOW);
    expect(p.kind).toBe('typical');
    expect(p.cases).toBe(Math.round((8 * 4) / 7)); // Wednesday: next is Friday, which lasts until Tuesday
  });

  it('without a baseline nothing is proposed, and the missing facts are listed', () => {
    const p = proposeReorder(GT, verified(30, 1), undefined, undefined, NOW);
    expect(p).toMatchObject({ kind: 'unknown', cases: null, missing: ['baseline', 'delivery-days'] });
  });

  it("the store's own case size wins over the catalog's", () => {
    const p = proposeReorder(GT, verified(0, 1), { ...profile, unitsPerCase: fact(12, 'invoice', NOW) }, [2], NOW);
    expect(p.basis.unitsPerCaseSource).toBe('store');
    expect(p.basis.unitsPerCase).toBe(12);
  });

  it('a verified 0 is a real 0 (out), not unknown', () => {
    expect(proposeReorder(GT, verified(0, 1), profile, [2], NOW).kind).toBe('calculated');
  });
});

describe('ordering patterns (never "bestsellers")', () => {
  const entry = (id: string, daysAgo: number, status: 'sent' | 'prepared', qty: number, productId = GT.id): HistoryEntry => ({
    id, savedAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(), supplierId: 'sup6', supplierName: 'Arizona', status,
    lines: [{ productId, name: 'Arizona', flavor: 'Green Tea', size: '16 oz. Bottle', quantity: qty, unit: 'case', unitPrice: 20, lineTotal: 20 * qty }],
    subtotal: 20 * qty, text: '',
  });

  it('uses only orders marked Sent when there are any, within 8 weeks, averaged over the weeks covered', () => {
    const history = [entry('a', 1, 'sent', 8), entry('b', 8, 'sent', 6), entry('c', 3, 'prepared', 50), entry('old', 80, 'sent', 99)];
    const p = supplierPattern(history, 'sup6', NOW)!;
    expect(p.basis).toBe('sent');
    expect(p.ordersInWindow).toBe(2);
    expect(p.weeks).toBe(2);
    expect(p.products[0]).toMatchObject({ orders: 2, totalQuantity: 14, perOrder: 7, perWeek: 7, unit: 'case' });
  });

  it('falls back to saved orders and says so', () => {
    const p = supplierPattern([entry('c', 3, 'prepared', 5)], 'sup6', NOW)!;
    expect(p.basis).toBe('saved');
  });

  it('no orders: no pattern', () => {
    expect(supplierPattern([], 'sup6', NOW)).toBeNull();
  });
});
