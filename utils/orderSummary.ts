// utils/orderSummary.ts
//
// One description of the current order, used by the order page and by the shared text (which is
// also what the QR code, Copy Text and Send as Text carry), so they can never disagree.
//
// Case suppliers: unchanged. Each line is "N case(s)" with the case price and a line total.
// Item suppliers (Boar's Head): plain "N name (flavor)" lines, no case wording and no dollar
// amounts. Lines saved before C1 for such a supplier keep meaning cases and say so.
// When any line is unpriced, the dollar figure is called a priced subtotal, never a total.

import { OrderItem, Product, Supplier } from '../types';
import {
  OrderUnit,
  SupplierWorkflow,
  isPricedLine,
  lineUnit,
  resolveSupplierWorkflow,
} from './supplierWorkflow';

export interface SummaryLine {
  item: OrderItem;
  product: Product;
  unit: OrderUnit;
  priced: boolean;
  /** Case price × quantity for priced lines; null for unpriced lines. */
  lineTotal: number | null;
  /** A case line saved before C1 for a supplier that is now ordered in items. */
  olderCaseLine: boolean;
}

export interface SummaryGroup {
  supplier: Supplier;
  workflow: SupplierWorkflow;
  lines: SummaryLine[];
  /** Sum of the priced lines; null when the group has none. */
  subtotal: number | null;
  hasUnpriced: boolean;
}

export interface OrderSummary {
  groups: SummaryGroup[];
  /** Sum of all priced lines. */
  pricedTotal: number;
  hasPriced: boolean;
  hasUnpriced: boolean;
}

export const buildOrderSummary = (
  items: OrderItem[],
  getProduct: (id: string) => Product | undefined,
  getSupplier: (id: string) => Supplier | undefined,
  resolve: (supplierId: string) => SupplierWorkflow = resolveSupplierWorkflow,
): OrderSummary => {
  const groups = new Map<string, SummaryGroup>();
  for (const item of items) {
    const product = getProduct(item.productId);
    if (!product) continue;
    const supplier = getSupplier(product.supplierId);
    if (!supplier) continue;
    let group = groups.get(supplier.id);
    if (!group) {
      group = { supplier, workflow: resolve(supplier.id), lines: [], subtotal: null, hasUnpriced: false };
      groups.set(supplier.id, group);
    }
    const unit = lineUnit(item);
    const priced = isPricedLine(group.workflow, item);
    group.lines.push({
      item,
      product,
      unit,
      priced,
      lineTotal: priced ? product.costPrice * item.quantity : null,
      olderCaseLine: group.workflow.orderStyle === 'items' && unit === 'case',
    });
  }
  const sorted = [...groups.values()].sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
  for (const group of sorted) {
    const priced = group.lines.filter(line => line.priced);
    group.subtotal = priced.length ? priced.reduce((total, line) => total + (line.lineTotal ?? 0), 0) : null;
    group.hasUnpriced = priced.length < group.lines.length;
  }
  return {
    groups: sorted,
    pricedTotal: sorted.reduce((total, group) => total + (group.subtotal ?? 0), 0),
    hasPriced: sorted.some(group => group.subtotal !== null),
    hasUnpriced: sorted.some(group => group.hasUnpriced),
  };
};

export type OrderTextKey =
  | 'order'
  | 'casesUnit'
  | 'total'
  | 'notPriced'
  | 'pricedSubtotal'
  | 'unpricedNote'
  | 'olderCaseLine';

export const getEmojiForColor = (colorClass: string): string => {
  const colorMap: { [key: string]: string } = {
    red: '🔴',
    orange: '🟠',
    amber: '🟠',
    yellow: '🟡',
    lime: '🟢',
    green: '🟢',
    emerald: '🟢',
    teal: '🔵',
    cyan: '🔵',
    blue: '🔵',
    indigo: '🟣',
    violet: '🟣',
    purple: '🟣',
    fuchsia: '💖',
    pink: '💖',
    rose: '💖',
    slate: '⚪️',
  };

  // e.g., 'bg-red-800' -> 'red'
  const colorNameMatch = colorClass.match(/bg-([a-z]+)-/);
  const colorName = colorNameMatch ? colorNameMatch[1] : '';
  return colorMap[colorName] || '▪️'; // Default to a black square
};

/**
 * The text shared by QR code, Copy Text and Send as Text. For an order with only priced case
 * lines it is exactly the text the app produced before C1.
 */
export const buildOrderText = (
  summary: OrderSummary,
  deliName: string,
  now: Date,
  t: (key: OrderTextKey) => string,
): string => {
  let text = `🧾 *${deliName.toUpperCase()} - ${t('order').toUpperCase()}* 🧾\n`;
  text += `****************************************\n`;
  text += `Date: ${now.toLocaleString()}\n\n`;

  summary.groups.forEach(group => {
    const emoji = getEmojiForColor(group.supplier.color);
    text += `----------------------------------------\n`;
    text += ` ${emoji} *${group.supplier.name.toUpperCase()}*\n`;
    text += `----------------------------------------\n`;
    let plainLines = false;
    group.lines.forEach(line => {
      const { item, product } = line;
      if (line.priced) {
        text += `› ${item.quantity} ${t('casesUnit')} - ${product.name} (${product.flavor})\n`;
        text += `  ($${product.costPrice.toFixed(2)}/case) .... $${(line.lineTotal ?? 0).toFixed(2)}\n\n`;
      } else if (line.unit === 'case') {
        text += `› ${item.quantity} ${t('casesUnit')} - ${product.name} (${product.flavor}) [${t('olderCaseLine')}]\n`;
        plainLines = true;
      } else {
        text += `› ${item.quantity} ${product.name} (${product.flavor})\n`;
        plainLines = true;
      }
    });
    if (plainLines) text += `\n`;
    if (group.subtotal !== null) text += `*${t('total')} $${group.subtotal.toFixed(2)}*\n`;
    if (group.hasUnpriced) text += `(${t('notPriced')})\n`;
    text += `----------------------------------------\n\n`;
  });

  text += `========================================\n`;
  if (!summary.hasUnpriced) {
    text += `    *${t('total').toUpperCase()} $${summary.pricedTotal.toFixed(2)}*\n`;
  } else {
    if (summary.hasPriced) text += `    *${t('pricedSubtotal').toUpperCase()} $${summary.pricedTotal.toFixed(2)}*\n`;
    text += `    ${t('unpricedNote')}\n`;
  }
  text += `========================================\n`;
  text += `Generated by DeliOrderNYC App`;
  return text;
};
