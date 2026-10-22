// utils/orderPatterns.ts
//
// "How this store usually orders", from its own saved orders (utils/orderHistory.ts). This is a
// purchasing pattern, never a bestseller list: ordering 8 cases says nothing about selling 8 cases
// (they may still be in the back). Actual bestsellers need point-of-sale records.
//
// Only orders marked Sent count as confirmed. When none is marked Sent, the pattern can still be
// read from saved (prepared) orders, but it says so (`basis: 'saved'`).
import { HistoryEntry } from './orderHistory';
import { OrderUnit } from './supplierWorkflow';

export const PATTERN_WEEKS = 8;
const WEEK_MS = 7 * 86_400_000;

export interface ProductPattern {
  productId: string;
  name: string;
  flavor: string;
  size: string;
  unit: OrderUnit;
  /** Orders in the window that included this product. */
  orders: number;
  totalQuantity: number;
  /** Average quantity when it was ordered. */
  perOrder: number;
  /** Total over the window divided by the window's weeks. */
  perWeek: number;
  lastOrderedAt: string;
}

export interface SupplierPattern {
  supplierId: string;
  /** 'sent': confirmed orders only. 'saved': no order is marked Sent, so prepared ones are used. */
  basis: 'sent' | 'saved';
  ordersInWindow: number;
  weeks: number;
  /** The window actually covered: from the first order in it (at most PATTERN_WEEKS weeks). */
  products: ProductPattern[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const supplierPattern = (
  history: readonly HistoryEntry[],
  supplierId: string,
  now = new Date(),
  weeks = PATTERN_WEEKS,
): SupplierPattern | null => {
  const since = now.getTime() - weeks * WEEK_MS;
  const ofSupplier = history.filter(e => e.supplierId === supplierId && Date.parse(e.savedAt) >= since && Date.parse(e.savedAt) <= now.getTime());
  const sent = ofSupplier.filter(e => e.status === 'sent');
  const basis = sent.length ? 'sent' : 'saved';
  const entries = sent.length ? sent : ofSupplier;
  if (!entries.length) return null;
  // Weeks actually covered: a store with two weeks of history is not averaged over eight.
  const first = Math.min(...entries.map(e => Date.parse(e.sentAt ?? e.savedAt)));
  const covered = Math.max(1, Math.min(weeks, Math.ceil((now.getTime() - first) / WEEK_MS)));
  const byKey = new Map<string, ProductPattern>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const key = `${line.productId}|${line.unit}`;
      const current = byKey.get(key);
      if (current) {
        current.orders++;
        current.totalQuantity += line.quantity;
        if (entry.savedAt > current.lastOrderedAt) current.lastOrderedAt = entry.savedAt;
      } else {
        byKey.set(key, {
          productId: line.productId, name: line.name, flavor: line.flavor, size: line.size, unit: line.unit,
          orders: 1, totalQuantity: line.quantity, perOrder: 0, perWeek: 0, lastOrderedAt: entry.savedAt,
        });
      }
    }
  }
  const products = [...byKey.values()]
    .map(p => ({ ...p, perOrder: round1(p.totalQuantity / p.orders), perWeek: round1(p.totalQuantity / covered) }))
    .sort((a, b) => b.orders - a.orders || b.totalQuantity - a.totalQuantity || a.name.localeCompare(b.name));
  return { supplierId, basis, ordersInWindow: entries.length, weeks: covered, products };
};
