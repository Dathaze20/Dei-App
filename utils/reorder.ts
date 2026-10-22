// utils/reorder.ts
//
// Reorder suggestions that show their working. Deterministic, no AI: the same inputs always give
// the same answer, and every answer lists what it assumed.
//
//   'calculated'  delivery days, a weekly baseline and a FRESH verified count are all known:
//                 cases = ceil((rate × days until the delivery after next + keep-on-hand − on hand)
//                         ÷ units per case)
//                 where the order arriving at the next delivery has to last until the one after.
//   'typical'     no fresh verified count: the store's usual quantity for one delivery cycle, from
//                 the owner's estimate (or record). Labelled: stock was not checked.
//   'unknown'     no weekly baseline: nothing is proposed; the missing facts are listed.
//
// A visible count from a shelf photo is not total stock; only a verified count is used here.
import { Product } from '../types';
import { StockView } from './stockCounts';
import { Fact, ProductProfile, Weekday, daysToNextDelivery, deliveryCycleDays } from './storeProfile';

/** A verified count older than this is not trusted for a calculation. */
export const FRESH_COUNT_HOURS = 48;

export type Missing = 'baseline' | 'delivery-days' | 'fresh-count';

export interface Proposal {
  productId: string;
  kind: 'calculated' | 'typical' | 'unknown';
  /** Whole cases (or items). null when nothing can be proposed. */
  cases: number | null;
  missing: Missing[];
  /** What the number rests on, for "Show why". */
  basis: {
    weekly?: Fact<number>;
    unitsPerCase: number;
    unitsPerCaseSource: 'catalog' | 'store';
    onHand?: { units: number; countedAt: string };
    keepOnHand?: number;
    daysUntilDelivery?: number;
    cycleDays: number;
  };
}

export const proposeReorder = (
  product: Product,
  stock: StockView,
  profile: ProductProfile | undefined,
  deliveryDays: readonly Weekday[] | undefined,
  now = new Date(),
): Proposal => {
  const weekly = profile?.weeklyCases;
  const storeCase = profile?.unitsPerCase?.value;
  const unitsPerCase = storeCase ?? product.unitsPerCase;
  const untilDelivery = daysToNextDelivery(deliveryDays, now);
  const cycle = untilDelivery === null ? 7 : deliveryCycleDays(deliveryDays, (now.getDay() + untilDelivery) % 7) ?? 7;
  const fresh = stock.state === 'verified' && now.getTime() - Date.parse(stock.countedAt) <= FRESH_COUNT_HOURS * 3_600_000;
  const missing: Missing[] = [];
  if (!weekly) missing.push('baseline');
  if (untilDelivery === null) missing.push('delivery-days');
  if (!fresh) missing.push('fresh-count');
  const basis: Proposal['basis'] = { weekly, unitsPerCase, unitsPerCaseSource: storeCase ? 'store' : 'catalog', cycleDays: cycle };
  if (!weekly || unitsPerCase < 1) return { productId: product.id, kind: 'unknown', cases: null, missing, basis };

  if (fresh && untilDelivery !== null && stock.state === 'verified') {
    const keep = profile?.reorderAtUnits?.value ?? product.reorderThresholdUnits;
    const ratePerDay = (weekly.value * unitsPerCase) / 7;
    const need = ratePerDay * (untilDelivery + cycle) + keep - stock.units;
    return {
      productId: product.id,
      kind: 'calculated',
      cases: Math.max(0, Math.ceil(need / unitsPerCase)),
      missing,
      basis: { ...basis, onHand: { units: stock.units, countedAt: stock.countedAt }, keepOnHand: keep, daysUntilDelivery: untilDelivery },
    };
  }
  // The usual order for one delivery cycle; at least 1 when the store orders it at all.
  const typical = Math.max(weekly.value > 0 ? 1 : 0, Math.round((weekly.value * cycle) / 7));
  return { productId: product.id, kind: 'typical', cases: typical, missing, basis: { ...basis, daysUntilDelivery: untilDelivery ?? undefined } };
};
