// utils/csvImport.ts
//
// Bulk "add products" from a CSV file, checked before anything is saved. Pure functions: the
// Catalog screen shows the preview and adds only the rows the person approves.
//
// Columns (header row, any order, case and spacing ignored; see CSV_TEMPLATE):
//   name*, supplier*, flavor, size, category, units_per_case, case_cost, retail_price,
//   reorder_at, upc, image_url
// Rules:
//   - name and supplier are required; supplier must match an existing supplier's name (or id).
//   - Case suppliers also need units_per_case and case_cost: a price is never made up, so a row
//     without one is flagged, not imported with $0. Item-list suppliers (Boar's Head) are not
//     priced and need neither.
//   - retail_price and reorder_at may be blank (recorded as 0 = not set); numbers must be valid.
//   - image_url must be an https address; anything else is dropped with a warning.
//   - A row matching an existing product (same UPC, or same supplier + name + flavor + size) is
//     "already in catalog" and never imported: existing products are never changed. A row
//     repeating an earlier row of the same file is a duplicate.
import { Product, Supplier } from '../types';
import { SupplierWorkflow } from './supplierWorkflow';

export const CSV_COLUMNS = ['name', 'supplier', 'flavor', 'size', 'category', 'units_per_case', 'case_cost', 'retail_price', 'reorder_at', 'upc', 'image_url'] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];
export const CSV_TEMPLATE = `${CSV_COLUMNS.join(',')}\n`;
export const MAX_IMPORT_ROWS = 2000;

const ALIASES: Record<string, CsvColumn> = {
  product: 'name', product_name: 'name', item: 'name',
  vendor: 'supplier', supplier_name: 'supplier',
  flavour: 'flavor', variant: 'flavor',
  case_size: 'units_per_case', units: 'units_per_case', pack: 'units_per_case', unitspercase: 'units_per_case',
  cost: 'case_cost', cost_price: 'case_cost', case_price: 'case_cost',
  retail: 'retail_price', price: 'retail_price',
  reorder: 'reorder_at', reorder_point: 'reorder_at', reorder_threshold: 'reorder_at',
  barcode: 'upc', ean: 'upc',
  image: 'image_url', picture: 'image_url', photo_url: 'image_url',
};

/** Splits CSV text into rows of cells (quotes, doubled quotes, commas and newlines in quotes). */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c.trim() !== ''));
};

const columnOf = (header: string): CsvColumn | null => {
  const key = header.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (CSV_COLUMNS as readonly string[]).includes(key) ? (key as CsvColumn) : ALIASES[key] ?? null;
};

export type RowProblem =
  | 'missing-name' | 'missing-supplier' | 'unknown-supplier' | 'missing-units' | 'bad-units'
  | 'missing-cost' | 'bad-cost' | 'bad-retail' | 'bad-reorder' | 'bad-upc';
export type RowWarning = 'image-dropped';

export interface ImportRow {
  /** Line number in the file (the header is line 1). */
  line: number;
  status: 'ready' | 'exists' | 'duplicate' | 'invalid';
  problems: RowProblem[];
  warnings: RowWarning[];
  /** What would be added (when ready). */
  product: Omit<Product, 'id' | 'currentStockUnits'> | null;
  /** For display: the row's own name, flavor, size and supplier text. */
  label: { name: string; flavor: string; size: string; supplier: string };
  /** The existing product it matches (status 'exists'). */
  matchId?: string;
}

export type ImportPlan =
  | { ok: true; rows: ImportRow[]; unknownColumns: string[] }
  | { ok: false; error: 'empty' | 'no-header' | 'too-many-rows' };

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
const identity = (p: { supplierId: string; name: string; flavor: string; size: string }) => [p.supplierId, norm(p.name), norm(p.flavor), norm(p.size)].join('|');
const money = (text: string): number | null => (/^\$?\d+(\.\d{1,2})?$/.test(text.trim()) ? Number(text.trim().replace('$', '')) : null);
const whole = (text: string, min: number): number | null => (/^\d+$/.test(text.trim()) && Number(text) >= min ? Number(text) : null);

export const planImport = (
  text: string,
  products: readonly Product[],
  suppliers: readonly Supplier[],
  workflowOf: (supplierId: string) => SupplierWorkflow,
): ImportPlan => {
  const table = parseCsv(text);
  if (table.length === 0) return { ok: false, error: 'empty' };
  const header = table[0].map(columnOf);
  if (!header.includes('name') || !header.includes('supplier')) return { ok: false, error: 'no-header' };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { ok: false, error: 'too-many-rows' };
  const unknownColumns = table[0].filter((_, i) => header[i] === null).map(h => h.trim()).filter(Boolean);

  const supplierByName = new Map<string, Supplier>();
  suppliers.forEach(s => {
    supplierByName.set(norm(s.name), s);
    supplierByName.set(norm(s.id), s);
  });
  const byUpc = new Map(products.filter(p => p.upc?.trim()).map(p => [p.upc!.trim(), p.id]));
  const byIdentity = new Map(products.map(p => [identity(p), p.id]));
  const seenUpc = new Set<string>();
  const seenIdentity = new Set<string>();

  const rows = table.slice(1).map((cells, index): ImportRow => {
    const get = (column: CsvColumn) => {
      const at = header.indexOf(column);
      return at >= 0 ? (cells[at] ?? '').trim() : '';
    };
    const label = { name: get('name'), flavor: get('flavor'), size: get('size'), supplier: get('supplier') };
    const problems: RowProblem[] = [];
    const warnings: RowWarning[] = [];
    const supplier = label.supplier ? supplierByName.get(norm(label.supplier)) : undefined;
    if (!label.name) problems.push('missing-name');
    if (!label.supplier) problems.push('missing-supplier');
    else if (!supplier) problems.push('unknown-supplier');
    const cases = supplier ? workflowOf(supplier.id).orderStyle === 'cases' : true;

    const unitsText = get('units_per_case');
    let unitsPerCase = whole(unitsText, 1);
    if (!unitsText) {
      if (cases) problems.push('missing-units');
      else unitsPerCase = 1;
    } else if (unitsPerCase === null) problems.push('bad-units');

    const costText = get('case_cost');
    let cost = money(costText);
    if (!costText) {
      if (cases) problems.push('missing-cost');
      else cost = 0;
    } else if (cost === null) problems.push('bad-cost');

    const retailText = get('retail_price');
    const retail = retailText ? money(retailText) : 0;
    if (retail === null) problems.push('bad-retail');
    const reorderText = get('reorder_at');
    const reorder = reorderText ? whole(reorderText, 0) : 0;
    if (reorder === null) problems.push('bad-reorder');
    const upc = get('upc').replace(/\s+/g, '');
    if (upc && !/^\d{6,14}$/.test(upc)) problems.push('bad-upc');
    let imageUrl = get('image_url');
    if (imageUrl && !/^https:\/\/[^\s"'<>]+$/i.test(imageUrl)) {
      warnings.push('image-dropped');
      imageUrl = '';
    }

    const line = index + 2;
    if (problems.length > 0 || !supplier) return { line, status: 'invalid', problems, warnings, product: null, label };
    const product: Omit<Product, 'id' | 'currentStockUnits'> = {
      name: label.name,
      flavor: label.flavor,
      size: label.size,
      category: get('category'),
      supplierId: supplier.id,
      unitsPerCase: unitsPerCase!,
      costPrice: cost!,
      retailPrice: retail!,
      reorderThresholdUnits: reorder!,
      ...(upc ? { upc } : {}),
      ...(imageUrl ? { imageUrl } : {}),
    };
    const key = identity(product);
    const matchId = (upc && byUpc.get(upc)) || byIdentity.get(key);
    if (matchId) return { line, status: 'exists', problems, warnings, product: null, label, matchId };
    if ((upc && seenUpc.has(upc)) || seenIdentity.has(key)) return { line, status: 'duplicate', problems, warnings, product: null, label };
    if (upc) seenUpc.add(upc);
    seenIdentity.add(key);
    return { line, status: 'ready', problems, warnings, product, label };
  });
  return { ok: true, rows, unknownColumns };
};
