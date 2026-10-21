// utils/attention.ts
//
// "Needs attention" for one supplier, without guessing: which counted products are
//   low     verified count at or below the reorder point (0 = out);
//   never   never counted by a person (an old, unverified number does not count);
//   stale   last counted STALE_DAYS or more days ago.
// Every reason comes from a verified count and the product's own reorder point; nothing is
// estimated, and nothing says how much to order. Unavailable counts produce no list at all.
import { Product } from '../types';
import { StockView, stockWarning } from './stockCounts';

export const STALE_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

export type AttentionReason =
  | { kind: 'out'; units: number; reorderAt: number; countedAt: string }
  | { kind: 'low'; units: number; reorderAt: number; countedAt: string }
  | { kind: 'never' }
  | { kind: 'stale'; units: number; days: number; countedAt: string };

export interface AttentionItem {
  product: Product;
  reason: AttentionReason;
}

const RANK: Record<AttentionReason['kind'], number> = { out: 0, low: 1, never: 2, stale: 3 };

/** Products needing attention, most urgent first (out, low, never counted, stale). */
export const attentionList = (
  products: readonly Product[],
  getStock: (product: Product) => StockView,
  now = new Date(),
): AttentionItem[] => {
  const items: AttentionItem[] = [];
  for (const product of products) {
    const view = getStock(product);
    if (view.state === 'not-tracked' || view.state === 'unavailable') continue;
    if (view.state === 'unverified') {
      items.push({ product, reason: { kind: 'never' } });
      continue;
    }
    const warning = stockWarning(view, product);
    if (warning) {
      items.push({ product, reason: { kind: warning, units: view.units, reorderAt: product.reorderThresholdUnits, countedAt: view.countedAt } });
      continue;
    }
    const days = Math.floor((now.getTime() - Date.parse(view.countedAt)) / DAY);
    if (days >= STALE_DAYS) items.push({ product, reason: { kind: 'stale', units: view.units, days, countedAt: view.countedAt } });
  }
  return items.sort((a, b) => RANK[a.reason.kind] - RANK[b.reason.kind]);
};

export const attentionTotals = (items: readonly AttentionItem[]) => ({
  low: items.filter(i => i.reason.kind === 'low' || i.reason.kind === 'out').length,
  never: items.filter(i => i.reason.kind === 'never').length,
  stale: items.filter(i => i.reason.kind === 'stale').length,
});
