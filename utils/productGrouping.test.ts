import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { Product, Supplier } from '../types';
import { countUnit, countUnitKey } from './countUnits';
import { translations } from '../contexts/LanguageContext';
import {
  LARGE_GROUP_SIZE,
  groupProducts,
  groupSupplierProducts,
  listSection,
  resolveGroupingMode,
  startsCollapsed,
} from './productGrouping';

// The real 141-product catalog exported in PR #1. No products or counts are invented here.
const REAL = JSON.parse(readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8')).raw as Record<string, string>;
const products: Product[] = JSON.parse(REAL.inventory_products);
const suppliers: Supplier[] = JSON.parse(REAL.inventory_suppliers);
const shape = (supplierId: string) =>
  groupSupplierProducts(supplierId, products).map(g => [g.title ?? g.titleKey, g.products.length]);
const ids = (supplierId: string) => groupSupplierProducts(supplierId, products).flatMap(g => g.products.map(p => p.id));

describe('grouping by supplier id', () => {
  it('Arizona is grouped by package size, smallest number first', () => {
    expect(shape('sup6')).toEqual([
      ['11.5 oz. Slim Can', 3],
      ['12 oz. Can', 10],
      ['16 oz. Bottle', 4],
      ['16.9 oz. Bottle', 5],
      ['20 oz. Tall Boy', 17],
      ['22 oz. Big Can', 8],
      ['22 oz. Can', 8],
      ['23 oz. Big Can', 21],
      ['23.5 oz. Big Can', 2],
      ['128 oz. Jug', 5],
      ['750ml Bottle', 1],
    ]);
  });

  it('PepsiCo and the snack suppliers are grouped by product line', () => {
    expect(shape('sup3')).toEqual([['Mountain Dew', 4], ['Pepsi', 4], ['Schweppes Seltzer', 7]]);
    expect(shape('sup4')).toEqual([['Cheetos', 1], ['Doritos', 14], ['Doritos Dinamita', 2], ['Lays', 2]]);
    expect(shape('sup8')).toEqual([['Wise', 2]]);
    expect(shape('sup9')).toEqual([['Utz', 2]]);
  });

  it("Boar's Head is MEATS then CHEESES, from the existing categories", () => {
    const groups = groupSupplierProducts('sup1', products);
    expect(groups.map(g => [g.titleKey, g.products.map(p => p.id)])).toEqual([
      ['meats', ['bh_ham', 'bh_turkey', 'bh_roastbeef']],
      ['cheeses', ['bh_american', 'bh_provolone']],
    ]);
    expect(groups.every(g => g.title === null)).toBe(true);
  });

  it('every other supplier falls back to category', () => {
    for (const id of ['sup2', 'sup5', 'sup7', 'sup10', 'sup11']) expect(resolveGroupingMode(id)).toBe('category');
    expect(shape('sup2')).toEqual([['Beverage', 5]]);
    expect(shape('sup10')).toEqual([['Energy Drink', 2]]);
    expect(groupSupplierProducts('sup12', products)).toEqual([]); // Fruit Guy has no products yet
    expect(resolveGroupingMode('sup_new_from_user')).toBe('category');
  });

  it('is decided by supplier id, not by a name a person can change', () => {
    const renamed = suppliers.map(s => (s.id === 'sup6' ? { ...s, name: 'AZ Beverages' } : s));
    expect(renamed.find(s => s.id === 'sup6')!.name).not.toBe('Arizona');
    expect(resolveGroupingMode('sup6')).toBe('size');
  });

  it('a later setting can override a supplier', () => {
    expect(resolveGroupingMode('sup6', { sup6: 'category' })).toBe('category');
    expect(groupSupplierProducts('sup6', products, { sup6: 'line' }).map(g => g.title)).toEqual([
      'Arizona',
      'Arizona Energy',
      'Arizona Hard',
      'Arizona RX Energy',
    ]);
  });

  it('every product of every supplier appears exactly once', () => {
    const all = suppliers.flatMap(s => ids(s.id)).sort();
    expect(all).toEqual(products.map(p => p.id).sort());
  });

  it('is deterministic: shuffled or reversed input gives the same groups and rows', () => {
    const reference = suppliers.map(s => groupSupplierProducts(s.id, products));
    let seed = 7;
    const shuffled = [...products].sort(() => ((seed = (seed * 9301 + 49297) % 233280) / 233280) - 0.5);
    expect(suppliers.map(s => groupSupplierProducts(s.id, shuffled))).toEqual(reference);
    expect(suppliers.map(s => groupSupplierProducts(s.id, [...products].reverse()))).toEqual(reference);
  });

  it('rows are ordered by name, then flavor', () => {
    const pepsi = groupSupplierProducts('sup3', products).find(g => g.title === 'Pepsi')!;
    expect(pepsi.products.map(p => p.flavor)).toEqual(['Diet Pepsi', 'Original', 'Wild Cherry', 'Zero Sugar']);
  });

  it('never changes the products it groups', () => {
    const before = JSON.stringify(products);
    suppliers.forEach(s => groupSupplierProducts(s.id, products));
    expect(JSON.stringify(products)).toBe(before);
  });

  it('products with nothing to group by go last under a translated "Other"', () => {
    const snapple = products.filter(p => p.supplierId === 'sup2');
    const groups = groupProducts([{ ...snapple[0], category: '  ' }, ...snapple.slice(1)], 'category');
    expect(groups.map(g => [g.title, g.titleKey, g.products.length])).toEqual([
      ['Beverage', null, 4],
      [null, 'other', 1],
    ]);
    expect(listSection({ category: 'Deli Salads' })).toBe('other');
  });

  it('group keys are unique within a supplier', () => {
    for (const s of suppliers) {
      const keys = groupSupplierProducts(s.id, products).map(g => g.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('large groups start collapsed', () => {
  it('only groups over 12 products, and never the only group', () => {
    const arizona = groupSupplierProducts('sup6', products);
    expect(arizona.filter(g => startsCollapsed(g, arizona.length)).map(g => g.title)).toEqual([
      '20 oz. Tall Boy',
      '23 oz. Big Can',
    ]);
    const doritos = groupSupplierProducts('sup4', products).find(g => g.title === 'Doritos')!;
    expect(doritos.products.length).toBeGreaterThan(LARGE_GROUP_SIZE);
    expect(startsCollapsed(doritos, 4)).toBe(true);
    expect(startsCollapsed(doritos, 1)).toBe(false);
  });
});

describe('count unit labels', () => {
  it('reads the unit from the real size texts', () => {
    const bySize = Object.fromEntries([...new Set(products.map(p => p.size))].sort().map(size => [size, countUnit({ size })]));
    expect(bySize).toEqual({
      '11.5 oz. Slim Can': 'cans',
      '12 oz. Can': 'cans',
      '128 oz. Jug': 'jugs',
      '12oz Can': 'cans',
      '16 oz. Bottle': 'bottles',
      '16.9 oz. Bottle': 'bottles',
      '16oz Bottle': 'bottles',
      '16oz Can': 'cans',
      '2.5oz Bag': 'bags',
      '2.75oz Bag': 'bags',
      '20 oz. Tall Boy': 'cans',
      '20oz Bottle': 'bottles',
      '22 oz. Big Can': 'cans',
      '22 oz. Can': 'cans',
      '23 oz. Big Can': 'cans',
      '23.5 oz. Big Can': 'cans',
      '3.25oz Bag': 'bags',
      '3oz Bag': 'bags',
      '750ml Bottle': 'bottles',
      '8.4oz Can': 'cans',
      'per lb': 'units', // Boar's Head is never counted; and never in pounds
    });
  });

  it('says "units" rather than guessing when the size does not say', () => {
    expect(countUnit({ size: '' })).toBe('units');
    expect(countUnit({ size: 'Canada Dry 12 pack' })).toBe('units');
  });

  it('every unit word exists in English, Spanish and Arabic', () => {
    for (const p of products) {
      const key = countUnitKey(p);
      for (const lang of ['en', 'es', 'ar'] as const) expect(translations[lang][key]).toMatch(/\S/);
    }
  });
});
