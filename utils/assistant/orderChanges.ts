// utils/assistant/orderChanges.ts
//
// Changes to the draft order as one validated, all-or-nothing step, with an exact undo. Used by
// the assistant's tools; the screens keep their own buttons, and both end in the one saved order
// (InventoryContext.editOrderItems). Nothing here can share or send an order.
//
// Every change names a real catalog product and the line's unit (cases, or items for item
// suppliers). Quantities are whole numbers 1–999. If any change is invalid, nothing is applied.
import { OrderItem, Product } from '../../types';
import { OrderUnit, lineUnit } from '../supplierWorkflow';

export const MAX_LINE_QUANTITY = 999;

export type OrderChange =
  | { op: 'add'; productId: string; quantity: number }
  | { op: 'set'; productId: string; quantity: number }
  | { op: 'remove'; productId: string };

export interface ChangeLine {
  productId: string;
  unit: OrderUnit;
  before: number;
  after: number;
}

export type PlanResult =
  | { ok: true; items: OrderItem[]; lines: ChangeLine[] }
  | { ok: false; reason: 'unknown-product' | 'bad-quantity' | 'not-in-order' | 'nothing'; productId?: string };

export const isValidQuantity = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_LINE_QUANTITY;

const quantityOf = (items: readonly OrderItem[], productId: string, unit: OrderUnit) =>
  items.find(i => i.productId === productId && lineUnit(i) === unit)?.quantity ?? 0;

const withQuantity = (items: readonly OrderItem[], productId: string, unit: OrderUnit, quantity: number): OrderItem[] => {
  const index = items.findIndex(i => i.productId === productId && lineUnit(i) === unit);
  if (quantity <= 0) return index < 0 ? [...items] : items.filter((_, i) => i !== index);
  if (index >= 0) return items.map((item, i) => (i === index ? { ...item, quantity } : item));
  // Case lines keep the pre-C1 shape (no unit field).
  return [...items, unit === 'item' ? { productId, quantity, unit: 'item' } : { productId, quantity }];
};

/** Checks and applies every change, or none. Pure. */
export const planOrderChanges = (
  items: readonly OrderItem[],
  changes: readonly OrderChange[],
  products: readonly Product[],
  unitFor: (product: Product) => OrderUnit,
): PlanResult => {
  if (!changes.length) return { ok: false, reason: 'nothing' };
  let next = [...items];
  const touched = new Map<string, ChangeLine>();
  for (const change of changes) {
    const product = products.find(p => p.id === change.productId);
    if (!product) return { ok: false, reason: 'unknown-product', productId: change.productId };
    const unit = unitFor(product);
    const current = quantityOf(next, product.id, unit);
    let after: number;
    if (change.op === 'remove') {
      if (current === 0) return { ok: false, reason: 'not-in-order', productId: product.id };
      after = 0;
    } else {
      if (!isValidQuantity(change.quantity)) return { ok: false, reason: 'bad-quantity', productId: product.id };
      after = change.op === 'add' ? current + change.quantity : change.quantity;
      if (after > MAX_LINE_QUANTITY) return { ok: false, reason: 'bad-quantity', productId: product.id };
    }
    next = withQuantity(next, product.id, unit, after);
    const key = `${product.id}|${unit}`;
    const line = touched.get(key) ?? { productId: product.id, unit, before: quantityOf(items, product.id, unit), after };
    touched.set(key, { ...line, after });
  }
  const lines = [...touched.values()].filter(l => l.before !== l.after);
  if (!lines.length) return { ok: false, reason: 'nothing' };
  return { ok: true, items: next, lines };
};

/**
 * Puts the touched lines back as they were. Only when each is still exactly as the change left
 * it; otherwise null (something else changed it since, and it is left alone).
 */
export const undoOrderChanges = (items: readonly OrderItem[], lines: readonly ChangeLine[]): OrderItem[] | null => {
  if (lines.some(l => quantityOf(items, l.productId, l.unit) !== l.after)) return null;
  return lines.reduce<OrderItem[]>((acc, l) => withQuantity(acc, l.productId, l.unit, l.before), [...items]);
};
