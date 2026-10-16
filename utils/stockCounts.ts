// utils/stockCounts.ts
//
// Verified physical stock counts. `inventory_stockCounts` is the only source of truth for stock
// that a person has actually counted. The old `currentStockUnits` values in `inventory_products`
// were seeded with random numbers, so they are never treated as counts and are never written
// again; they are only shown as "old" numbers.
//
// Rules:
// - Stock is counted in individual physical units (bottles, cans, bags), whole numbers only.
// - Unknown is not zero. A product nobody has counted is "not counted", even if its old number is 0.
// - Only verified counts can produce low-stock or out-of-stock warnings.
// - The two most recent counts per product are kept, newest first, each with its time.
// - When a product is deleted its counts move to `retired`, so a later product that happens to
//   get the same id never inherits them.

import { Product } from '../types';
import { SupplierWorkflow } from './supplierWorkflow';

export const STOCK_COUNTS_KEY = 'inventory_stockCounts';
export const STOCK_COUNTS_SCHEMA_VERSION = 1;
export const MAX_COUNTS_PER_PRODUCT = 2;
/** Larger numbers are almost certainly typing mistakes. */
export const MAX_COUNT_UNITS = 99_999;

/** How the count was taken. 'counter' is reserved for The Counter (C2). */
export type CountSource = 'classic' | 'confirmed-legacy' | 'counter';

export interface StockCount {
  /** Individual physical units on hand. Whole number, 0 or more. */
  units: number;
  /** When it was counted (ISO 8601, device clock). */
  countedAt: string;
  source: CountSource;
  /** The product's case size at the time, kept for context if the case size changes later. */
  unitsPerCaseAtCount: number;
}

export interface ProductCounts {
  /** Newest first. At most MAX_COUNTS_PER_PRODUCT. */
  counts: StockCount[];
}

export interface RetiredCounts {
  productId: string;
  retiredAt: string;
  counts: StockCount[];
}

export interface StockCountsDoc {
  schemaVersion: 1;
  products: Record<string, ProductCounts>;
  /** Counts of deleted products, kept hidden. Never matched to a product again. */
  retired?: RetiredCounts[];
}

export const emptyStockCounts = (): StockCountsDoc => ({ schemaVersion: STOCK_COUNTS_SCHEMA_VERSION, products: {} });

export const isValidCountUnits = (units: unknown): units is number =>
  typeof units === 'number' && Number.isInteger(units) && units >= 0 && units <= MAX_COUNT_UNITS;

/**
 * Reads what a person typed. Only plain whole numbers are accepted: blank, decimals, negative
 * numbers or anything else gives null (never 0).
 */
export const parseCountInput = (text: string): number | null => {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const units = Number(trimmed);
  return isValidCountUnits(units) ? units : null;
};

/** Returns a new document with `count` recorded as the product's newest count. Pure. */
export const withCount = (doc: StockCountsDoc, productId: string, count: StockCount): StockCountsDoc => {
  if (!isValidCountUnits(count.units)) throw new Error('A count must be a whole number of units, 0 or more.');
  const previous = doc.products[productId]?.counts ?? [];
  return {
    ...doc,
    products: {
      ...doc.products,
      [productId]: { ...doc.products[productId], counts: [count, ...previous].slice(0, MAX_COUNTS_PER_PRODUCT) },
    },
  };
};

/**
 * Moves a deleted product's counts out of `products` into `retired`. Returns the same document
 * when the product has no counts (nothing to write).
 */
export const retireProductCounts = (doc: StockCountsDoc, productId: string, retiredAt: string): StockCountsDoc => {
  const entry = doc.products[productId];
  if (!entry) return doc;
  const { [productId]: _removed, ...rest } = doc.products;
  return {
    ...doc,
    products: rest,
    retired: [...(doc.retired ?? []), { productId, retiredAt, counts: entry.counts.slice(0, MAX_COUNTS_PER_PRODUCT) }],
  };
};

/** Ids that must not be given to a new product: current products, and any id with count history. */
export const usedProductIds = (products: Pick<Product, 'id'>[], doc: StockCountsDoc): Set<string> =>
  new Set([...products.map(p => p.id), ...Object.keys(doc.products), ...(doc.retired ?? []).map(r => r.productId)]);

// --- What the screens show -----------------------------------------------------------------

export type StockView =
  /** Counted by a person. The only state that can show warnings. */
  | { state: 'verified'; units: number; countedAt: string; source: CountSource; previous: StockCount | null }
  /** Never counted. `legacyUnits` is the old, unverified number (may be 0, which means unknown). */
  | { state: 'unverified'; legacyUnits: number }
  /** The saved counts cannot be read right now. Nothing is shown as confirmed. */
  | { state: 'unavailable'; legacyUnits: number }
  /** This supplier's products are not stock-counted (Boar's Head). */
  | { state: 'not-tracked' };

export const getStockView = (
  product: Product,
  workflow: SupplierWorkflow,
  doc: StockCountsDoc,
  countsAvailable: boolean,
): StockView => {
  if (!workflow.countStock) return { state: 'not-tracked' };
  if (!countsAvailable) return { state: 'unavailable', legacyUnits: product.currentStockUnits };
  const [latest, previous] = doc.products[product.id]?.counts ?? [];
  if (!latest || !isValidCountUnits(latest.units)) return { state: 'unverified', legacyUnits: product.currentStockUnits };
  return { state: 'verified', units: latest.units, countedAt: latest.countedAt, source: latest.source, previous: previous ?? null };
};

export type StockWarning = 'out' | 'low' | null;

/** Warnings come only from verified counts. Unverified, unavailable and untracked stock never warn. */
export const stockWarning = (view: StockView, product: Pick<Product, 'reorderThresholdUnits'>): StockWarning => {
  if (view.state !== 'verified') return null;
  if (view.units <= 0) return 'out';
  if (view.units <= product.reorderThresholdUnits) return 'low';
  return null;
};

// --- Validation of the stored document -----------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MAX_REPORTED = 5;

const countProblems = (label: string, counts: unknown): string[] => {
  if (!Array.isArray(counts)) return [`${label} has no list of counts.`];
  const problems: string[] = [];
  counts.forEach((count, index) => {
    const where = `${label} count #${index + 1}`;
    if (!isObject(count)) problems.push(`${where} is not a record.`);
    else if (!isValidCountUnits(count.units)) problems.push(`${where} is not a whole number of units.`);
    else if (typeof count.countedAt !== 'string' || Number.isNaN(Date.parse(count.countedAt))) problems.push(`${where} has no valid time.`);
    else if (typeof count.source !== 'string') problems.push(`${where} has no source.`);
    else if (typeof count.unitsPerCaseAtCount !== 'number' || !Number.isFinite(count.unitsPerCaseAtCount)) {
      problems.push(`${where} has no case size.`);
    }
  });
  return problems;
};

/** Shape check for `inventory_stockCounts`. Extra fields are allowed and kept. */
export const validateStockCountsValue = (value: unknown): string[] => {
  if (!isObject(value)) return ['The stock counts are not a record.'];
  if (value.schemaVersion !== STOCK_COUNTS_SCHEMA_VERSION) {
    return [`The stock counts have an unsupported version (${String(value.schemaVersion)}).`];
  }
  if (!isObject(value.products)) return ['The stock counts have no product list.'];
  const problems: string[] = [];
  for (const [productId, entry] of Object.entries(value.products)) {
    if (problems.length >= MAX_REPORTED) break;
    if (!isObject(entry)) problems.push(`Stock counts for "${productId}" are not a record.`);
    else problems.push(...countProblems(`Product "${productId}"`, entry.counts));
  }
  if (value.retired !== undefined) {
    if (!Array.isArray(value.retired)) problems.push('The retired stock counts are not a list.');
    else {
      value.retired.forEach((entry, index) => {
        if (!isObject(entry) || typeof entry.productId !== 'string' || typeof entry.retiredAt !== 'string') {
          problems.push(`Retired stock counts #${index + 1} are not valid.`);
        } else problems.push(...countProblems(`Retired "${entry.productId}"`, entry.counts));
      });
    }
  }
  return problems.slice(0, MAX_REPORTED);
};

/** Number of products with at least one verified count (for the restore preview). */
export const countedProductCount = (raw: string | undefined | null): number | null => {
  if (raw === undefined || raw === null) return 0;
  try {
    const value = JSON.parse(raw);
    if (validateStockCountsValue(value).length > 0) return null;
    return Object.values((value as StockCountsDoc).products).filter(entry => entry.counts.length > 0).length;
  } catch {
    return null;
  }
};
