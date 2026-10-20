// utils/productGrouping.ts
//
// How one supplier's products are grouped on screen, decided by supplier id (never by the
// supplier's display name, which a person can change):
//
//   Arizona (sup6)                 by package size ("23 oz. Big Can", "16.9 oz. Bottle", …)
//   PepsiCo, Frito-Lay, Wise, Utz  by product line (the product name: "Pepsi", "Doritos", …)
//   Boar's Head (sup1)             MEATS, then CHEESES, then anything else
//   everyone else                  by category
//
// Group order and row order are deterministic: the same products always give the same screen.
// The defaults live in code and are never written to storage; a later settings screen can pass
// per-supplier overrides.
//
// Classic View keeps its own grouping (pages/HomePage.tsx) and is not changed by this module.

import { Product } from '../types';

export type GroupingMode = 'size' | 'line' | 'category' | 'meats-cheeses';

const BUILT_IN_GROUPING: Readonly<Record<string, GroupingMode>> = {
  sup1: 'meats-cheeses', // Boar's Head
  sup3: 'line', // PepsiCo
  sup4: 'line', // Frito-Lay
  sup6: 'size', // Arizona
  sup8: 'line', // Wise Foods
  sup9: 'line', // Utz
};

export type GroupingOverrides = Readonly<Record<string, GroupingMode>>;

export const resolveGroupingMode = (supplierId: string, overrides: GroupingOverrides = {}): GroupingMode =>
  overrides[supplierId] ?? BUILT_IN_GROUPING[supplierId] ?? 'category';

/** Boar's Head sections. Read from the product's category, so no product data changes. */
export type ListSection = 'meats' | 'cheeses' | 'other';

export const listSection = (product: Pick<Product, 'category'>): ListSection => {
  if (/meat/i.test(product.category)) return 'meats';
  if (/cheese/i.test(product.category)) return 'cheeses';
  return 'other';
};

const SECTION_ORDER: readonly ListSection[] = ['meats', 'cheeses', 'other'];

export interface ProductGroup {
  /** Stable id, unique within one supplier: `${mode}:${title}` or `section:meats`. */
  key: string;
  /** The text shown, taken from the product data. Null when the title is a translated word. */
  title: string | null;
  /** Set for a translated title: a Boar's Head section, or products with no group value. */
  titleKey: ListSection | null;
  products: Product[];
}

// Locale-independent so the order is the same in English, Spanish and Arabic. Numeric, so
// "11.5 oz." comes before "128 oz.".
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const compareText = (a: string, b: string): number => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

/** Row order inside a group: name, then flavor, then size, then id. Never depends on input order. */
export const compareProducts = (a: Product, b: Product): number =>
  compareText(a.name, b.name) ||
  compareText(a.flavor ?? '', b.flavor ?? '') ||
  compareText(a.size ?? '', b.size ?? '') ||
  compareText(a.id, b.id);

const groupValue = (product: Product, mode: Exclude<GroupingMode, 'meats-cheeses'>): string => {
  const value = mode === 'size' ? product.size : mode === 'line' ? product.name : product.category;
  return (value ?? '').trim();
};

/** Groups one supplier's products. Empty groups are never returned. */
export const groupProducts = (products: Product[], mode: GroupingMode): ProductGroup[] => {
  if (mode === 'meats-cheeses') {
    return SECTION_ORDER.map(section => ({
      key: `section:${section}`,
      title: null,
      titleKey: section,
      products: products.filter(p => listSection(p) === section).sort(compareProducts),
    })).filter(group => group.products.length > 0);
  }
  const byValue = new Map<string, Product[]>();
  for (const product of products) {
    const value = groupValue(product, mode);
    const list = byValue.get(value);
    if (list) list.push(product);
    else byValue.set(value, [product]);
  }
  const named = [...byValue.keys()].filter(value => value !== '').sort(compareText);
  const groups: ProductGroup[] = named.map(value => ({
    key: `${mode}:${value}`,
    title: value,
    titleKey: null,
    products: byValue.get(value)!.sort(compareProducts),
  }));
  // Products with nothing to group by go last, under a translated "Other".
  const ungrouped = byValue.get('');
  if (ungrouped) groups.push({ key: `${mode}:`, title: null, titleKey: 'other', products: ungrouped.sort(compareProducts) });
  return groups;
};

/** Groups the products of one supplier with that supplier's grouping mode. */
export const groupSupplierProducts = (
  supplierId: string,
  allProducts: Product[],
  overrides: GroupingOverrides = {},
): ProductGroup[] =>
  groupProducts(
    allProducts.filter(p => p.supplierId === supplierId),
    resolveGroupingMode(supplierId, overrides),
  );

export const LARGE_GROUP_SIZE = 12;

/** Large groups start collapsed so the list stays short, unless the group is the only one. */
export const startsCollapsed = (group: Pick<ProductGroup, 'products'>, groupCount: number): boolean =>
  groupCount > 1 && group.products.length > LARGE_GROUP_SIZE;
