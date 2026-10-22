// utils/assistant/tools.ts
//
// The assistant's tools: the ONLY way the assistant (the local command reader today, a real AI
// model later) reads or changes the app. They call the app's own data functions through
// AssistantServices; there is no second order or stock store.
//
// Each tool has a kind:
//   read     reads only;
//   write    changes the DRAFT order (validated, all-or-nothing, with Undo). A draft is never sent;
//   confirm  changes saved knowledge (the store profile); only runs after the person confirms.
// No tool can send or share an order, save or clear a stock count, upload anything or use the
// network. Arguments are checked here, whoever produced them (person, parser or model).
import { OrderItem, Product, Supplier } from '../../types';
import { HistoryEntry } from '../orderHistory';
import { supplierPattern, SupplierPattern } from '../orderPatterns';
import { Proposal, proposeReorder } from '../reorder';
import { StockView } from '../stockCounts';
import { Fact, ProductField, StoreProfile, SupplierField, validateStoreProfileValue, withProductFact, withSupplierFact } from '../storeProfile';
import { OrderUnit, lineUnit } from '../supplierWorkflow';
import { searchProducts } from './catalogSearch';
import { ChangeLine, OrderChange, isValidQuantity, planOrderChanges, undoOrderChanges } from './orderChanges';

export interface AssistantServices {
  products: readonly Product[];
  suppliers: readonly Supplier[];
  orderItems: () => readonly OrderItem[];
  unitFor: (product: Product) => OrderUnit;
  getStock: (product: Product) => StockView;
  editOrderItems: (change: (items: OrderItem[]) => OrderItem[] | null) => boolean;
  profile: () => StoreProfile;
  updateProfile: (change: (profile: StoreProfile) => StoreProfile) => boolean;
  history: () => readonly HistoryEntry[];
  now: () => Date;
}

export type ToolKind = 'read' | 'write' | 'confirm';

// --- Read tools ------------------------------------------------------------------------------

export const searchCatalog = (s: AssistantServices, args: { query: string; supplierId?: string; inDraftOnly?: boolean }) => {
  const within = args.inDraftOnly ? new Set(s.orderItems().map(i => i.productId)) : undefined;
  return searchProducts(args.query, s.products, s.suppliers, { within, supplierId: args.supplierId }).products;
};

export interface DraftLine {
  productId: string;
  unit: OrderUnit;
  quantity: number;
}

/** The draft order, by supplier (only suppliers with lines). */
export const readDraft = (s: AssistantServices, args: { supplierId?: string } = {}) => {
  const bySupplier = new Map<string, DraftLine[]>();
  for (const item of s.orderItems()) {
    const product = s.products.find(p => p.id === item.productId);
    if (!product || (args.supplierId && product.supplierId !== args.supplierId)) continue;
    const list = bySupplier.get(product.supplierId) ?? [];
    list.push({ productId: product.id, unit: lineUnit(item), quantity: item.quantity });
    bySupplier.set(product.supplierId, list);
  }
  return [...bySupplier.entries()].map(([supplierId, lines]) => ({ supplierId, lines }));
};

export const readStock = (s: AssistantServices, args: { productId: string }) => {
  const product = s.products.find(p => p.id === args.productId);
  return product ? { product, stock: s.getStock(product) } : null;
};

export const readStoreFacts = (s: AssistantServices, args: { supplierId: string }) => {
  const profile = s.profile();
  return {
    supplier: profile.suppliers[args.supplierId] ?? {},
    products: s.products
      .filter(p => p.supplierId === args.supplierId && profile.products[p.id])
      .map(p => ({ product: p, facts: profile.products[p.id] })),
  };
};

export const readOrderPattern = (s: AssistantServices, args: { supplierId: string }): SupplierPattern | null =>
  supplierPattern(s.history(), args.supplierId, s.now());

/** Reorder suggestions for every product of the supplier that has a weekly baseline. */
export const proposeSupplierOrder = (s: AssistantServices, args: { supplierId: string }): { product: Product; proposal: Proposal }[] => {
  const profile = s.profile();
  const days = profile.suppliers[args.supplierId]?.deliveryDays?.value;
  return s.products
    .filter(p => p.supplierId === args.supplierId && profile.products[p.id]?.weeklyCases && profile.products[p.id]?.carried?.value !== false)
    .map(p => ({ product: p, proposal: proposeReorder(p, s.getStock(p), profile.products[p.id], days, s.now()) }));
};

// --- Write tools (draft order only) ------------------------------------------------------------

export type ChangeResult = { ok: true; lines: ChangeLine[] } | { ok: false; reason: 'unknown-product' | 'bad-quantity' | 'not-in-order' | 'nothing' | 'invalid'; productId?: string };

const validChange = (c: unknown): c is OrderChange => {
  if (typeof c !== 'object' || c === null) return false;
  const v = c as Record<string, unknown>;
  if (typeof v.productId !== 'string') return false;
  if (v.op === 'remove') return true;
  return (v.op === 'add' || v.op === 'set') && isValidQuantity(v.quantity);
};

/** Applies every change to the draft order, or none. */
export const changeDraft = (s: AssistantServices, args: { changes: unknown }): ChangeResult => {
  if (!Array.isArray(args.changes) || !args.changes.length || args.changes.length > 50 || !args.changes.every(validChange)) return { ok: false, reason: 'invalid' };
  let outcome: ChangeResult = { ok: false, reason: 'nothing' };
  s.editOrderItems(items => {
    const plan = planOrderChanges(items, args.changes as OrderChange[], s.products, s.unitFor);
    if (!plan.ok) {
      outcome = plan;
      return null;
    }
    outcome = { ok: true, lines: plan.lines };
    return plan.items;
  });
  return outcome;
};

/** Undo of one change: only if every line is still as that change left it. */
export const undoDraftChange = (s: AssistantServices, args: { lines: readonly ChangeLine[] }): boolean => {
  let done = false;
  s.editOrderItems(items => {
    const next = undoOrderChanges(items, args.lines);
    done = !!next;
    return next;
  });
  return done;
};

// --- Confirm tools (saved knowledge, after the person says yes) ---------------------------------

export type StoreFact =
  | { scope: 'supplier'; id: string; field: SupplierField; fact: Fact<unknown> | null }
  | { scope: 'product'; id: string; field: ProductField; fact: Fact<unknown> | null };

/** Saves store facts, all together. Only called after an explicit confirmation. */
export const saveStoreFacts = (s: AssistantServices, args: { facts: readonly StoreFact[] }): boolean => {
  const known = (f: StoreFact) => (f.scope === 'supplier' ? s.suppliers.some(x => x.id === f.id) : s.products.some(x => x.id === f.id));
  if (!args.facts.length || !args.facts.every(known)) return false;
  const apply = (profile: StoreProfile) =>
    args.facts.reduce(
      (p, f) => (f.scope === 'supplier' ? withSupplierFact(p, f.id, f.field, f.fact as never) : withProductFact(p, f.id, f.field, f.fact as never)),
      profile,
    );
  // Never save anything the profile would refuse to load.
  if (validateStoreProfileValue(apply(s.profile())).length) return false;
  return s.updateProfile(apply);
};

// --- For a future model (provider-neutral) ------------------------------------------------------

/**
 * The tools a real AI model may call, as JSON-Schema-like definitions. A model gateway (docs,
 * §4) would send these, receive tool calls, and run them ONLY through callTool below: names are
 * checked, arguments re-validated, and 'confirm' tools never run without the person's yes.
 */
export const TOOL_DEFINITIONS = [
  { name: 'search_catalog', kind: 'read', description: 'Find catalog products by words (brand, flavor, size, supplier, UPC).', parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, supplierId: { type: 'string' }, inDraftOnly: { type: 'boolean' } } } },
  { name: 'read_draft', kind: 'read', description: 'The draft order lines by supplier.', parameters: { type: 'object', properties: { supplierId: { type: 'string' } } } },
  { name: 'read_stock', kind: 'read', description: 'Verified stock of one product: verified, not counted (unknown), or not tracked.', parameters: { type: 'object', required: ['productId'], properties: { productId: { type: 'string' } } } },
  { name: 'read_store_facts', kind: 'read', description: "This store's delivery days and weekly baselines, each with its source.", parameters: { type: 'object', required: ['supplierId'], properties: { supplierId: { type: 'string' } } } },
  { name: 'read_order_pattern', kind: 'read', description: 'How often products were ordered in saved orders (not sales).', parameters: { type: 'object', required: ['supplierId'], properties: { supplierId: { type: 'string' } } } },
  { name: 'propose_order', kind: 'read', description: 'Rule-based reorder suggestions with their basis.', parameters: { type: 'object', required: ['supplierId'], properties: { supplierId: { type: 'string' } } } },
  { name: 'change_draft', kind: 'write', description: 'Add, set or remove draft order lines (all or nothing). Never sends.', parameters: { type: 'object', required: ['changes'], properties: { changes: { type: 'array', maxItems: 50, items: { type: 'object', required: ['op', 'productId'], properties: { op: { enum: ['add', 'set', 'remove'] }, productId: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 999 } } } } } } },
  { name: 'save_store_facts', kind: 'confirm', description: 'Save store facts (delivery days, weekly baselines). Needs the person to confirm.', parameters: { type: 'object', required: ['facts'], properties: { facts: { type: 'array' } } } },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];

export type ToolCallResult = { ok: true; result: unknown } | { ok: false; error: 'unknown-tool' | 'invalid-arguments' | 'needs-confirmation' };

/**
 * The single entry point for tool calls from a model. `confirmed` must come from the person's own
 * tap on a confirmation the app showed, never from the model.
 */
export const callTool = (s: AssistantServices, name: string, args: unknown, confirmed = false): ToolCallResult => {
  const def = TOOL_DEFINITIONS.find(d => d.name === name);
  if (!def) return { ok: false, error: 'unknown-tool' };
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return { ok: false, error: 'invalid-arguments' };
  const a = args as Record<string, unknown>;
  const str = (k: string, required = true) => (a[k] === undefined ? !required : typeof a[k] === 'string' && (a[k] as string).length <= 200);
  switch (def.name) {
    case 'search_catalog':
      return str('query') && str('supplierId', false) ? { ok: true, result: searchCatalog(s, a as { query: string }).map(p => p.id) } : { ok: false, error: 'invalid-arguments' };
    case 'read_draft':
      return str('supplierId', false) ? { ok: true, result: readDraft(s, a as { supplierId?: string }) } : { ok: false, error: 'invalid-arguments' };
    case 'read_stock':
      return str('productId') ? { ok: true, result: readStock(s, a as { productId: string })?.stock ?? null } : { ok: false, error: 'invalid-arguments' };
    case 'read_store_facts':
      return str('supplierId') ? { ok: true, result: readStoreFacts(s, a as { supplierId: string }) } : { ok: false, error: 'invalid-arguments' };
    case 'read_order_pattern':
      return str('supplierId') ? { ok: true, result: readOrderPattern(s, a as { supplierId: string }) } : { ok: false, error: 'invalid-arguments' };
    case 'propose_order':
      return str('supplierId') ? { ok: true, result: proposeSupplierOrder(s, a as { supplierId: string }).map(x => x.proposal) } : { ok: false, error: 'invalid-arguments' };
    case 'change_draft': {
      const result = changeDraft(s, { changes: a.changes });
      return 'reason' in result && result.reason === 'invalid' ? { ok: false, error: 'invalid-arguments' } : { ok: true, result };
    }
    case 'save_store_facts':
      if (!confirmed) return { ok: false, error: 'needs-confirmation' };
      return Array.isArray(a.facts) ? { ok: true, result: saveStoreFacts(s, { facts: a.facts as StoreFact[] }) } : { ok: false, error: 'invalid-arguments' };
  }
};
