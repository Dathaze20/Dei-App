// utils/orderHistory.ts
//
// A local history of prepared orders, one snapshot per save, kept in `inventory_orderHistory` so
// it is in backups, safety snapshots and restores like the rest of the deli data.
//
// Format (schemaVersion 1):
//   { schemaVersion: 1, entries: HistoryEntry[] }   newest first
//   HistoryEntry = { id, savedAt, supplierId, supplierName, status: 'prepared' | 'sent', sentAt?,
//                    lines: HistoryLine[], subtotal (null when no line is priced), text }
//   HistoryLine  = { productId, name, flavor, size, quantity, unit: 'case' | 'item',
//                    unitPrice (case price at the time, null for unpriced lines), lineTotal }
// Names, sizes and prices are copied as they were when saved, so later catalog edits never change
// a past order. `text` is exactly what was shared. Saving the same supplier's unchanged order again
// does not add a duplicate. Nothing here ever changes or clears the current order. "Sent" is only
// ever set by the person; the app cannot know whether a message was delivered.
import { OrderUnit } from './supplierWorkflow';
import { SummaryGroup } from './orderSummary';

export const ORDER_HISTORY_KEY = 'inventory_orderHistory';
export const ORDER_HISTORY_SCHEMA_VERSION = 1;

export type HistoryStatus = 'prepared' | 'sent';

export interface HistoryLine {
  productId: string;
  name: string;
  flavor: string;
  size: string;
  quantity: number;
  unit: OrderUnit;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface HistoryEntry {
  id: string;
  savedAt: string;
  supplierId: string;
  supplierName: string;
  status: HistoryStatus;
  sentAt?: string;
  lines: HistoryLine[];
  subtotal: number | null;
  text: string;
}

export interface OrderHistoryDoc {
  schemaVersion: number;
  entries: HistoryEntry[];
}

export const emptyOrderHistory = (): OrderHistoryDoc => ({ schemaVersion: ORDER_HISTORY_SCHEMA_VERSION, entries: [] });

export const newHistoryId = (now: Date) => `ord-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** A snapshot of one supplier's part of the order, as it is right now. */
export const snapshotFromGroup = (group: SummaryGroup, text: string, now = new Date(), id = newHistoryId(now)): HistoryEntry => ({
  id,
  savedAt: now.toISOString(),
  supplierId: group.supplier.id,
  supplierName: group.supplier.name,
  status: 'prepared',
  lines: group.lines.map(line => ({
    productId: line.product.id,
    name: line.product.name,
    flavor: line.product.flavor,
    size: line.product.size,
    quantity: line.item.quantity,
    unit: line.unit,
    unitPrice: line.priced ? line.product.costPrice : null,
    lineTotal: line.lineTotal,
  })),
  subtotal: group.subtotal,
  text,
});

const fingerprint = (entry: Pick<HistoryEntry, 'supplierId' | 'lines'>) =>
  [entry.supplierId, ...entry.lines.map(l => `${l.productId}|${l.unit}|${l.quantity}`).sort()].join('\n');

/**
 * Adds a snapshot, newest first. If the newest saved order for that supplier has exactly the same
 * lines, nothing is added and that entry is returned as `existing`.
 */
export const withSnapshot = (doc: OrderHistoryDoc, entry: HistoryEntry): { doc: OrderHistoryDoc; existing: HistoryEntry | null } => {
  const latest = doc.entries.find(e => e.supplierId === entry.supplierId);
  if (latest && fingerprint(latest) === fingerprint(entry)) return { doc, existing: latest };
  return { doc: { ...doc, entries: [entry, ...doc.entries] }, existing: null };
};

export const withStatus = (doc: OrderHistoryDoc, id: string, status: HistoryStatus, now = new Date()): OrderHistoryDoc => ({
  ...doc,
  entries: doc.entries.map(e => {
    if (e.id !== id) return e;
    if (status === 'sent') return { ...e, status, sentAt: now.toISOString() };
    const { sentAt: _sentAt, ...rest } = e;
    return { ...rest, status };
  }),
});

export const withoutEntry = (doc: OrderHistoryDoc, id: string): OrderHistoryDoc => ({ ...doc, entries: doc.entries.filter(e => e.id !== id) });

export const unitsOf = (entry: HistoryEntry) => entry.lines.reduce((total, line) => total + line.quantity, 0);

// --- Validation of the stored document -----------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isDate = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isNumberOrNull = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value));

/** Problems with a stored history; empty when it is safe to load. Extra fields are allowed. */
export const validateOrderHistoryValue = (value: unknown): string[] => {
  if (!isObject(value)) return ['The order history is not a record.'];
  if (typeof value.schemaVersion !== 'number') return ['The order history has no schema version.'];
  if (!Array.isArray(value.entries)) return ['The order history has no list of orders.'];
  const problems: string[] = [];
  const seen = new Set<string>();
  value.entries.forEach((entry, index) => {
    if (problems.length >= 5) return;
    const where = `Saved order #${index + 1}`;
    if (!isObject(entry)) return void problems.push(`${where} is not a record.`);
    if (typeof entry.id !== 'string' || !entry.id) return void problems.push(`${where} has no id.`);
    if (seen.has(entry.id)) return void problems.push(`${where} id "${entry.id}" appears more than once.`);
    seen.add(entry.id);
    if (!isDate(entry.savedAt)) return void problems.push(`${where} has no valid date.`);
    if (typeof entry.supplierId !== 'string' || typeof entry.supplierName !== 'string') return void problems.push(`${where} has no supplier.`);
    if (entry.status !== 'prepared' && entry.status !== 'sent') return void problems.push(`${where} has an unknown status.`);
    if (typeof entry.text !== 'string' || !isNumberOrNull(entry.subtotal)) return void problems.push(`${where} has no text or subtotal.`);
    if (!Array.isArray(entry.lines)) return void problems.push(`${where} has no lines.`);
    const bad = entry.lines.some(
      line =>
        !isObject(line) || typeof line.productId !== 'string' || typeof line.name !== 'string' || typeof line.flavor !== 'string' ||
        typeof line.size !== 'string' || typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) ||
        (line.unit !== 'case' && line.unit !== 'item') || !isNumberOrNull(line.unitPrice) || !isNumberOrNull(line.lineTotal),
    );
    if (bad) problems.push(`${where} has an invalid line.`);
  });
  return problems;
};
