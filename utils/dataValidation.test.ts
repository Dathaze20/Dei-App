import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { validateOrder, validateProducts, validateStoredValue, validateSuppliers } from './dataValidation';

const fixture = JSON.parse(readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8'));
const realProducts = JSON.parse(fixture.raw.inventory_products);
const realSuppliers = JSON.parse(fixture.raw.inventory_suppliers);
const realOrder = JSON.parse(fixture.raw.inventory_currentOrder);

describe('validation accepts the app’s real data', () => {
  it('accepts all 141 real products, 13 suppliers and the Arizona order from a browser export', () => {
    expect(realProducts).toHaveLength(141);
    expect(validateProducts(realProducts)).toEqual({ ok: true, problems: [] });
    expect(validateSuppliers(realSuppliers)).toEqual({ ok: true, problems: [] });
    expect(validateOrder(realOrder)).toEqual({ ok: true, problems: [] });
  });

  it('keeps unknown extra fields valid (nothing is rejected for having more data)', () => {
    expect(validateProducts([{ ...realProducts[0], verifiedPhoto: 'x', barcode2: '1' }]).ok).toBe(true);
  });

  it('accepts a product added through the form (empty optional fields)', () => {
    expect(validateProducts([{ ...realProducts[0], id: 'prod_1', imageUrl: '', upc: '' }]).ok).toBe(true);
  });

  it('treats deli name, theme and language as plain text', () => {
    expect(validateStoredValue('inventory_deliName', 'not { json').ok).toBe(true);
    expect(validateStoredValue('theme', 'dark').ok).toBe(true);
    expect(validateStoredValue('inventory_future', 'anything').ok).toBe(true);
  });
});

describe('validation rejects corrupted records', () => {
  it.each([
    ['a missing id', { ...realProducts[0], id: undefined }],
    ['a text price', { ...realProducts[0], costPrice: '38.99' }],
    ['a NaN stock value', { ...realProducts[0], currentStockUnits: NaN }],
    ['missing units per case', { ...realProducts[0], unitsPerCase: undefined }],
    ['a non-text flavor', { ...realProducts[0], flavor: null }],
  ])('a product with %s', (_label, bad) => {
    const result = validateProducts([...realProducts.slice(1), bad]);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/Product #141/);
  });

  it('duplicate product ids', () => {
    expect(validateProducts([realProducts[0], realProducts[0]]).ok).toBe(false);
  });

  it('a product list that is not a list', () => {
    expect(validateProducts({ 0: realProducts[0] }).ok).toBe(false);
    expect(validateStoredValue('inventory_products', '[{"id":"cut off').ok).toBe(false);
  });

  it('corrupted supplier records', () => {
    expect(validateSuppliers([{ id: 'sup1', name: 'Arizona' }]).ok).toBe(false); // no color
    expect(validateSuppliers([null]).ok).toBe(false);
    expect(validateStoredValue('inventory_suppliers', '"Arizona"').ok).toBe(false);
  });

  it('damaged order data', () => {
    expect(validateOrder({ createdAt: 'x' }).ok).toBe(false);
    expect(validateOrder({ items: [{ productId: 'a', quantity: '1' }], createdAt: 'x' }).ok).toBe(false);
    expect(validateOrder({ items: [], createdAt: 5 }).ok).toBe(false);
    expect(validateOrder([]).ok).toBe(false);
    expect(validateStoredValue('inventory_currentOrder', '{"items":[{"productId":').ok).toBe(false);
  });
});
