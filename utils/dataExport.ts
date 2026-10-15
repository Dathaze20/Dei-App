// utils/dataExport.ts
//
// Read-only "Export My Data" support.
//
// Everything in this file READS browser storage; nothing here ever writes, removes or
// resets a stored value. The export captures two views of the same data:
//
//   raw  - every localStorage key for this origin, copied verbatim as the exact string
//          that is stored. This is the source of truth for any future restore, because it
//          survives even if a value is malformed or uses a shape this code doesn't know.
//   data - the app's known keys parsed into readable JSON, for humans and future tooling.
//
// Stock values in the original app were seeded with random numbers, so the export marks
// every stock value as unverified. It never claims they are real counts.

export const EXPORT_FORMAT = 'deliordernyc-export';
export const EXPORT_SCHEMA_VERSION = 1;

/** The localStorage keys the app currently persists, and how each is encoded. */
export const KNOWN_STORAGE_KEYS = {
  products: { key: 'inventory_products', encoding: 'json' },
  suppliers: { key: 'inventory_suppliers', encoding: 'json' },
  currentOrder: { key: 'inventory_currentOrder', encoding: 'json' },
  deliName: { key: 'inventory_deliName', encoding: 'string' },
  theme: { key: 'theme', encoding: 'string' },
  language: { key: 'language', encoding: 'string' },
} as const;

export type KnownDataField = keyof typeof KNOWN_STORAGE_KEYS;

/** The read-only subset of the Web Storage API the export needs. */
export interface ReadableStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

export interface ExportParseError {
  key: string;
  message: string;
}

export interface ExportSummary {
  storageKeyCount: number;
  productCount: number | null;
  supplierCount: number | null;
  orderLineCount: number | null;
  orderCaseCount: number | null;
}

export interface DataExport {
  format: typeof EXPORT_FORMAT;
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  app: { name: string; version: string };
  source: { origin: string; href: string; userAgent: string };
  notes: {
    stockValuesVerified: false;
    pricesVerified: false;
    explanation: string;
  };
  summary: ExportSummary;
  /** Parsed copy of each known key. `null` means the key is absent or could not be parsed. */
  data: Record<KnownDataField, unknown>;
  /** Known keys whose stored value is not valid JSON. Their exact text is still in `raw`. */
  parseErrors: ExportParseError[];
  /** Every key on this origin, exactly as stored. */
  raw: Record<string, string>;
  /** SHA-256 (hex) of `rawCanonical(raw)`. Null when Web Crypto is unavailable. */
  rawChecksum: string | null;
}

export interface ExportContext {
  /** Injected so tests are deterministic. */
  now: Date;
  origin: string;
  href: string;
  userAgent: string;
  appName: string;
  appVersion: string;
}

export const UNVERIFIED_EXPLANATION =
  'Stock quantities and prices in this export may be sample or randomly generated values. ' +
  'They have not been confirmed as real counted inventory or current supplier prices.';

/** Copies every key/value pair out of storage without modifying it. */
export const readAllStorage = (storage: ReadableStorage): Record<string, string> => {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  keys.sort();
  const raw: Record<string, string> = {};
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value !== null) raw[key] = value;
  }
  return raw;
};

/** Stable text form of the raw section, used for the checksum. Keys are sorted. */
export const rawCanonical = (raw: Record<string, string>): string =>
  JSON.stringify(Object.keys(raw).sort().map(key => [key, raw[key]]));

const countOrNull = (value: unknown): number | null => (Array.isArray(value) ? value.length : null);

const summarize = (raw: Record<string, string>, data: Record<KnownDataField, unknown>): ExportSummary => {
  const order = data.currentOrder as { items?: unknown } | null;
  const items = order && Array.isArray(order.items) ? (order.items as Array<{ quantity?: unknown }>) : null;
  return {
    storageKeyCount: Object.keys(raw).length,
    productCount: countOrNull(data.products),
    supplierCount: countOrNull(data.suppliers),
    orderLineCount: items ? items.length : null,
    orderCaseCount: items
      ? items.reduce((total, item) => total + (typeof item.quantity === 'number' ? item.quantity : 0), 0)
      : null,
  };
};

/** Builds the export object. Pure apart from the storage reads; never writes. */
export const buildExport = (storage: ReadableStorage, context: ExportContext): Omit<DataExport, 'rawChecksum'> => {
  const raw = readAllStorage(storage);
  const data = {} as Record<KnownDataField, unknown>;
  const parseErrors: ExportParseError[] = [];

  (Object.keys(KNOWN_STORAGE_KEYS) as KnownDataField[]).forEach(field => {
    const { key, encoding } = KNOWN_STORAGE_KEYS[field];
    const value = raw[key];
    if (value === undefined) {
      data[field] = null;
      return;
    }
    if (encoding === 'string') {
      data[field] = value;
      return;
    }
    try {
      data[field] = JSON.parse(value);
    } catch (e) {
      data[field] = null;
      parseErrors.push({ key, message: e instanceof Error ? e.message : String(e) });
    }
  });

  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: context.now.toISOString(),
    app: { name: context.appName, version: context.appVersion },
    source: { origin: context.origin, href: context.href, userAgent: context.userAgent },
    notes: { stockValuesVerified: false, pricesVerified: false, explanation: UNVERIFIED_EXPLANATION },
    summary: summarize(raw, data),
    data,
    parseErrors,
    raw,
  };
};

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');

/** SHA-256 of the canonical raw section, or null if Web Crypto isn't available (e.g. insecure context). */
export const computeRawChecksum = async (raw: Record<string, string>): Promise<string | null> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const bytes = new TextEncoder().encode(rawCanonical(raw));
    return toHex(await subtle.digest('SHA-256', bytes));
  } catch {
    return null;
  }
};

/** Builds the export and attaches its checksum. */
export const createExport = async (storage: ReadableStorage, context: ExportContext): Promise<DataExport> => {
  const base = buildExport(storage, context);
  return { ...base, rawChecksum: await computeRawChecksum(base.raw) };
};

export const serializeExport = (exported: DataExport): string => JSON.stringify(exported, null, 2);

const pad = (n: number) => String(n).padStart(2, '0');

/** `deliordernyc-backup-2026-10-15-165200.json`, using the device's local time. */
export const exportFileName = (date: Date): string =>
  `deliordernyc-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
  `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;

export interface VerificationResult {
  ok: boolean;
  problems: string[];
}

/**
 * Checks that exported text is a complete, intact export: it parses, has the expected format
 * and version, its checksum matches, and (when given) its raw section still matches what is in
 * storage right now. Used as a self-check after every export, and later before any restore.
 */
export const verifyExportText = async (text: string, storage?: ReadableStorage): Promise<VerificationResult> => {
  const problems: string[] = [];
  let parsed: Partial<DataExport>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problems: ['The file is not valid JSON (it may be cut off).'] };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, problems: ['The file does not contain an export object.'] };
  }
  if (parsed.format !== EXPORT_FORMAT) problems.push('Unexpected file format.');
  if (parsed.schemaVersion !== EXPORT_SCHEMA_VERSION) problems.push(`Unsupported schema version: ${parsed.schemaVersion}.`);
  if (typeof parsed.exportedAt !== 'string' || Number.isNaN(Date.parse(parsed.exportedAt))) {
    problems.push('Missing or invalid export timestamp.');
  }
  const raw = parsed.raw;
  const rawIsValid =
    !!raw && typeof raw === 'object' && !Array.isArray(raw) && Object.values(raw).every(v => typeof v === 'string');
  if (!rawIsValid) {
    problems.push('Missing or invalid raw storage section.');
  } else {
    if (parsed.rawChecksum) {
      const actual = await computeRawChecksum(raw);
      if (actual !== null && actual !== parsed.rawChecksum) problems.push('Checksum mismatch: the data was altered or truncated.');
    }
    if (storage) {
      const current = readAllStorage(storage);
      if (rawCanonical(current) !== rawCanonical(raw)) problems.push('Export does not match the data currently stored.');
    }
  }
  return { ok: problems.length === 0, problems };
};
