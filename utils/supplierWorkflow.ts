// utils/supplierWorkflow.ts
//
// How each supplier is ordered from and whether its products take part in verified stock
// counting. Suppliers do not all work the same way: most are ordered in cases and their products
// are counted on the shelf, but Boar's Head is a weekly list of meats and cheeses read to the
// rep, with no stock counting, no case wording and no prices.
//
// Every place in the app asks this one resolver. The defaults live here in code and are never
// written to storage. A future settings screen can pass per-supplier overrides without any
// other code changing.

import { OrderItem } from '../types';

export type OrderStyle = 'cases' | 'items';

export interface SupplierWorkflow {
  /** Products of this supplier take part in verified physical-unit stock counting. */
  countStock: boolean;
  /** 'cases': priced case orders. 'items': a plain whole-number list with no case wording or prices. */
  orderStyle: OrderStyle;
}

export const DEFAULT_WORKFLOW: SupplierWorkflow = { countStock: true, orderStyle: 'cases' };

/** Built-in defaults by supplier id. `sup1` is the built-in Boar's Head supplier. */
const BUILT_IN_WORKFLOWS: Readonly<Record<string, SupplierWorkflow>> = {
  sup1: { countStock: false, orderStyle: 'items' },
};

export type SupplierWorkflowOverrides = Readonly<Record<string, Partial<SupplierWorkflow>>>;

export const resolveSupplierWorkflow = (
  supplierId: string | undefined,
  overrides: SupplierWorkflowOverrides = {},
): SupplierWorkflow => {
  if (!supplierId) return DEFAULT_WORKFLOW;
  return { ...DEFAULT_WORKFLOW, ...BUILT_IN_WORKFLOWS[supplierId], ...overrides[supplierId] };
};

// --- Order line units -----------------------------------------------------------------------

/**
 * What an order line's quantity means. Lines saved before C1 have no `unit` field and have
 * always meant cases, so a missing unit is read as 'case' and never reinterpreted.
 */
export type OrderUnit = 'case' | 'item';

export const lineUnit = (item: Pick<OrderItem, 'unit'>): OrderUnit => (item.unit === 'item' ? 'item' : 'case');

/** The unit a newly added line gets for this supplier. */
export const newLineUnit = (workflow: SupplierWorkflow): OrderUnit => (workflow.orderStyle === 'items' ? 'item' : 'case');

/**
 * A line is priced only when its supplier is ordered in cases and the line is a case line.
 * Lines of an 'items' supplier are never priced, including its older case lines: the catalog
 * prices for those products are placeholders, not real prices.
 */
export const isPricedLine = (workflow: SupplierWorkflow, item: Pick<OrderItem, 'unit'>): boolean =>
  workflow.orderStyle === 'cases' && lineUnit(item) === 'case';
