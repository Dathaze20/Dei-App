// utils/rowText.ts
//
// What a product row says, without repeating what is already on the screen:
//   primary    the flavor when there is one (it tells "Fruit Punch" from "Caution" in one size),
//              otherwise the name;
//   secondary  the rest: the product line without the supplier's name ("RX Energy", not
//              "Arizona RX Energy", when Arizona is chosen), and the size unless the chosen
//              filter is that size.
// Nothing is cut: the full text wraps, and the product sheet shows the stored name unchanged.
import { Product } from '../types';

export type GroupedBy = 'line' | 'size' | 'other';

/** "Arizona RX Energy" without "Arizona" → "RX Energy"; never empty, whole words only. */
export const withoutSupplier = (name: string, supplierName: string | undefined): string => {
  const supplier = (supplierName ?? '').trim();
  if (!supplier) return name;
  const words = name.trim().split(/\s+/);
  const lead = supplier.split(/\s+/);
  const matches = lead.every((word, i) => (words[i] ?? '').replace(/['’]s$/i, '').toLowerCase() === word.replace(/['’]s$/i, '').toLowerCase());
  return matches && words.length > lead.length ? words.slice(lead.length).join(' ') : name;
};

export const rowText = (
  product: Pick<Product, 'name' | 'flavor' | 'size'>,
  groupedBy: GroupedBy,
  supplierName?: string,
  /** Item lists (Boar's Head) are asked for by product ("Deluxe Ham"), then the kind ("Sweet"). */
  nameFirst = false,
): { primary: string; secondary: string } => {
  const flavor = product.flavor.trim();
  if (nameFirst) return { primary: product.name, secondary: [flavor, groupedBy === 'size' ? '' : product.size].filter(Boolean).join(' · ') };
  const line = withoutSupplier(product.name, supplierName);
  const size = groupedBy === 'size' ? '' : product.size;
  if (!flavor) return { primary: product.name, secondary: size };
  // A line that is only the supplier's name ("Arizona" under Arizona) says nothing new.
  const sameAsSupplier = !!supplierName && line.trim().toLowerCase() === supplierName.trim().toLowerCase();
  const parts = [groupedBy === 'line' || sameAsSupplier ? '' : line, size].filter(Boolean);
  return { primary: flavor, secondary: parts.join(' · ') };
};
