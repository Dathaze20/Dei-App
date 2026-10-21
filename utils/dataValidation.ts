// utils/dataValidation.ts
//
// Shape checks for the values DeliOrderNYC saves. They decide whether a stored value is safe for
// the app to load, and whether a backup is safe to restore.
//
// The checks are deliberately lenient: they only require what the existing screens actually rely
// on (for example `flavor.toLowerCase()` in search, `costPrice.toFixed()` on the order page).
// Extra or unknown fields are always allowed and always kept. A value that fails is never
// "repaired" or partially loaded: the whole key is treated as unreadable and left untouched.

import { KNOWN_STORAGE_KEYS } from './dataExport';
import { validateStockCountsValue } from './stockCounts';
import { ORDER_HISTORY_KEY, validateOrderHistoryValue } from './orderHistory';

export interface ValidationResult {
  ok: boolean;
  problems: string[];
}

const MAX_REPORTED = 5;

type Rule = (value: unknown) => boolean;
const isString: Rule = value => typeof value === 'string';
const isNonEmptyString: Rule = value => typeof value === 'string' && value.length > 0;
const isFiniteNumber: Rule = value => typeof value === 'number' && Number.isFinite(value);
const isOptionalString: Rule = value => value === undefined || typeof value === 'string';
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const PRODUCT_RULES: Record<string, Rule> = {
  id: isNonEmptyString,
  name: isString,
  category: isString,
  supplierId: isString,
  flavor: isString,
  size: isString,
  unitsPerCase: isFiniteNumber,
  costPrice: isFiniteNumber,
  retailPrice: isFiniteNumber,
  reorderThresholdUnits: isFiniteNumber,
  currentStockUnits: isFiniteNumber,
  imageUrl: isOptionalString,
  upc: isOptionalString,
};

const SUPPLIER_RULES: Record<string, Rule> = {
  id: isNonEmptyString,
  name: isString,
  color: isString,
};

const ORDER_ITEM_RULES: Record<string, Rule> = {
  productId: isNonEmptyString,
  quantity: isFiniteNumber,
  // Added in C1. Missing on all lines saved before C1 (they mean cases).
  unit: value => value === undefined || value === 'item' || value === 'case',
};

const checkRecords = (label: string, value: unknown, rules: Record<string, Rule>): string[] => {
  if (!Array.isArray(value)) return [`${label} is not a list.`];
  const problems: string[] = [];
  const seen = new Set<string>();
  value.forEach((record, index) => {
    if (problems.length >= MAX_REPORTED) return;
    if (!isObject(record)) {
      problems.push(`${label} #${index + 1} is not a record.`);
      return;
    }
    const bad = Object.keys(rules).filter(field => !rules[field](record[field]));
    if (bad.length > 0) {
      problems.push(`${label} #${index + 1} (${String(record.id ?? '?')}) has invalid ${bad.join(', ')}.`);
      return;
    }
    const id = record.id as string | undefined;
    if (id !== undefined) {
      if (seen.has(id)) problems.push(`${label} id "${id}" appears more than once.`);
      seen.add(id);
    }
  });
  return problems;
};

const result = (problems: string[]): ValidationResult => ({ ok: problems.length === 0, problems });

export const validateProducts = (value: unknown): ValidationResult => result(checkRecords('Product', value, PRODUCT_RULES));

export const validateSuppliers = (value: unknown): ValidationResult => result(checkRecords('Supplier', value, SUPPLIER_RULES));

export const validateOrder = (value: unknown): ValidationResult => {
  if (!isObject(value)) return result(['The order is not a record.']);
  const problems = checkRecords('Order line', value.items, ORDER_ITEM_RULES).map(p =>
    p === 'Order line is not a list.' ? 'The order has no list of items.' : p,
  );
  if (!isString(value.createdAt)) problems.push('The order has no creation date.');
  return result(problems);
};

export const validateStockCounts = (value: unknown): ValidationResult => result(validateStockCountsValue(value));

export const validateOrderHistory = (value: unknown): ValidationResult => result(validateOrderHistoryValue(value));

const JSON_VALIDATORS: Record<string, (value: unknown) => ValidationResult> = {
  [KNOWN_STORAGE_KEYS.stockCounts.key]: validateStockCounts,
  [KNOWN_STORAGE_KEYS.products.key]: validateProducts,
  [KNOWN_STORAGE_KEYS.suppliers.key]: validateSuppliers,
  [KNOWN_STORAGE_KEYS.currentOrder.key]: validateOrder,
  // Added in v0.1.3 (utils/orderHistory.ts). Older backups do not have it; older app versions
  // keep and restore it as an unknown app key.
  [ORDER_HISTORY_KEY]: validateOrderHistory,
};

/** True for keys whose stored text must be JSON of a specific shape. */
export const isValidatedKey = (key: string): boolean => key in JSON_VALIDATORS;

/**
 * Checks the exact stored text of one key. Keys without a specific shape (deli name, theme,
 * language, unknown app keys) are plain text and always valid.
 */
export const validateStoredValue = (key: string, raw: string): ValidationResult => {
  const validate = JSON_VALIDATORS[key];
  if (!validate) return result([]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return result(['The saved text is not valid JSON.']);
  }
  return validate(parsed);
};
