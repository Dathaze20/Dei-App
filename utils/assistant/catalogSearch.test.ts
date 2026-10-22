import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { Product, Supplier } from '../../types';
import { findSupplier, isRestricted, searchProducts } from './catalogSearch';

const RAW = JSON.parse(readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8')).raw;
const PRODUCTS: Product[] = JSON.parse(RAW.inventory_products);
const SUPPLIERS: Supplier[] = JSON.parse(RAW.inventory_suppliers);
const ids = (q: string, o = {}) => searchProducts(q, PRODUCTS, SUPPLIERS, o).products.map(p => p.id);

describe('catalog search on the real 141-product catalog', () => {
  it('"Arizona Green Tea" is ambiguous: the plain Green Tea sizes, then green teas that start that way; never Hard or Diet', () => {
    const found = ids('Arizona Green Tea');
    expect(found).toEqual(expect.arrayContaining(['az_gt_tb20', 'az_gt_bot16_9', 'az_gt_bot16', 'az_gt_jug128', 'az_gt_can23']));
    expect(found.some(id => id.includes('hard'))).toBe(false);
    expect(found.some(id => id.includes('diet'))).toBe(false);
    expect(found.indexOf('az_gt_can23')).toBeGreaterThan(found.indexOf('az_gt_bot16'));
  });

  it('a size narrows it to one', () => {
    expect(ids('arizona green tea 16.9 oz')).toEqual(['az_gt_bot16_9']);
    expect(ids('green tea tall boy')).toEqual(['az_gt_tb20']);
    expect(ids('green tea jug')).toEqual(['az_gt_jug128']);
  });

  it('"Fruit Punch" resolves to the one exact flavor, not Caution Extreme Fruit Punch or Hard Fruit Punch', () => {
    expect(ids('fruit punch')).toEqual(['az_fruitpunch_can23']);
  });

  it('"Pepsi" asks which one; "Diet Pepsi" is one', () => {
    expect(ids('pepsi')).toHaveLength(4);
    expect(ids('diet pepsi')).toEqual(['pep_diet_bot20']);
  });

  it('restricted (alcoholic) lines only when "hard" is said', () => {
    expect(isRestricted(PRODUCTS.find(p => p.id === 'az_hard_gt_can12')!)).toBe(true);
    expect(ids('hard green tea')).toEqual(expect.arrayContaining(['az_hard_gt_can12', 'az_hard_gt_can22']));
  });

  it('UPC and unknown words', () => {
    expect(ids('012000813329')).toEqual(['pep_diet_bot20']);
    expect(ids('unicorn soda')).toEqual([]);
  });

  it('can search only within the draft order', () => {
    expect(ids('green tea', { within: new Set(['az_gt_bot16', 'pep_orig_bot20']) })).toEqual(['az_gt_bot16']);
  });

  it('finds a supplier named in a sentence', () => {
    expect(findSupplier("what do we need for tomorrow's Arizona delivery", SUPPLIERS)?.id).toBe('sup6');
    expect(findSupplier('frito-lay order', SUPPLIERS)?.id).toBe('sup4');
    expect(findSupplier('nothing here', SUPPLIERS)).toBeNull();
  });
});
