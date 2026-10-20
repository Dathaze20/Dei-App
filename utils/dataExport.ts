// utils/dataExport.ts
//
// Read-only "Export My Data" support.
//
// Everything in this file READS browser storage; nothing here ever writes, removes or
// resets a stored value. The export captures two views of the same data:
//
//   raw  - the included localStorage keys, copied verbatim as the exact string that is
//          stored. This is the source of truth for any future restore, because it survives
//          even if a value is malformed or uses a shape this code doesn't know.
//   data - the app's known keys parsed into readable JSON, for humans and future tooling.
//
// Privacy: only DeliOrderNYC's own keys are exported by default. Other keys saved at the same
// web address (another app on a shared origin such as github.io) are never silently included
// and never silently dropped: they are listed by name and size, without their values, and the
// person exporting can choose to include them.
//
// Integrity: a backup only counts as "verified" when its SHA-256 checksum is present, well
// formed and recomputed to the same value. Missing or uncheckable checksums are reported as
// "unverified", never as verified.
//
// Stock values in the original app were seeded with random numbers, so the export marks
// every stock value as unverified. It never claims they are real counts.

export const EXPORT_FORMAT = 'deliordernyc-export';
export const EXPORT_SCHEMA_VERSION = 1;
export const CHECKSUM_ALGORITHM = 'SHA-256';

/** The localStorage keys the app currently persists, and how each is encoded. */
export const KNOWN_STORAGE_KEYS = {
  products: { key: 'inventory_products', encoding: 'json' },
  suppliers: { key: 'inventory_suppliers', encoding: 'json' },
  currentOrder: { key: 'inventory_currentOrder', encoding: 'json' },
  deliName: { key: 'inventory_deliName', encoding: 'string' },
  theme: { key: 'theme', encoding: 'string' },
  language: { key: 'language', encoding: 'string' },
  // Added in C1: verified physical stock counts (see utils/stockCounts.ts). Older backups do not
  // have it, and older app versions keep it as an unknown app key.
  stockCounts: { key: 'inventory_stockCounts', encoding: 'json' },
} as const;

export type KnownDataField = keyof typeof KNOWN_STORAGE_KEYS;

const KNOWN_KEY_NAMES: ReadonlySet<string> = new Set(Object.values(KNOWN_STORAGE_KEYS).map(entry => entry.key));

/**
 * Key prefixes that belong to this app. `inventory_` is what the app has always used for its
 * data; `deliordernyc_` is reserved for anything added later. Any key with these prefixes is
 * treated as deli data and always exported, even if this version doesn't know it by name.
 */
export const APP_KEY_PREFIXES = ['inventory_', 'deliordernyc_'] as const;

export const isAppOwnedKey = (key: string): boolean =>
  KNOWN_KEY_NAMES.has(key) || APP_KEY_PREFIXES.some(prefix => key.startsWith(prefix));

/**
 * Keys the app uses to coordinate a restore between tabs (for example the restore lock), and
 * device-only display preferences (the Classic/Counter screen choice, utils/uiMode.ts).
 * They are not deli data: never exported, never snapshotted, never restored.
 */
export const SYSTEM_KEY_PREFIX = 'deliordernyc_sys_';

export const isSystemKey = (key: string): boolean => key.startsWith(SYSTEM_KEY_PREFIX);

/** App-owned keys that hold deli data: everything the app owns except system control keys. */
export const isDataKey = (key: string): boolean => isAppOwnedKey(key) && !isSystemKey(key);

/** The read-only subset of the Web Storage API the export needs. */
export interface ReadableStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

/** A key saved at this web address that does not belong to DeliOrderNYC. Never carries its value. */
export interface OtherStorageKey {
  key: string;
  /** Length of the stored string, so the person can judge what it is without seeing it. */
  length: number;
}

export interface StorageClassification {
  appOwnedKeys: string[];
  otherKeys: OtherStorageKey[];
}

export interface ExportParseError {
  key: string;
  message: string;
}

export interface ExportSummary {
  includedKeyCount: number;
  /** Keys from other apps on this web address that were left out (names listed in `storageKeys`). */
  excludedKeyCount: number;
  productCount: number | null;
  supplierCount: number | null;
  orderLineCount: number | null;
  /** Total quantity of case lines (lines without a unit, which have always meant cases). */
  orderCaseCount: number | null;
  /** Added in C1: total quantity of plain item lines (Boar's Head weekly list). */
  orderItemCount?: number | null;
  /** Added in C1: products with at least one verified stock count. */
  verifiedCountProductCount?: number | null;
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
  /** What was in storage and what was done with each key. Values of excluded keys are never recorded. */
  storageKeys: {
    appOwned: string[];
    includedOther: string[];
    excludedOther: OtherStorageKey[];
  };
  /** Parsed copy of each known key. `null` means the key is absent or could not be parsed. */
  data: Record<KnownDataField, unknown>;
  /** Known keys whose stored value is not valid JSON. Their exact text is still in `raw`. */
  parseErrors: ExportParseError[];
  /** The included keys, exactly as stored. */
  raw: Record<string, string>;
  /** Always SHA-256; present so a reader never has to guess. */
  rawChecksumAlgorithm: typeof CHECKSUM_ALGORITHM;
  /**
   * SHA-256 (lowercase hex) of `rawCanonical(raw)`. Null when Web Crypto was unavailable at
   * export time; such a backup can still be saved but can never be reported as verified.
   */
  rawChecksum: string | null;
  /** Set only on automatic safety snapshots, e.g. "pre-restore". Ignored by older readers. */
  purpose?: string;
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

export interface ExportOptions {
  /**
   * Keys that do NOT belong to the app but that the person explicitly chose to include.
   * Keys not currently in storage, or that are app-owned anyway, are ignored.
   */
  includeOtherKeys?: readonly string[];
}

export const UNVERIFIED_EXPLANATION =
  'Stock quantities and prices in this export may be sample or randomly generated values. ' +
  'They have not been confirmed as real counted inventory or current supplier prices.';

const listKeys = (storage: ReadableStorage): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys.sort();
};

/**
 * Splits what is stored at this web address into the app's data keys and everyone else's.
 * System control keys are left out of both. Read-only.
 */
export const classifyStorage = (storage: ReadableStorage): StorageClassification => {
  const appOwnedKeys: string[] = [];
  const otherKeys: OtherStorageKey[] = [];
  for (const key of listKeys(storage)) {
    if (isSystemKey(key)) continue;
    if (isAppOwnedKey(key)) {
      appOwnedKeys.push(key);
    } else {
      otherKeys.push({ key, length: storage.getItem(key)?.length ?? 0 });
    }
  }
  return { appOwnedKeys, otherKeys };
};

/** Copies the given keys out of storage without modifying it. Missing keys are skipped. */
export const readStorageKeys = (storage: ReadableStorage, keys: readonly string[]): Record<string, string> => {
  const raw: Record<string, string> = {};
  for (const key of [...keys].sort()) {
    const value = storage.getItem(key);
    if (value !== null) raw[key] = value;
  }
  return raw;
};

/** Stable text form of the raw section, used for the checksum. Keys are sorted. */
export const rawCanonical = (raw: Record<string, string>): string =>
  JSON.stringify(Object.keys(raw).sort().map(key => [key, raw[key]]));

const countOrNull = (value: unknown): number | null => (Array.isArray(value) ? value.length : null);

const summarize = (
  raw: Record<string, string>,
  data: Record<KnownDataField, unknown>,
  excludedKeyCount: number,
): ExportSummary => {
  const order = data.currentOrder as { items?: unknown } | null;
  const items = order && Array.isArray(order.items) ? (order.items as Array<{ quantity?: unknown; unit?: unknown }>) : null;
  const sumQuantities = (lines: Array<{ quantity?: unknown }>) =>
    lines.reduce((total, item) => total + (typeof item.quantity === 'number' ? item.quantity : 0), 0);
  const counts = data.stockCounts as { products?: unknown } | null;
  return {
    includedKeyCount: Object.keys(raw).length,
    excludedKeyCount,
    productCount: countOrNull(data.products),
    supplierCount: countOrNull(data.suppliers),
    orderLineCount: items ? items.length : null,
    orderCaseCount: items ? sumQuantities(items.filter(item => item.unit !== 'item')) : null,
    orderItemCount: items ? sumQuantities(items.filter(item => item.unit === 'item')) : null,
    verifiedCountProductCount:
      counts === null
        ? 0
        : typeof counts.products === 'object' && counts.products !== null
          ? Object.values(counts.products as Record<string, { counts?: unknown }>).filter(
              entry => Array.isArray(entry?.counts) && entry.counts.length > 0,
            ).length
          : null,
  };
};

/** Builds the export object. Pure apart from the storage reads; never writes. */
export const buildExport = (
  storage: ReadableStorage,
  context: ExportContext,
  options: ExportOptions = {},
): Omit<DataExport, 'rawChecksum'> => {
  const { appOwnedKeys, otherKeys } = classifyStorage(storage);
  const requested = new Set(options.includeOtherKeys ?? []);
  const includedOther = otherKeys.filter(entry => requested.has(entry.key)).map(entry => entry.key);
  const excludedOther = otherKeys.filter(entry => !requested.has(entry.key));
  const raw = readStorageKeys(storage, [...appOwnedKeys, ...includedOther]);

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
    summary: summarize(raw, data, excludedOther.length),
    storageKeys: { appOwned: appOwnedKeys, includedOther, excludedOther },
    data,
    parseErrors,
    raw,
    rawChecksumAlgorithm: CHECKSUM_ALGORITHM,
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

/** Builds the export and attaches its checksum (null if it cannot be computed). */
export const createExport = async (
  storage: ReadableStorage,
  context: ExportContext,
  options: ExportOptions = {},
): Promise<DataExport> => {
  const base = buildExport(storage, context, options);
  return { ...base, rawChecksum: await computeRawChecksum(base.raw) };
};

export const serializeExport = (exported: DataExport): string => JSON.stringify(exported, null, 2);

const pad = (n: number) => String(n).padStart(2, '0');

/** `deliordernyc-backup-2026-10-15-165200.json`, using the device's local time. */
export const exportFileName = (date: Date): string =>
  `deliordernyc-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
  `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.json`;

/**
 * - `verified`: the file is a well-formed export AND its SHA-256 checksum is present, well formed
 *   and was recomputed to the same value (and, when checked, it matches current storage).
 *   This is the ONLY status a restore may treat as trustworthy without asking.
 * - `unverified`: the file is a well-formed export, but its integrity could not be proven
 *   (no checksum, or Web Crypto unavailable). The data may be fine; it must be labelled as
 *   not cryptographically verified, and a restore must ask for explicit confirmation.
 * - `invalid`: something is definitely wrong (not an export, malformed or mismatched checksum,
 *   truncated, or different from what is stored). Never restore without a human looking at it.
 */
export type VerificationStatus = 'verified' | 'unverified' | 'invalid';

export type ChecksumCheck =
  | 'match'
  | 'missing'
  | 'crypto-unavailable'
  | 'malformed'
  | 'mismatch'
  | 'not-checked';

export interface VerificationResult {
  status: VerificationStatus;
  checksum: ChecksumCheck;
  /** Definite failures. Any entry makes the status `invalid`. */
  problems: string[];
  /** Reasons the file could not be proven intact. Any entry (without problems) makes it `unverified`. */
  warnings: string[];
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Checks that exported text is a complete, intact export: it parses, has the expected format
 * and version, its checksum is present, well formed and matches, and (when `storage` is given)
 * its raw section still matches what is in storage right now. Used as a self-check after every
 * export, and later before any restore.
 */
export const verifyExportText = async (text: string, storage?: ReadableStorage): Promise<VerificationResult> => {
  const problems: string[] = [];
  const warnings: string[] = [];
  const invalid = (problem: string): VerificationResult =>
    ({ status: 'invalid', checksum: 'not-checked', problems: [problem], warnings: [] });

  let parsed: Partial<DataExport>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid('The file is not valid JSON (it may be cut off).');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return invalid('The file does not contain an export object.');
  }
  if (parsed.format !== EXPORT_FORMAT) problems.push('Unexpected file format.');
  if (parsed.schemaVersion !== EXPORT_SCHEMA_VERSION) problems.push(`Unsupported schema version: ${parsed.schemaVersion}.`);
  if (typeof parsed.exportedAt !== 'string' || Number.isNaN(Date.parse(parsed.exportedAt))) {
    problems.push('Missing or invalid export timestamp.');
  }

  let checksum: ChecksumCheck = 'not-checked';
  const raw = parsed.raw;
  const rawIsValid =
    !!raw && typeof raw === 'object' && !Array.isArray(raw) && Object.values(raw).every(v => typeof v === 'string');
  if (!rawIsValid) {
    problems.push('Missing or invalid raw storage section.');
  } else {
    const stated = parsed.rawChecksum;
    if (stated === undefined || stated === null) {
      checksum = 'missing';
      warnings.push('This backup has no checksum, so damage or changes to it cannot be detected.');
    } else if (typeof stated !== 'string' || !SHA256_HEX.test(stated)) {
      checksum = 'malformed';
      problems.push('The checksum is malformed, so the file cannot be trusted.');
    } else if (parsed.rawChecksumAlgorithm !== undefined && parsed.rawChecksumAlgorithm !== CHECKSUM_ALGORITHM) {
      checksum = 'malformed';
      problems.push(`Unsupported checksum algorithm: ${String(parsed.rawChecksumAlgorithm)}.`);
    } else {
      const actual = await computeRawChecksum(raw);
      if (actual === null) {
        checksum = 'crypto-unavailable';
        warnings.push('This browser cannot compute SHA-256 here, so the checksum could not be checked.');
      } else if (actual !== stated) {
        checksum = 'mismatch';
        problems.push('Checksum mismatch: the data was altered or truncated.');
      } else {
        checksum = 'match';
      }
    }

    if (storage) {
      // Compare the keys this file holds, plus every app-owned key now in storage, so a
      // missing deli key is caught but unrelated keys from other apps are ignored.
      const keys = new Set([...Object.keys(raw), ...classifyStorage(storage).appOwnedKeys]);
      const current = readStorageKeys(storage, [...keys]);
      if (rawCanonical(current) !== rawCanonical(raw)) problems.push('Export does not match the data currently stored.');
    }
  }

  // "verified" requires a recomputed, matching checksum. Nothing else can produce it.
  const status: VerificationStatus =
    problems.length > 0 ? 'invalid' : checksum === 'match' && warnings.length === 0 ? 'verified' : 'unverified';
  return { status, checksum, problems, warnings };
};
