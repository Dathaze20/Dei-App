import { describe, expect, it } from 'vitest';
import { Product } from '../types';
import { HistoryEntry } from './orderHistory';
import { productSignals } from './productSignals';

const product = { id: 'p', reorderThresholdUnits: 6 } as Product;
const entry = (ids: string[]) => ({ lines: ids.map(productId => ({ productId })) }) as unknown as HistoryEntry;
const count = (units: number, countedAt: string) => ({ units, countedAt, source: 'counter' as const, unitsPerCaseAtCount: 12 });

describe('product signals are labelled for what they are', () => {
  it('reordering, verified low stock and count movement are separate; bestseller is never guessed', () => {
    const history = [entry(['p']), entry(['p', 'q']), entry(['p']), entry(['q'])];
    const view = { state: 'verified' as const, units: 4, countedAt: '2026-10-21T00:00:00Z', source: 'counter' as const, previous: count(16, '2026-10-14T00:00:00Z') };
    expect(productSignals(product, history, view)).toEqual([
      { kind: 'frequently-reordered', orders: 3 },
      { kind: 'often-low' },
      { kind: 'movement-estimate', units: 12, days: 7 },
      { kind: 'bestseller-unknown' },
    ]);
  });

  it('unverified stock gives no stock or movement signal', () => {
    expect(productSignals(product, [], { state: 'unverified', legacyUnits: 2 })).toEqual([{ kind: 'bestseller-unknown' }]);
  });
});
