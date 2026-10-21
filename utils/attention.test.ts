import { describe, expect, it } from 'vitest';
import { Product } from '../types';
import { StockView } from './stockCounts';
import { attentionList, attentionTotals, STALE_DAYS } from './attention';

const product = (id: string, reorderThresholdUnits = 12) => ({ id, name: id, flavor: '', reorderThresholdUnits }) as Product;
const now = new Date('2026-10-21T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const verified = (units: number, countedAt = daysAgo(1)): StockView => ({ state: 'verified', units, countedAt, source: 'counter', previous: null });

describe('needs attention', () => {
  it('lists out, low, never counted and stale products, most urgent first, from verified counts only', () => {
    const views: Record<string, StockView> = {
      fine: verified(30),
      low: verified(8),
      out: verified(0),
      never: { state: 'unverified', legacyUnits: 40 },
      stale: verified(30, daysAgo(STALE_DAYS + 2)),
      untracked: { state: 'not-tracked' },
    };
    const items = attentionList(Object.keys(views).map(id => product(id)), p => views[p.id], now);
    expect(items.map(i => i.product.id)).toEqual(['out', 'low', 'never', 'stale']);
    expect(items[1].reason).toMatchObject({ kind: 'low', units: 8, reorderAt: 12 });
    expect(items[3].reason).toMatchObject({ kind: 'stale', days: STALE_DAYS + 2 });
    expect(attentionTotals(items)).toEqual({ low: 2, never: 1, stale: 1 });
  });

  it('an old unverified number never counts as stock, and unreadable counts give no list', () => {
    expect(attentionList([product('a')], () => ({ state: 'unverified', legacyUnits: 0 }), now)[0].reason.kind).toBe('never');
    expect(attentionList([product('a')], () => ({ state: 'unavailable', legacyUnits: 5 }), now)).toEqual([]);
  });

  it('a recent count above the reorder point needs nothing', () => {
    expect(attentionList([product('a', 12)], () => verified(13, daysAgo(STALE_DAYS - 1)), now)).toEqual([]);
  });
});
