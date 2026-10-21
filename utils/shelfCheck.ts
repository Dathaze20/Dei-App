// utils/shelfCheck.ts
//
// Shelf checks: photograph a refrigerator, shelf or backroom now, turn what is in the photos into
// counts later. This is the "observation" model; it never writes inventory by itself.
//
//   ShelfCheck   one check: its photos (ids in utils/shelfStore.ts), its rows, its state.
//   ShelfItem    one product seen in the photos:
//     productId  the catalog product, or null while not chosen yet;
//     visible    how many can be SEEN in the photos (a person's or a reader's estimate). Products
//                hidden behind others are not visible, so this is not the shelf total;
//     total      the total on the shelf the person confirms. Only this becomes a verified count;
//     source     who proposed the row: 'owner' (typed) or 'barcode' (read from a photo). A future
//                recognizer would add its own source name and a confidence;
//     state      'proposed' or 'rejected' (wrong match; kept for the record, never saved);
//     changes    every edit of product, visible or total, with the time: traceable corrections.
//   state        'draft' until the person saves the confirmed totals ('confirmed') or discards it.
//
// Saving writes one verified count per row that has a product and a confirmed total, through the
// same saveStockCount as the keypad (source 'photo-review'). Rows without a total are skipped.
// Photos are kept only on the phone, never uploaded, and deleted RETENTION_DAYS after a check is
// saved or discarded (drafts are kept until the person finishes them).
import { isValidCountUnits } from './stockCounts';

export const SHELF_SCHEMA_VERSION = 1;
export const RETENTION_DAYS = 14;
export const MAX_PHOTOS_PER_CHECK = 12;

export type ItemSource = 'owner' | 'barcode';
export type ItemField = 'productId' | 'visible' | 'total' | 'state';

export interface ShelfItem {
  id: string;
  productId: string | null;
  visible: number | null;
  total: number | null;
  source: ItemSource;
  /** For barcode rows: the code that was read. */
  code?: string;
  state: 'proposed' | 'rejected';
  changes: { at: string; field: ItemField; from: unknown; to: unknown }[];
}

export interface ConfirmedCount {
  productId: string;
  units: number;
  countedAt: string;
}

export interface ShelfCheck {
  schemaVersion: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  supplierId: string | null;
  imageIds: string[];
  items: ShelfItem[];
  state: 'draft' | 'confirmed' | 'discarded';
  closedAt?: string;
  confirmed?: ConfirmedCount[];
}

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const newShelfCheck = (supplierId: string | null, now = new Date()): ShelfCheck => ({
  schemaVersion: SHELF_SCHEMA_VERSION,
  id: newId('chk'),
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  supplierId,
  imageIds: [],
  items: [],
  state: 'draft',
});

const touch = (check: ShelfCheck, now: Date): ShelfCheck => ({ ...check, updatedAt: now.toISOString() });

export const withPhoto = (check: ShelfCheck, imageId: string, now = new Date()): ShelfCheck =>
  check.imageIds.length >= MAX_PHOTOS_PER_CHECK ? check : touch({ ...check, imageIds: [...check.imageIds, imageId] }, now);

export const withoutPhoto = (check: ShelfCheck, imageId: string, now = new Date()): ShelfCheck =>
  touch({ ...check, imageIds: check.imageIds.filter(id => id !== imageId) }, now);

/** Adds a row. A product already in a (not rejected) row is not added twice: that row is returned. */
export const withItem = (
  check: ShelfCheck,
  item: { productId: string | null; source: ItemSource; code?: string; visible?: number | null },
  now = new Date(),
): ShelfCheck => {
  if (item.productId && check.items.some(i => i.productId === item.productId && i.state !== 'rejected')) return check;
  const row: ShelfItem = {
    id: newId('itm'),
    productId: item.productId,
    visible: item.visible ?? null,
    total: null,
    source: item.source,
    ...(item.code ? { code: item.code } : {}),
    state: 'proposed',
    changes: [],
  };
  return touch({ ...check, items: [...check.items, row] }, now);
};

/** Changes one field of a row and records the change. Invalid numbers become null (never 0). */
export const withItemChange = (check: ShelfCheck, itemId: string, field: ItemField, value: unknown, now = new Date()): ShelfCheck => {
  const clean =
    field === 'visible' || field === 'total' ? (isValidCountUnits(value) ? value : null)
    : field === 'state' ? (value === 'rejected' ? 'rejected' : 'proposed')
    : typeof value === 'string' && value ? value : null;
  return touch(
    {
      ...check,
      items: check.items.map(item =>
        item.id !== itemId || item[field] === clean
          ? item
          : { ...item, [field]: clean, changes: [...item.changes, { at: now.toISOString(), field, from: item[field], to: clean }] },
      ),
    },
    now,
  );
};

/** The rows that saving would turn into verified counts. */
export const confirmableItems = (check: ShelfCheck): (ShelfItem & { productId: string; total: number })[] =>
  check.items.filter(
    (item): item is ShelfItem & { productId: string; total: number } =>
      item.state === 'proposed' && !!item.productId && isValidCountUnits(item.total),
  );

export const closed = (check: ShelfCheck, state: 'confirmed' | 'discarded', confirmed: ConfirmedCount[] = [], now = new Date()): ShelfCheck =>
  touch({ ...check, state, closedAt: now.toISOString(), ...(state === 'confirmed' ? { confirmed } : {}) }, now);

/** Saved or discarded checks older than RETENTION_DAYS: their photos and records are deleted. */
export const isExpired = (check: ShelfCheck, now = new Date()): boolean =>
  check.state !== 'draft' && !!check.closedAt && now.getTime() - Date.parse(check.closedAt) > RETENTION_DAYS * 86_400_000;

/** UPCs compared as digits without leading zeros, so a UPC-A matches its EAN-13 form. */
export const normalizeCode = (code: string): string => code.replace(/\D/g, '').replace(/^0+/, '');

export const matchProductByCode = <P extends { id: string; upc?: string }>(code: string, products: readonly P[]): P | null => {
  const wanted = normalizeCode(code);
  if (wanted.length < 6) return null;
  return products.find(p => p.upc && normalizeCode(p.upc) === wanted) ?? null;
};

/** Checks the stored shape before use; anything unreadable is skipped, never repaired. */
export const isShelfCheck = (value: unknown): value is ShelfCheck => {
  const v = value as ShelfCheck;
  return (
    !!v && typeof v === 'object' && typeof v.id === 'string' && Array.isArray(v.imageIds) && Array.isArray(v.items) &&
    ['draft', 'confirmed', 'discarded'].includes(v.state) && !Number.isNaN(Date.parse(v.createdAt))
  );
};
