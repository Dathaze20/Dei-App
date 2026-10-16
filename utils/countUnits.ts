// utils/countUnits.ts
//
// What one counted unit is called, read from the product's size text ("23 oz. Big Can" → cans).
// Counts are always physical units on the shelf, never cases and never pounds. When the size text
// does not say, the plain word "units" is used rather than a guess.

import { Product } from '../types';

export type CountUnit = 'cans' | 'bottles' | 'bags' | 'jugs' | 'units';

const RULES: readonly [RegExp, CountUnit][] = [
  [/\bcans?\b|\btall\s*boys?\b/i, 'cans'],
  [/\bbottles?\b/i, 'bottles'],
  [/\bbags?\b/i, 'bags'],
  [/\bjugs?\b/i, 'jugs'],
];

export const countUnit = (product: Pick<Product, 'size'>): CountUnit => {
  const size = product.size ?? '';
  for (const [pattern, unit] of RULES) if (pattern.test(size)) return unit;
  return 'units';
};

/** Translation key for the unit word (see contexts/LanguageContext.tsx). */
export type CountUnitKey = 'countUnitCans' | 'countUnitBottles' | 'countUnitBags' | 'countUnitJugs' | 'countUnitUnits';

const KEYS: Readonly<Record<CountUnit, CountUnitKey>> = {
  cans: 'countUnitCans',
  bottles: 'countUnitBottles',
  bags: 'countUnitBags',
  jugs: 'countUnitJugs',
  units: 'countUnitUnits',
};

export const countUnitKey = (product: Pick<Product, 'size'>): CountUnitKey => KEYS[countUnit(product)];
