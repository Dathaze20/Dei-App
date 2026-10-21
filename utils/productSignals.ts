// utils/productSignals.ts
//
// What the app can honestly say about how a product moves, each with its own label, never mixed:
//   frequently-reordered  it is in several saved orders (ordering is not selling);
//   often-low             its latest verified count is at or below its reorder point;
//   movement-estimate     verified counts went down between two counts (deliveries in between are
//                         not known, so this is a lower bound of what left the shelf, not sales);
//   bestseller            needs real sales records (a point-of-sale feed). The app has none, so it
//                         always says "not known" instead of guessing.
import { Product } from '../types';
import { HistoryEntry } from './orderHistory';
import { StockView, stockWarning } from './stockCounts';

export const FREQUENT_ORDERS = 3;

export type ProductSignal =
  | { kind: 'frequently-reordered'; orders: number }
  | { kind: 'often-low' }
  | { kind: 'movement-estimate'; units: number; days: number }
  | { kind: 'bestseller-unknown' };

export const productSignals = (product: Product, history: readonly HistoryEntry[], view: StockView): ProductSignal[] => {
  const signals: ProductSignal[] = [];
  const orders = history.filter(entry => entry.lines.some(line => line.productId === product.id)).length;
  if (orders >= FREQUENT_ORDERS) signals.push({ kind: 'frequently-reordered', orders });
  if (view.state === 'verified') {
    if (stockWarning(view, product)) signals.push({ kind: 'often-low' });
    const previous = view.previous;
    if (previous && previous.units > view.units) {
      const days = Math.max(1, Math.round((Date.parse(view.countedAt) - Date.parse(previous.countedAt)) / 86_400_000));
      signals.push({ kind: 'movement-estimate', units: previous.units - view.units, days });
    }
  }
  signals.push({ kind: 'bestseller-unknown' });
  return signals;
};
