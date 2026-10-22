// utils/storeProfile.ts
//
// How THIS deli orders (v0.1.7). The catalog says what a product is; this profile says how this
// store works with it. It is the store's own, private knowledge and never changes a product.
//
// Every number is a Fact: the value, where it came from and when. Nothing is assumed: a missing
// fact is unknown, and an owner's estimate is always shown as an estimate.
//
//   inventory_storeProfile = {
//     schemaVersion: 1, storeId, createdAt,
//     suppliers: { [supplierId]: { deliveryDays?, orderCutoff?, leadDays? } },
//     products:  { [productId]:  { carried?, weeklyCases?, weeklyRange?, reorderAtUnits?,
//                                  targetUnits?, unitsPerCase? } },
//   }
//
// It is an `inventory_` key, so it is in backups, safety snapshots and restores; older app
// versions keep it as an unknown app key. `storeId` is local only: it prepares for one private
// workspace per store later (docs/V0.1.7_NOTES.md §7) without any account or sync now.

export const STORE_PROFILE_KEY = 'inventory_storeProfile';
export const STORE_PROFILE_SCHEMA_VERSION = 1;

/** Where a fact came from, weakest to strongest. Only the person can set 'owner-estimate'. */
export type FactSource = 'owner-estimate' | 'confirmed-order' | 'invoice' | 'verified-count' | 'sales-record';
export const FACT_SOURCES: readonly FactSource[] = ['owner-estimate', 'confirmed-order', 'invoice', 'verified-count', 'sales-record'];

export interface Fact<T> {
  value: T;
  source: FactSource;
  /** When it was recorded (ISO 8601). */
  at: string;
  note?: string;
}

/** 0 = Sunday … 6 = Saturday (JavaScript's getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SupplierProfile {
  deliveryDays?: Fact<Weekday[]>;
  /** The order must be in by this time, this many days before the delivery. */
  orderCutoff?: Fact<{ time: string; daysBefore: number }>;
  leadDays?: Fact<number>;
}

export interface ProductProfile {
  /** This store sells it. Absent = not said. */
  carried?: Fact<boolean>;
  /** About how many cases a week the store orders (or uses). */
  weeklyCases?: Fact<number>;
  weeklyRange?: Fact<[number, number]>;
  reorderAtUnits?: Fact<number>;
  targetUnits?: Fact<number>;
  /** The case size this store actually receives, when it differs from the catalog. */
  unitsPerCase?: Fact<number>;
}

export interface StoreProfile {
  schemaVersion: 1;
  storeId: string;
  createdAt: string;
  suppliers: Record<string, SupplierProfile>;
  products: Record<string, ProductProfile>;
}

export type SupplierField = keyof SupplierProfile;
export type ProductField = keyof ProductProfile;

export const emptyStoreProfile = (now = new Date()): StoreProfile => ({
  schemaVersion: STORE_PROFILE_SCHEMA_VERSION,
  storeId: `store-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  createdAt: now.toISOString(),
  suppliers: {},
  products: {},
});

export const fact = <T,>(value: T, source: FactSource, now = new Date(), note?: string): Fact<T> => ({
  value,
  source,
  at: now.toISOString(),
  ...(note ? { note } : {}),
});

/** An estimate is the owner's word; the rest come from records. */
export const isEstimate = (f: Fact<unknown> | undefined) => f?.source === 'owner-estimate';

const without = <T extends object, K extends keyof T>(obj: T, key: K): T => {
  const copy = { ...obj };
  delete copy[key];
  return copy;
};

/** Sets (or, with null, removes) one supplier fact. Pure. */
export const withSupplierFact = <K extends SupplierField>(
  profile: StoreProfile,
  supplierId: string,
  field: K,
  value: SupplierProfile[K] | null,
): StoreProfile => {
  const current = profile.suppliers[supplierId] ?? {};
  const next = value === null ? without(current, field) : { ...current, [field]: value };
  const suppliers = { ...profile.suppliers };
  if (Object.keys(next).length) suppliers[supplierId] = next;
  else delete suppliers[supplierId];
  return { ...profile, suppliers };
};

/** Sets (or, with null, removes) one product fact. Pure. */
export const withProductFact = <K extends ProductField>(
  profile: StoreProfile,
  productId: string,
  field: K,
  value: ProductProfile[K] | null,
): StoreProfile => {
  const current = profile.products[productId] ?? {};
  const next = value === null ? without(current, field) : { ...current, [field]: value };
  const products = { ...profile.products };
  if (Object.keys(next).length) products[productId] = next;
  else delete products[productId];
  return { ...profile, products };
};

// --- Delivery days ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Days from `now` (start of today) to the next delivery day; 0 = today. null without days. */
export const daysToNextDelivery = (days: readonly Weekday[] | undefined, now = new Date()): number | null => {
  if (!days?.length) return null;
  const today = now.getDay();
  return Math.min(...days.map(d => (d - today + 7) % 7));
};

/** Days between one delivery and the next (the period an order has to last). */
export const deliveryCycleDays = (days: readonly Weekday[] | undefined, from: number): number | null => {
  if (!days?.length) return null;
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 1) return 7;
  const next = sorted.find(d => d > from) ?? sorted[0] + 7;
  return next - from;
};

export const nextDeliveryDate = (days: readonly Weekday[] | undefined, now = new Date()): Date | null => {
  const inDays = daysToNextDelivery(days, now);
  if (inDays === null) return null;
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(date.getTime() + inDays * DAY_MS);
};

// --- Validation ------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFact = (v: unknown, check: (value: unknown) => boolean): boolean =>
  isObject(v) && check(v.value) && FACT_SOURCES.includes(v.source as FactSource) && typeof v.at === 'string' && !Number.isNaN(Date.parse(v.at));
const isCount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 99_999;
const isDays = (v: unknown) => Array.isArray(v) && v.length <= 7 && v.every(d => Number.isInteger(d) && d >= 0 && d <= 6);

const SUPPLIER_CHECKS: Record<SupplierField, (v: unknown) => boolean> = {
  deliveryDays: isDays,
  orderCutoff: v => isObject(v) && typeof v.time === 'string' && /^\d{2}:\d{2}$/.test(v.time) && Number.isInteger(v.daysBefore) && (v.daysBefore as number) >= 0 && (v.daysBefore as number) <= 14,
  leadDays: v => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 30,
};
const PRODUCT_CHECKS: Record<ProductField, (v: unknown) => boolean> = {
  carried: v => typeof v === 'boolean',
  weeklyCases: isCount,
  weeklyRange: v => Array.isArray(v) && v.length === 2 && isCount(v[0]) && isCount(v[1]) && (v[0] as number) <= (v[1] as number),
  reorderAtUnits: isCount,
  targetUnits: isCount,
  unitsPerCase: v => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 9999,
};

/** Shape check for `inventory_storeProfile`. Unknown fields are allowed and kept (newer versions). */
export const validateStoreProfileValue = (value: unknown): string[] => {
  if (!isObject(value)) return ['The store profile is not a record.'];
  if (value.schemaVersion !== STORE_PROFILE_SCHEMA_VERSION) return [`The store profile has an unsupported version (${String(value.schemaVersion)}).`];
  if (typeof value.storeId !== 'string' || !value.storeId) return ['The store profile has no store id.'];
  if (!isObject(value.suppliers) || !isObject(value.products)) return ['The store profile has no supplier or product list.'];
  const problems: string[] = [];
  const check = (label: string, entries: Record<string, unknown>, checks: Record<string, (v: unknown) => boolean>) => {
    for (const [id, entry] of Object.entries(entries)) {
      if (problems.length >= 5) return;
      if (!isObject(entry)) {
        problems.push(`${label} "${id}" is not a record.`);
        continue;
      }
      for (const [field, ok] of Object.entries(checks)) {
        if (entry[field] !== undefined && !isFact(entry[field], ok)) problems.push(`${label} "${id}" has an invalid ${field}.`);
      }
    }
  };
  check('Supplier', value.suppliers, SUPPLIER_CHECKS);
  check('Product', value.products, PRODUCT_CHECKS);
  return problems.slice(0, 5);
};
