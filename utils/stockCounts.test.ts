import { describe, expect, it } from 'vitest';
import { Product } from '../types';
import { validateStoredValue } from './dataValidation';
import {
  MAX_COUNTS_PER_PRODUCT,
  StockCount,
  emptyStockCounts,
  getStockView,
  parseCountInput,
  retireProductCounts,
  stockWarning,
  usedProductIds,
  validateStockCountsValue,
  withCount,
} from './stockCounts';
import { resolveSupplierWorkflow } from './supplierWorkflow';

const arizona = {
  id: 'az_rx_fruitpunch_slim11_5', name: 'Arizona RX Energy', flavor: 'Caution Extreme Fruit Punch', category: 'Energy Drink',
  supplierId: 'sup6', size: '11.5 oz. Slim Can', unitsPerCase: 24, costPrice: 38.99, retailPrice: 2.49,
  reorderThresholdUnits: 6, currentStockUnits: 16,
} as Product;
const turkey = { ...arizona, id: 'bh_turkey', supplierId: 'sup1', currentStockUnits: 7 } as Product;
const count = (units: number, countedAt: string, source: StockCount['source'] = 'classic'): StockCount => ({
  units, countedAt, source, unitsPerCaseAtCount: 24,
});
const counted = (units: number) => getStockView(arizona, resolveSupplierWorkflow('sup6'), withCount(emptyStockCounts(), arizona.id, count(units, '2026-10-15T09:00:00.000Z')), true);

describe('typed counts', () => {
  it.each([
    ['18', 18], ['0', 0], [' 7 ', 7], ['00012', 12], ['99999', 99999],
  ])('"%s" is %d units', (text, units) => expect(parseCountInput(text)).toBe(units));

  it.each(['', '   ', '1.5', '2,5', '-1', 'abc', '1e3', '100000', '½'])('"%s" is not a count (never treated as 0)', text => {
    expect(parseCountInput(text)).toBeNull();
  });
});

describe('recording counts', () => {
  it('keeps the two most recent counts, newest first, with their times', () => {
    let doc = emptyStockCounts();
    doc = withCount(doc, arizona.id, count(10, '2026-10-13T08:00:00.000Z'));
    doc = withCount(doc, arizona.id, count(14, '2026-10-14T08:00:00.000Z'));
    doc = withCount(doc, arizona.id, count(18, '2026-10-15T08:00:00.000Z'));
    expect(doc.products[arizona.id].counts.map(c => [c.units, c.countedAt])).toEqual([
      [18, '2026-10-15T08:00:00.000Z'],
      [14, '2026-10-14T08:00:00.000Z'],
    ]);
    expect(MAX_COUNTS_PER_PRODUCT).toBe(2);
  });

  it('does not change the document it was given', () => {
    const doc = emptyStockCounts();
    withCount(doc, arizona.id, count(5, '2026-10-15T08:00:00.000Z'));
    expect(doc).toEqual(emptyStockCounts());
  });

  it.each([1.5, -1, Number.NaN, Infinity])('refuses %s units', units => {
    expect(() => withCount(emptyStockCounts(), arizona.id, count(units, '2026-10-15T08:00:00.000Z'))).toThrow();
  });
});

describe('what is shown', () => {
  const workflow = resolveSupplierWorkflow('sup6');

  it('an uncounted product is "not counted" with its old number, never verified', () => {
    expect(getStockView(arizona, workflow, emptyStockCounts(), true)).toEqual({ state: 'unverified', legacyUnits: 16 });
  });

  it('an old zero is unknown, not out of stock', () => {
    const view = getStockView({ ...arizona, currentStockUnits: 0 }, workflow, emptyStockCounts(), true);
    expect(view).toEqual({ state: 'unverified', legacyUnits: 0 });
    expect(stockWarning(view, arizona)).toBeNull();
  });

  it('a counted product shows its latest count and the one before', () => {
    let doc = withCount(emptyStockCounts(), arizona.id, count(20, '2026-10-14T08:00:00.000Z'));
    doc = withCount(doc, arizona.id, count(18, '2026-10-15T08:00:00.000Z', 'confirmed-legacy'));
    expect(getStockView(arizona, workflow, doc, true)).toEqual({
      state: 'verified', units: 18, countedAt: '2026-10-15T08:00:00.000Z', source: 'confirmed-legacy', previous: count(20, '2026-10-14T08:00:00.000Z'),
    });
  });

  it('when saved counts cannot be read, nothing is presented as counted', () => {
    const doc = withCount(emptyStockCounts(), arizona.id, count(18, '2026-10-15T08:00:00.000Z'));
    expect(getStockView(arizona, workflow, doc, false)).toEqual({ state: 'unavailable', legacyUnits: 16 });
    expect(stockWarning(getStockView(arizona, workflow, doc, false), arizona)).toBeNull();
  });

  it("Boar's Head products are not stock-tracked at all, even with a stray count", () => {
    const doc = withCount(emptyStockCounts(), turkey.id, count(3, '2026-10-15T08:00:00.000Z'));
    const view = getStockView(turkey, resolveSupplierWorkflow('sup1'), doc, true);
    expect(view).toEqual({ state: 'not-tracked' });
    expect(stockWarning(view, turkey)).toBeNull();
  });

  it('warnings come only from verified counts: 0 is out, at or below the reorder point is low', () => {
    expect(stockWarning(counted(0), arizona)).toBe('out');
    expect(stockWarning(counted(6), arizona)).toBe('low');
    expect(stockWarning(counted(7), arizona)).toBeNull();
    expect(stockWarning({ state: 'unverified', legacyUnits: 1 }, arizona)).toBeNull();
  });
});

describe('deleted products', () => {
  it('their counts are kept, hidden, and never attach to a new product with the same id', () => {
    const doc = withCount(emptyStockCounts(), arizona.id, count(18, '2026-10-15T08:00:00.000Z'));
    const retired = retireProductCounts(doc, arizona.id, '2026-10-16T08:00:00.000Z');
    expect(retired.products[arizona.id]).toBeUndefined();
    expect(retired.retired).toEqual([{ productId: arizona.id, retiredAt: '2026-10-16T08:00:00.000Z', counts: [count(18, '2026-10-15T08:00:00.000Z')] }]);
    expect(getStockView(arizona, resolveSupplierWorkflow('sup6'), retired, true).state).toBe('unverified');
    expect(usedProductIds([], retired).has(arizona.id)).toBe(true);
  });

  it('a product without counts changes nothing', () => {
    const doc = emptyStockCounts();
    expect(retireProductCounts(doc, arizona.id, '2026-10-16T08:00:00.000Z')).toBe(doc);
  });
});

describe('validation of inventory_stockCounts', () => {
  const valid = JSON.stringify(withCount(emptyStockCounts(), arizona.id, count(18, '2026-10-15T08:00:00.000Z')));

  it('accepts a valid document, an empty one, and unknown extra fields', () => {
    expect(validateStoredValue('inventory_stockCounts', valid).ok).toBe(true);
    expect(validateStoredValue('inventory_stockCounts', JSON.stringify(emptyStockCounts())).ok).toBe(true);
    const extra = { ...JSON.parse(valid), futureField: 1 };
    extra.products[arizona.id].note = 'kept';
    expect(validateStockCountsValue(extra)).toEqual([]);
  });

  it.each([
    ['not JSON', '{"schemaVersion":1,'],
    ['wrong version', JSON.stringify({ schemaVersion: 2, products: {} })],
    ['no product list', JSON.stringify({ schemaVersion: 1 })],
    ['fractional units', JSON.stringify({ schemaVersion: 1, products: { a: { counts: [count(1.5, '2026-10-15T08:00:00.000Z')] } } })],
    ['negative units', JSON.stringify({ schemaVersion: 1, products: { a: { counts: [count(-2, '2026-10-15T08:00:00.000Z')] } } })],
    ['units as text', JSON.stringify({ schemaVersion: 1, products: { a: { counts: [{ ...count(2, '2026-10-15T08:00:00.000Z'), units: '2' }] } } })],
    ['bad time', JSON.stringify({ schemaVersion: 1, products: { a: { counts: [count(2, 'yesterday')] } } })],
    ['bad retired list', JSON.stringify({ schemaVersion: 1, products: {}, retired: {} })],
  ])('rejects %s', (_label, text) => {
    expect(validateStoredValue('inventory_stockCounts', text).ok).toBe(false);
  });
});

describe('order line validation (C1 unit field)', () => {
  const order = (items: unknown[]) => JSON.stringify({ items, createdAt: '2026-10-15T08:00:00.000Z' });
  it('accepts lines without a unit (pre-C1) and item lines', () => {
    expect(validateStoredValue('inventory_currentOrder', order([{ productId: 'a', quantity: 1 }, { productId: 'bh_turkey', quantity: 1, unit: 'item' }])).ok).toBe(true);
  });
  it('rejects an unknown unit', () => {
    expect(validateStoredValue('inventory_currentOrder', order([{ productId: 'a', quantity: 1, unit: 'lb' }])).ok).toBe(false);
  });
});
