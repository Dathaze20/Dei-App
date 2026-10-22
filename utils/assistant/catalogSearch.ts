// utils/assistant/catalogSearch.ts
//
// Finds catalog products from what a person said ("Arizona green tea big can", "diet pepsi").
// It only ever returns real catalog records, and it never picks one of several on its own:
//   - every word said must match the product (its line, flavor, size, supplier, UPC or aliases);
//   - when one product's flavor is exactly what was said, products that only contain those words
//     are dropped ("fruit punch" → Fruit Punch, not Caution Extreme Fruit Punch);
//   - restricted lines (Arizona Hard, alcoholic) only match when "hard" is said;
//   - several left → the person chooses.
import { Product, Supplier } from '../../types';

export const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)\s*(oz|ounce|ounces)\b/g, '$1 oz')
    .replace(/(\d)\.(?=\d)/g, '$1_') // keep 11.5 and 16.9 as one word
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9_؀-ۿ\s]/g, ' ')
    .replace(/_/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

const STOP = new Set(['a', 'an', 'the', 'of', 'my', 'our', 'some', 'please', 'case', 'cases', 'box', 'boxes', 'item', 'items', 'flavor', 'flavour', 'de', 'la', 'el', 'las', 'los', 'caja', 'cajas', 'with', 'and', 'y']);

/** Words for the same thing in sizes and packaging. */
const SYNONYMS: Record<string, string> = {
  bottles: 'bottle', btl: 'bottle', cans: 'can', jugs: 'jug', gallon: 'jug', tallboy: 'tall', tallboys: 'tall', boy: 'boy',
  ounce: 'oz', ounces: 'oz', lite: 'diet', light: 'diet', cherry: 'cherry', mtn: 'mountain', dew: 'dew', zero: 'zero',
};

export const tokens = (text: string): string[] =>
  normalize(text)
    .split(' ')
    .filter(Boolean)
    .map(w => SYNONYMS[w] ?? w)
    .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

/** Lines that must be asked for by name (alcoholic). Not in the catalog's own data yet. */
export const isRestricted = (product: Pick<Product, 'name' | 'category'>) => /\bhard\b/i.test(product.name) || /\b(beer|alcohol|alcoholic|wine|liquor|malt|hard seltzer|hard cider)\b/i.test(product.category);

const haystack = (product: Product, supplierName: string): string[] => [
  ...tokens(product.name),
  ...tokens(product.flavor),
  ...tokens(product.size),
  ...tokens(supplierName),
  ...(product.upc ? [product.upc.replace(/^0+/, ''), product.upc] : []),
  ...(product.aliases ?? []).flatMap(tokens),
  // "big can" also finds a "23 oz. Big Can"; "tall boy" a "Tall Boy".
];

const wordMatches = (word: string, hay: readonly string[]) =>
  hay.some(h => h === word || (word.length >= 4 && h.startsWith(word)) || (/^\d+$/.test(word) && h.replace(/^0+/, '') === word.replace(/^0+/, '')));

export interface SearchResult {
  /** Best matches, most likely first. One = resolved. */
  products: Product[];
  /** The words that were looked for. */
  words: string[];
}

export const searchProducts = (
  query: string,
  products: readonly Product[],
  suppliers: readonly Supplier[],
  options: { within?: ReadonlySet<string>; supplierId?: string } = {},
): SearchResult => {
  const words = tokens(query).filter(w => !STOP.has(w));
  if (!words.length) return { products: [], words };
  const supplierName = new Map(suppliers.map(s => [s.id, s.name]));
  const wantsRestricted = words.includes('hard');
  const pool = products.filter(
    p => (!options.within || options.within.has(p.id)) && (!options.supplierId || p.supplierId === options.supplierId) && (wantsRestricted || !isRestricted(p)),
  );
  // An exact UPC wins outright.
  const digits = query.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length >= 8) {
    const byUpc = pool.filter(p => p.upc && p.upc.replace(/^0+/, '') === digits);
    if (byUpc.length) return { products: byUpc, words };
  }
  const all = pool.filter(p => {
    const hay = haystack(p, supplierName.get(p.supplierId) ?? '');
    return words.every(w => wordMatches(w, hay));
  });
  // Products whose own name, flavor or size has every word beat ones found through the supplier's
  // name ("pepsi" is the Pepsi line, not everything PepsiCo delivers).
  const own = all.filter(p => {
    const hay = haystack(p, '');
    return words.every(w => wordMatches(w, hay) || tokens(supplierName.get(p.supplierId) ?? '').includes(w));
  });
  const matched = own.length ? own : all;
  if (matched.length <= 1) return { products: matched, words };
  // Prefer products whose flavor (or, without a flavor, name) is exactly the words left once the
  // line, supplier and size words are taken out.
  // Exact flavors first, then flavors that start with those words ("Green Tea" also offers "Green
  // Tea with Ginseng and Honey", not "Diet Green Tea"). Products that only contain the words
  // somewhere are offered only when nothing starts with them.
  const rank = (p: Product): 0 | 1 | 2 => {
    const lineWords = new Set([...tokens(p.name), ...tokens(supplierName.get(p.supplierId) ?? ''), ...tokens(p.size)]);
    const rest = words.filter(w => !lineWords.has(w));
    const target = tokens(p.flavor || p.name).filter(w => !STOP.has(w));
    if (!rest.length) return 2;
    const starts = rest.every((w, i) => target[i] !== undefined && wordMatches(w, [target[i]]));
    if (starts && rest.length === target.length) return 0;
    return starts ? 1 : 2;
  };
  const ranked = matched.map(p => ({ p, r: rank(p) }));
  const top = Math.min(...ranked.map(x => x.r));
  // Near matches from another line ("Arizona Energy" when only "Arizona" was said) only when
  // nothing in the named line fits.
  const saidLine = (p: Product) => tokens(p.name).every(w => words.includes(w) || tokens(supplierName.get(p.supplierId) ?? '').includes(w));
  const best = top === 2 ? matched : ranked.filter(x => x.r === 0 || (x.r === 1 && (top === 1 || saidLine(x.p)))).sort((a, b) => a.r - b.r).map(x => x.p);
  const exactOnly = ranked.filter(x => x.r === 0).map(x => x.p);
  // A single exact flavor with nothing else that starts the same way is resolved.
  if (exactOnly.length === 1 && best.length > 1 && ranked.filter(x => x.r === 1).length === 0) return { products: exactOnly, words };
  const order = new Map(best.map((p, i) => [p.id, i]));
  return { products: [...best].sort((a, b) => rank(a) - rank(b) || a.size.localeCompare(b.size, undefined, { numeric: true }) || (order.get(a.id)! - order.get(b.id)!)), words };
};

/** A supplier named in the text ("Arizona", "frito lay"), when exactly one fits. */
export const findSupplier = (text: string, suppliers: readonly Supplier[]): Supplier | null => {
  const said = ` ${normalize(text)} `;
  const hits = suppliers.filter(s => said.includes(` ${normalize(s.name)} `) || said.includes(` ${normalize(s.name).replace(/\s+/g, '')} `));
  if (hits.length === 1) return hits[0];
  // Prefer the longest name ("Arizona Hard" over "Arizona" if both were suppliers).
  return hits.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
};
