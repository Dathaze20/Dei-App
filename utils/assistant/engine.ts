// utils/assistant/engine.ts
//
// The local assistant's conversation: what was said (or tapped) → tool calls → replies. Pure:
// given the same state, event and services it does the same thing, so every path is tested
// without the screen (utils/assistant/engine.test.ts).
//
// Rules it keeps:
//   - Only real catalog products, found by utils/assistant/catalogSearch.ts. Several matches →
//     the person chooses; nothing is guessed.
//   - Several products in one sentence are applied together, as one change with one Undo, only
//     after every product is known.
//   - Draft order changes apply at once (the draft is never sent) and always show what changed.
//   - Saved knowledge (delivery days, weekly baselines) is only saved after "Save" is tapped.
//   - It never sends or shares an order, never saves or clears a stock count, never claims to
//     have looked at a photo, and says when it does not understand.
import { Product } from '../../types';
import { isEstimate, nextDeliveryDate, Weekday, fact } from '../storeProfile';
import { ChangeLine, OrderChange } from './orderChanges';
import { findSupplier, searchProducts } from './catalogSearch';
import { ItemRequest, Intent, parseCommand } from './parseCommand';
import {
  AssistantServices, StoreFact, changeDraft, proposeSupplierOrder, readDraft, readOrderPattern, readStock, readStoreFacts, saveStoreFacts, undoDraftChange,
} from './tools';


/** A phrase to show, by string key (rendered in the person's language). */
export interface Say {
  key: string;
  params?: Record<string, string | number>;
}

export interface ProposalView {
  productId: string;
  kind: 'calculated' | 'typical' | 'unknown';
  cases: number | null;
  weekly?: number;
  weeklyEstimate?: boolean;
  onHand?: number;
  countedAt?: string;
  keep?: number;
  coverDays: number;
  untilDelivery?: number;
}

export interface UsualView {
  productId: string;
  weekly?: { value: number; estimate: boolean; source: string; at: string };
  pattern?: { orders: number; perOrder: number; perWeek: number; unit: string };
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  via?: 'text' | 'voice';
  say?: Say[];
  changes?: { actionId: string; lines: ChangeLine[]; undone?: boolean };
  choices?: { productIds: string[] };
  supplierChoices?: string[];
  days?: { supplierId: string; selected: Weekday[] };
  confirm?: { id: string; label: Say; resolved?: 'yes' | 'no' | 'answered' };
  proposal?: { supplierId: string; lines: ProposalView[] };
  usual?: { supplierId: string; lines: UsualView[]; basis: 'sent' | 'saved' | null; orders: number; weeks: number };
  order?: { supplierId: string; lines: { productId: string; unit: string; quantity: number }[] }[];
  links?: { to: string; label: Say }[];
}

type Op = 'add' | 'set' | 'remove';
interface Queued {
  op: Op;
  item: ItemRequest;
}

export type Pending =
  | { kind: 'choose'; current: Queued; candidates: string[]; queue: Queued[]; resolved: OrderChange[] }
  | { kind: 'weekly-choose'; quantity: number; days: Weekday[]; candidates: string[] }
  | { kind: 'supplier'; then: 'need' | 'usual' | 'setup' }
  | { kind: 'setup-days'; supplierId: string }
  | { kind: 'setup-products'; supplierId: string };

type Confirmable = { kind: 'facts'; facts: StoreFact[]; then?: Pending } | { kind: 'changes'; changes: OrderChange[] };

export interface EngineState {
  pending: Pending | null;
  /** Products of the last request, for "that one" / "it". */
  lastProductIds: string[];
  actions: Record<string, { lines: ChangeLine[]; undone: boolean }>;
  lastActionId: string | null;
  confirms: Record<string, Confirmable>;
  counter: number;
}

export const emptyEngineState = (): EngineState => ({ pending: null, lastProductIds: [], actions: {}, lastActionId: null, confirms: {}, counter: 0 });

export type EngineEvent =
  | { type: 'text'; text: string; via?: 'text' | 'voice' }
  | { type: 'choose'; productId: string }
  | { type: 'supplier'; supplierId: string }
  | { type: 'days'; supplierId: string; days: Weekday[] }
  | { type: 'confirm'; id: string; yes: boolean }
  | { type: 'undo'; actionId?: string };

export interface EngineContext {
  /** The supplier shown on Counter, used when a question names none. */
  currentSupplierId: string | null;
}

export interface EngineOutput {
  state: EngineState;
  messages: AssistantMessage[];
}

const MAX_CHOICES = 8;

export const respond = (state0: EngineState, event: EngineEvent, s: AssistantServices, ctx: EngineContext): EngineOutput => {
  const state: EngineState = { ...state0, actions: { ...state0.actions }, confirms: { ...state0.confirms }, lastProductIds: [...state0.lastProductIds] };
  const out: AssistantMessage[] = [];
  const id = (prefix: string) => `${prefix}${++state.counter}`;
  const reply = (m: Omit<AssistantMessage, 'id' | 'role'>) => out.push({ id: id('m'), role: 'assistant', ...m });
  const say = (key: string, params?: Say['params']) => reply({ say: [{ key, params }] });
  const supplierName = (sid: string) => s.suppliers.find(x => x.id === sid)?.name ?? '';
  const product = (pid: string) => s.products.find(p => p.id === pid);

  // --- Draft order changes --------------------------------------------------------------------
  const apply = (changes: OrderChange[]) => {
    const result = changeDraft(s, { changes });
    if ('reason' in result) {
      const p = result.productId ? product(result.productId) : undefined;
      if (result.reason === 'not-in-order' && p) say('a_notInOrder', { name: fullName(p) });
      else if (result.reason === 'bad-quantity') say('a_badQuantityLine');
      else say('a_nothing');
      return;
    }
    const actionId = id('act');
    state.actions[actionId] = { lines: result.lines, undone: false };
    state.lastActionId = actionId;
    state.lastProductIds = result.lines.map(l => l.productId);
    reply({ say: [{ key: 'a_changed' }], changes: { actionId, lines: result.lines }, links: [{ to: '/counter/orders', label: { key: 'a_openOrders' } }] });
  };

  /** Resolves queued requests one by one; asks when one is not clear; applies all at the end. */
  const work = (queue: Queued[], resolved: OrderChange[]) => {
    const rest = [...queue];
    while (rest.length) {
      const next = rest.shift()!;
      const { item, op } = next;
      if (op !== 'remove' && item.quantity !== null && (item.quantity < 1 || item.quantity > 999)) {
        say('a_badQuantity', { said: item.quantity });
        return;
      }
      let candidates: Product[];
      if (item.query === null) {
        candidates = state.lastProductIds.map(product).filter((p): p is Product => !!p);
        if (!candidates.length) {
          say('a_refNone');
          return;
        }
      } else {
        // Remove and change look in the draft first ("remove fruit punch" = the one on the order).
        const inDraft = op !== 'add' ? searchProducts(item.query, s.products, s.suppliers, { within: new Set(s.orderItems().map(i => i.productId)) }).products : [];
        candidates = inDraft.length ? inDraft : searchProducts(item.query, s.products, s.suppliers).products;
      }
      if (!candidates.length) {
        say('a_notFound', { query: item.query ?? '' });
        return;
      }
      if (candidates.length > 1) {
        state.pending = { kind: 'choose', current: next, candidates: candidates.slice(0, MAX_CHOICES).map(p => p.id), queue: rest, resolved };
        reply({ say: [{ key: candidates.length > MAX_CHOICES ? 'a_chooseMany' : 'a_choose', params: { query: item.query ?? '', count: candidates.length } }], choices: { productIds: candidates.slice(0, MAX_CHOICES).map(p => p.id) } });
        return;
      }
      resolved = [...resolved, toChange(next, candidates[0])];
    }
    state.pending = null;
    apply(resolved);
  };

  const toChange = (q: Queued, p: Product): OrderChange =>
    q.op === 'remove' ? { op: 'remove', productId: p.id } : { op: q.op, productId: p.id, quantity: q.item.quantity ?? 1 };

  // --- Knowledge to confirm -------------------------------------------------------------------
  const askToSave = (facts: StoreFact[], label: Say, then?: Pending) => {
    const cid = id('c');
    state.confirms[cid] = { kind: 'facts', facts, then };
    reply({ confirm: { id: cid, label } });
  };

  const weeklyFacts = (p: Product, quantity: number, days: Weekday[]): StoreFact[] => {
    const now = s.now();
    const facts: StoreFact[] = [{ scope: 'product', id: p.id, field: 'weeklyCases', fact: fact(quantity, 'owner-estimate', now) }];
    if (days.length) facts.push({ scope: 'supplier', id: p.supplierId, field: 'deliveryDays', fact: fact(days, 'owner-estimate', now) });
    return facts;
  };

  const askWeekly = (p: Product, quantity: number, days: Weekday[], then?: Pending) => {
    state.lastProductIds = [p.id];
    askToSave(weeklyFacts(p, quantity, days), { key: days.length ? 'a_weeklyConfirmDays' : 'a_weeklyConfirm', params: { name: fullName(p), quantity, supplier: supplierName(p.supplierId), days: days.join(',') } }, then);
  };

  // --- Questions ----------------------------------------------------------------------------
  const pickSupplier = (text: string, then: 'need' | 'usual' | 'setup'): string | null => {
    const named = findSupplier(text, s.suppliers);
    if (named) return named.id;
    if (then !== 'setup' && ctx.currentSupplierId && s.suppliers.some(x => x.id === ctx.currentSupplierId)) return ctx.currentSupplierId;
    state.pending = { kind: 'supplier', then };
    reply({ say: [{ key: then === 'setup' ? 'a_setupStart' : 'a_whichSupplier' }], supplierChoices: [...s.suppliers].sort((a, b) => a.name.localeCompare(b.name)).map(x => x.id) });
    return null;
  };

  const need = (supplierId: string) => {
    const proposals = proposeSupplierOrder(s, { supplierId });
    const days = s.profile().suppliers[supplierId]?.deliveryDays?.value;
    const next = nextDeliveryDate(days, s.now());
    if (!proposals.length) {
      say('a_needNone', { supplier: supplierName(supplierId) });
      usual(supplierId, true);
      return;
    }
    const lines: ProposalView[] = proposals.map(({ product: p, proposal }) => ({
      productId: p.id, kind: proposal.kind, cases: proposal.cases,
      weekly: proposal.basis.weekly?.value, weeklyEstimate: isEstimate(proposal.basis.weekly),
      onHand: proposal.basis.onHand?.units, countedAt: proposal.basis.onHand?.countedAt, keep: proposal.basis.keepOnHand,
      coverDays: proposal.basis.cycleDays, untilDelivery: proposal.basis.daysUntilDelivery,
    }));
    reply({
      say: [
        { key: next ? 'a_needFor' : 'a_needForNoDays', params: { supplier: supplierName(supplierId), date: next ? next.toISOString() : '' } },
      ],
      proposal: { supplierId, lines },
    });
    const changes = lines.filter(l => l.cases && l.cases > 0).map(l => ({ op: 'set' as const, productId: l.productId, quantity: l.cases! }));
    if (changes.length) {
      const cid = id('c');
      state.confirms[cid] = { kind: 'changes', changes };
      reply({ confirm: { id: cid, label: { key: 'a_putOnDraft', params: { count: changes.length } } } });
    }
    say('a_neverSend');
  };

  const usual = (supplierId: string, quiet = false) => {
    const facts = readStoreFacts(s, { supplierId });
    const pattern = readOrderPattern(s, { supplierId });
    const lines = new Map<string, UsualView>();
    for (const { product: p, facts: f } of facts.products) {
      if (f.weeklyCases) lines.set(p.id, { productId: p.id, weekly: { value: f.weeklyCases.value, estimate: isEstimate(f.weeklyCases), source: f.weeklyCases.source, at: f.weeklyCases.at } });
    }
    for (const line of pattern?.products ?? []) {
      if (!s.products.some(p => p.id === line.productId)) continue;
      lines.set(line.productId, { ...lines.get(line.productId), productId: line.productId, pattern: { orders: line.orders, perOrder: line.perOrder, perWeek: line.perWeek, unit: line.unit } });
    }
    if (!lines.size) {
      if (!quiet) say('a_usualNone', { supplier: supplierName(supplierId) });
      say('a_teachHint');
      return;
    }
    reply({
      say: [{ key: 'a_usualFor', params: { supplier: supplierName(supplierId) } }],
      usual: { supplierId, lines: [...lines.values()].slice(0, 20), basis: pattern?.basis ?? null, orders: pattern?.ordersInWindow ?? 0, weeks: pattern?.weeks ?? 0 },
    });
    say('a_notBestsellers');
  };

  const review = (text: string) => {
    const named = findSupplier(text, s.suppliers);
    const groups = readDraft(s, named ? { supplierId: named.id } : {});
    if (!groups.length) {
      say(named ? 'a_draftEmptyFor' : 'a_draftEmpty', { supplier: named?.name ?? '' });
      return;
    }
    reply({ say: [{ key: 'a_draft' }], order: groups, links: [{ to: '/counter/orders', label: { key: 'a_openOrders' } }] });
    state.lastProductIds = groups.flatMap(g => g.lines.map(l => l.productId));
  };

  const stock = (query: string) => {
    const found = searchProducts(query, s.products, s.suppliers).products;
    if (!found.length) return say('a_notFound', { query });
    if (found.length > 1) {
      // Read-only: show each, nothing to choose.
      for (const p of found.slice(0, 5)) stockLine(p);
      if (found.length > 5) say('a_moreMatches', { count: found.length - 5 });
      return;
    }
    stockLine(found[0]);
  };

  const stockLine = (p: Product) => {
    const view = readStock(s, { productId: p.id })!.stock;
    const name = fullName(p);
    state.lastProductIds = [p.id];
    if (view.state === 'not-tracked') return say('a_stockUntracked', { name });
    if (view.state === 'unavailable') return say('a_stockUnavailable', { name });
    if (view.state === 'unverified') return say('a_stockUnknown', { name });
    const hours = (s.now().getTime() - Date.parse(view.countedAt)) / 3_600_000;
    say(view.units === 0 ? 'a_stockOut' : hours > 48 ? 'a_stockStale' : 'a_stockVerified', { name, units: view.units, date: view.countedAt });
  };

  // --- Commands -----------------------------------------------------------------------------
  const command = (intent: Intent, raw: string) => {
    switch (intent.type) {
      case 'add':
      case 'remove':
      case 'set':
        return work(intent.items.map(item => ({ op: intent.type as Op, item })), []);
      case 'review':
        return review(raw);
      case 'need': {
        const sid = pickSupplier(raw, 'need');
        return sid ? need(sid) : undefined;
      }
      case 'usual': {
        const sid = pickSupplier(raw, 'usual');
        return sid ? usual(sid) : undefined;
      }
      case 'stock':
        return stock(intent.query);
      case 'delivery': {
        const named = findSupplier(raw, s.suppliers);
        if (!named) return say('a_whichSupplierDelivery');
        return askToSave([{ scope: 'supplier', id: named.id, field: 'deliveryDays', fact: fact(intent.days, 'owner-estimate', s.now()) }], { key: 'a_deliveryConfirm', params: { supplier: named.name, days: intent.days.join(',') } });
      }
      case 'weekly': {
        const found = searchProducts(intent.query, s.products, s.suppliers).products;
        if (!found.length) return say('a_notFound', { query: intent.query });
        if (found.length > 1) {
          state.pending = { kind: 'weekly-choose', quantity: intent.quantity, days: intent.days, candidates: found.slice(0, MAX_CHOICES).map(p => p.id) };
          return reply({ say: [{ key: 'a_choose', params: { query: intent.query, count: found.length } }], choices: { productIds: found.slice(0, MAX_CHOICES).map(p => p.id) } });
        }
        return askWeekly(found[0], intent.quantity, intent.days);
      }
      case 'undo':
        return undo(state.lastActionId);
      case 'setup': {
        const sid = pickSupplier(raw, 'setup');
        return sid ? setupDays(sid) : undefined;
      }
      case 'photo':
        return reply({ say: [{ key: 'a_photo' }], links: [{ to: '/counter/shelf', label: { key: 'a_openCamera' } }] });
      case 'send':
        return reply({ say: [{ key: 'a_send' }], links: [{ to: '/counter/orders', label: { key: 'a_openOrders' } }] });
      case 'help':
        return say('a_help');
      case 'bad-quantity':
        return say('a_badQuantity', { said: intent.said });
      case 'unknown':
        return say('a_unknown');
    }
  };

  const undo = (actionId: string | null | undefined) => {
    const action = actionId ? state.actions[actionId] : undefined;
    if (!action || action.undone) return say('a_nothingToUndo');
    if (!undoDraftChange(s, { lines: action.lines })) return say('a_undoConflict');
    state.actions[actionId!] = { ...action, undone: true };
    reply({ say: [{ key: 'a_undone' }], changes: { actionId: actionId!, lines: action.lines.map(l => ({ ...l, before: l.after, after: l.before })), undone: true } });
  };

  const setupDays = (supplierId: string) => {
    state.pending = { kind: 'setup-days', supplierId };
    reply({ say: [{ key: 'a_setupDays', params: { supplier: supplierName(supplierId) } }], days: { supplierId, selected: s.profile().suppliers[supplierId]?.deliveryDays?.value ?? [] } });
  };

  const setupProducts = (supplierId: string) => {
    state.pending = { kind: 'setup-products', supplierId };
    say('a_setupProducts', { supplier: supplierName(supplierId) });
  };

  // --- Events -------------------------------------------------------------------------------
  const pending = state.pending;
  switch (event.type) {
    case 'text': {
      const text = event.text.trim().slice(0, 500);
      if (!text) break;
      out.push({ id: id('m'), role: 'user', text, via: event.via ?? 'text' });
      // An answer to a question that is open?
      if (pending?.kind === 'choose' || pending?.kind === 'weekly-choose') {
        const narrowed = searchProducts(text, s.products, s.suppliers, { within: new Set(pending.candidates) }).products;
        // "the 16 oz bottle", "tall boy": an answer that leaves exactly one of the choices.
        if (narrowed.length === 1) return mergeOut(out, respond(state, { type: 'choose', productId: narrowed[0].id }, s, ctx));
      }
      if (pending?.kind === 'setup-products') {
        if (/^(done|that s all|thats all|finished|listo|ya|nada mas|no)$/.test(text.toLowerCase().replace(/[^a-z\s]/g, '').trim())) {
          state.pending = null;
          say('a_setupDone');
          break;
        }
        const asWeekly = parseCommand(`we usually take ${text} every week`);
        if (asWeekly.type === 'weekly') {
          const found = searchProducts(asWeekly.query, s.products, s.suppliers, { supplierId: pending.supplierId }).products;
          if (found.length === 1) {
            askWeekly(found[0], asWeekly.quantity, [], pending);
            break;
          }
          if (found.length > 1) {
            state.pending = { kind: 'weekly-choose', quantity: asWeekly.quantity, days: [], candidates: found.slice(0, MAX_CHOICES).map(p => p.id) };
            reply({ say: [{ key: 'a_choose', params: { query: asWeekly.query, count: found.length } }], choices: { productIds: found.slice(0, MAX_CHOICES).map(p => p.id) } });
            break;
          }
        }
      }
      const intent = parseCommand(text);
      if (pending && intent.type !== 'unknown') state.pending = null;
      if (pending && intent.type === 'unknown' && (pending.kind === 'choose' || pending.kind === 'weekly-choose')) {
        say('a_stillChoosing');
        break;
      }
      if (pending?.kind === 'setup-products' && intent.type === 'unknown') {
        say('a_setupProductsHint');
        break;
      }
      command(intent, text);
      break;
    }
    case 'choose': {
      if (pending?.kind === 'choose' && pending.candidates.includes(event.productId)) {
        const p = product(event.productId)!;
        state.pending = null;
        work(pending.queue, [...pending.resolved, toChange(pending.current, p)]);
      } else if (pending?.kind === 'weekly-choose' && pending.candidates.includes(event.productId)) {
        state.pending = null;
        askWeekly(product(event.productId)!, pending.quantity, pending.days);
      } else say('a_expired');
      break;
    }
    case 'supplier': {
      if (pending?.kind !== 'supplier' || !s.suppliers.some(x => x.id === event.supplierId)) {
        say('a_expired');
        break;
      }
      state.pending = null;
      if (pending.then === 'need') need(event.supplierId);
      else if (pending.then === 'usual') usual(event.supplierId);
      else setupDays(event.supplierId);
      break;
    }
    case 'days': {
      if (pending?.kind !== 'setup-days' || pending.supplierId !== event.supplierId) {
        say('a_expired');
        break;
      }
      const days = [...new Set(event.days)].filter(d => d >= 0 && d <= 6).sort((a, b) => a - b) as Weekday[];
      if (!days.length) {
        setupProducts(event.supplierId);
        break;
      }
      state.pending = null;
      askToSave([{ scope: 'supplier', id: event.supplierId, field: 'deliveryDays', fact: fact(days, 'owner-estimate', s.now()) }], { key: 'a_deliveryConfirm', params: { supplier: supplierName(event.supplierId), days: days.join(',') } }, { kind: 'setup-products', supplierId: event.supplierId });
      break;
    }
    case 'confirm': {
      const item = state.confirms[event.id];
      // Each confirmation runs once: a second tap (or a repeated event) does nothing.
      if (!item) break;
      delete state.confirms[event.id];
      if (!event.yes) {
        say('a_declined');
        if (item.kind === 'facts' && item.then) {
          if (item.then.kind === 'setup-products') setupProducts(item.then.supplierId);
        }
        break;
      }
      if (item.kind === 'changes') apply(item.changes);
      else if (saveStoreFacts(s, { facts: item.facts })) {
        reply({ say: [{ key: 'a_saved' }], links: [{ to: '/counter/store', label: { key: 'a_openStore' } }] });
        if (item.then?.kind === 'setup-products') {
          if (pending?.kind === 'setup-products') state.pending = pending;
          else setupProducts(item.then.supplierId);
        }
      } else say('a_saveFailed');
      break;
    }
    case 'undo':
      undo(event.actionId ?? state.lastActionId);
      break;
  }
  return { state, messages: out };
};

const mergeOut = (before: AssistantMessage[], next: EngineOutput): EngineOutput => ({ state: next.state, messages: [...before, ...next.messages] });

export const fullName = (p: Pick<Product, 'name' | 'flavor' | 'size'>) => [p.name, p.flavor, p.size].filter(Boolean).join(' ');
