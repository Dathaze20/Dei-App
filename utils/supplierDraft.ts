// utils/supplierDraft.ts
//
// One supplier's part of the current order. There is still exactly one saved order
// (inventory_currentOrder); a supplier's "draft" is only a filtered view of it, so nothing is
// stored twice and a change to one supplier can never touch another supplier's lines.
// Totals and text come from buildOrderSummary / buildOrderText, so they match the order page.

import { OrderItem, Product, Supplier } from '../types';
import { OrderSummary, OrderTextKey, SummaryGroup, buildOrderSummary, buildOrderText } from './orderSummary';
import { compareProducts, listSection, ListSection } from './productGrouping';
import { OrderUnit, SupplierWorkflow, lineUnit, resolveSupplierWorkflow } from './supplierWorkflow';

type GetProduct = (id: string) => Product | undefined;
type GetSupplier = (id: string) => Supplier | undefined;

/** The saved order lines that belong to one supplier, in their saved order. */
export const supplierDraftItems = (items: OrderItem[], supplierId: string, getProduct: GetProduct): OrderItem[] =>
  items.filter(item => getProduct(item.productId)?.supplierId === supplierId);

/** Number of order lines per supplier id (for a badge on each supplier). */
export const draftLineCounts = (items: OrderItem[], getProduct: GetProduct): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const supplierId = getProduct(item.productId)?.supplierId;
    if (supplierId) counts[supplierId] = (counts[supplierId] ?? 0) + 1;
  }
  return counts;
};

/** The summary of one supplier's lines: at most one group. */
export const supplierDraftSummary = (
  items: OrderItem[],
  supplierId: string,
  getProduct: GetProduct,
  getSupplier: GetSupplier,
  resolve: (supplierId: string) => SupplierWorkflow = resolveSupplierWorkflow,
): OrderSummary => buildOrderSummary(supplierDraftItems(items, supplierId, getProduct), getProduct, getSupplier, resolve);

/** The usual shared order text, for one supplier only (QR, Copy Text, Send as Text). */
export const supplierDraftText = (
  items: OrderItem[],
  supplierId: string,
  getProduct: GetProduct,
  getSupplier: GetSupplier,
  deliName: string,
  now: Date,
  t: (key: OrderTextKey) => string,
): string => buildOrderText(supplierDraftSummary(items, supplierId, getProduct, getSupplier), deliName, now, t);

/** Quantity of one product's line in one unit; 0 when there is no such line. */
export const lineQuantity = (items: OrderItem[], productId: string, unit: OrderUnit): number =>
  items.find(item => item.productId === productId && lineUnit(item) === unit)?.quantity ?? 0;

// --- Item lists (Boar's Head) ----------------------------------------------------------------

export interface ChecklistRow {
  product: Product;
  /** The product has an item line in the saved order. */
  selected: boolean;
  /** Whole-number quantity of the item line; 0 when not selected. */
  quantity: number;
  /** Quantity of a case line saved before C1 for this product; 0 when there is none. */
  olderCaseQuantity: number;
}

/**
 * The selection state of each product of an item-ordered supplier, read from the saved order.
 * Selecting, changing and clearing use the existing order functions (addToOrder,
 * updateOrderItemQuantity, removeFromOrder with unit 'item'); nothing else is stored.
 */
export const checklistRows = (products: Product[], items: OrderItem[]): ChecklistRow[] =>
  products.map(product => {
    const quantity = lineQuantity(items, product.id, 'item');
    return { product, selected: quantity > 0, quantity, olderCaseQuantity: lineQuantity(items, product.id, 'case') };
  });

export type ItemListTextKey = OrderTextKey | 'listMeats' | 'listCheeses' | 'listOther';

const SECTION_KEYS: Readonly<Record<ListSection, ItemListTextKey>> = {
  meats: 'listMeats',
  cheeses: 'listCheeses',
  other: 'listOther',
};

/**
 * A short list to read aloud to the rep, copy or text: the supplier's lines in MEATS, CHEESES,
 * then anything else, as "- 2 Provolone Cheese (Mild)". No prices, no dates, no emoji.
 * A case line saved before C1 still says it is in cases. Returns null when there are no lines.
 */
export const buildItemListText = (
  group: SummaryGroup | undefined,
  deliName: string,
  t: (key: ItemListTextKey) => string,
): string | null => {
  if (!group || group.lines.length === 0) return null;
  const lines = [...group.lines].sort((a, b) => compareProducts(a.product, b.product));
  let text = `${deliName.toUpperCase()}\n${group.supplier.name.toUpperCase()} - ${t('order').toUpperCase()}\n`;
  for (const section of ['meats', 'cheeses', 'other'] as const) {
    const inSection = lines.filter(line => listSection(line.product) === section);
    if (inSection.length === 0) continue;
    text += `\n${t(SECTION_KEYS[section]).toUpperCase()}\n`;
    for (const { item, product, unit } of inSection) {
      const name = product.flavor ? `${product.name} (${product.flavor})` : product.name;
      text += unit === 'case'
        ? `- ${item.quantity} ${t('casesUnit')} ${name} [${t('olderCaseLine')}]\n`
        : `- ${item.quantity} ${name}\n`;
    }
  }
  return text.trimEnd();
};
