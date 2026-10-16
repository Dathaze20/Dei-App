import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { Product } from '../types';
import { KeypadKey, countingOrder, keypadUnits, nextProductId, pressKey, saveAndNext, stepCount } from './countKeypad';
import { groupSupplierProducts } from './productGrouping';
import { MAX_COUNT_UNITS } from './stockCounts';
import { resolveSupplierWorkflow } from './supplierWorkflow';

const REAL = JSON.parse(readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8')).raw as Record<string, string>;
const products: Product[] = JSON.parse(REAL.inventory_products);
const type = (keys: KeypadKey[], start = '') => keys.reduce(pressKey, start);

describe('whole-number keypad', () => {
  it('builds a number from digits', () => {
    expect(type(['1', '2', '0'])).toBe('120');
    expect(keypadUnits('120')).toBe(120);
  });

  it('blank is no count, never 0', () => {
    expect(keypadUnits('')).toBeNull();
    expect(type(['5', 'backspace'])).toBe('');
    expect(keypadUnits(type(['5', 'backspace']))).toBeNull();
    expect(type(['4', '2', 'clear'])).toBe('');
  });

  it('0 is a real count and has no leading zeros', () => {
    expect(type(['0'])).toBe('0');
    expect(keypadUnits('0')).toBe(0);
    expect(type(['0', '0', '7'])).toBe('7');
  });

  it(`never goes over ${MAX_COUNT_UNITS}`, () => {
    expect(type(['9', '9', '9', '9', '9'])).toBe('99999');
    expect(type(['9', '9', '9', '9', '9', '9'])).toBe('99999');
    expect(type(['1', '0', '0', '0', '0', '0'])).toBe('10000');
  });

  it('only whole numbers are saved', () => {
    for (const bad of ['1.5', '-1', '1e3', 'abc', ' ', '100000']) expect(keypadUnits(bad)).toBeNull();
  });

  it('+1 / −1', () => {
    expect(stepCount('', 1)).toBe('1');
    expect(stepCount('', -1)).toBe('');
    expect(stepCount('0', -1)).toBe('0');
    expect(stepCount('0', 1)).toBe('1');
    expect(stepCount('12', -1)).toBe('11');
    expect(stepCount(String(MAX_COUNT_UNITS), 1)).toBe(String(MAX_COUNT_UNITS));
    expect(stepCount('1.5', 1)).toBe('1.5');
  });
});

describe('Save & Next', () => {
  const arizona = groupSupplierProducts('sup6', products);
  const isCounted = (p: Product) => resolveSupplierWorkflow(p.supplierId).countStock;

  it('walks the open groups in screen order and skips collapsed groups', () => {
    const all = countingOrder(arizona, new Set(), isCounted);
    expect(all).toEqual(arizona.flatMap(g => g.products.map(p => p.id)));
    const collapsed = new Set(['size:20 oz. Tall Boy', 'size:23 oz. Big Can']);
    const open = countingOrder(arizona, collapsed, isCounted);
    expect(open).toHaveLength(all.length - 17 - 21);
    expect(open.some(id => products.find(p => p.id === id)!.size === '20 oz. Tall Boy')).toBe(false);
  });

  it("never includes Boar's Head", () => {
    expect(countingOrder(groupSupplierProducts('sup1', products), new Set(), isCounted)).toEqual([]);
  });

  it('moves to the next product only after a successful save', () => {
    const order = ['a', 'b', 'c'];
    const saved: number[] = [];
    const ok = (units: number) => (saved.push(units), { ok: true as const });
    expect(saveAndNext('5', 'a', order, ok)).toEqual({ saved: true, result: { ok: true }, nextId: 'b' });
    expect(saveAndNext('0', 'c', order, ok)).toEqual({ saved: true, result: { ok: true }, nextId: null });
    expect(saved).toEqual([5, 0]);
  });

  it('stays on the product on blank input or a refused save', () => {
    let calls = 0;
    const refused = () => (calls++, { ok: false as const, reason: 'blocked' });
    expect(saveAndNext('', 'a', ['a', 'b'], refused)).toEqual({ saved: false, result: null, nextId: 'a' });
    expect(calls).toBe(0);
    expect(saveAndNext('3', 'a', ['a', 'b'], refused)).toEqual({ saved: false, result: { ok: false, reason: 'blocked' }, nextId: 'a' });
    expect(calls).toBe(1);
  });

  it('next product', () => {
    expect(nextProductId(['a', 'b'], 'a')).toBe('b');
    expect(nextProductId(['a', 'b'], 'b')).toBeNull();
    expect(nextProductId(['a', 'b'], 'gone')).toBeNull();
  });
});
