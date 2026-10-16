import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { translations } from '../contexts/LanguageContext';
import { OrderItem, Product, Supplier } from '../types';
import { OrderTextKey, buildOrderSummary, buildOrderText } from './orderSummary';
import { groupSupplierProducts } from './productGrouping';
import {
  ItemListTextKey,
  buildItemListText,
  checklistRows,
  draftLineCounts,
  lineQuantity,
  supplierDraftItems,
  supplierDraftSummary,
  supplierDraftText,
} from './supplierDraft';

// The real catalog and the real saved Arizona order (2 lines, $77.98) from PR #1.
const REAL = JSON.parse(readFileSync('fixtures/exports/pr1-b291176-arizona-demo.json', 'utf8')).raw as Record<string, string>;
const products: Product[] = JSON.parse(REAL.inventory_products);
const suppliers: Supplier[] = JSON.parse(REAL.inventory_suppliers);
const arizonaOrder: OrderItem[] = JSON.parse(REAL.inventory_currentOrder).items;
const getProduct = (id: string) => products.find(p => p.id === id);
const getSupplier = (id: string) => suppliers.find(s => s.id === id);
const NOW = new Date('2026-10-15T13:05:00.000Z');
const tFor = (lang: 'en' | 'es' | 'ar') => (key: ItemListTextKey) => translations[lang][key];

// A mixed order built only from real product ids: the saved Arizona lines, a Pepsi case line,
// Boar's Head item lines and one Boar's Head case line saved before C1.
const mixed: OrderItem[] = [
  ...arizonaOrder,
  { productId: 'pep_orig_bot20', quantity: 2 },
  { productId: 'bh_provolone', quantity: 2, unit: 'item' },
  { productId: 'bh_turkey', quantity: 1, unit: 'item' },
  { productId: 'bh_ham', quantity: 1 },
];

describe('per-supplier drafts are views of the one saved order', () => {
  it('filters by supplier with no lines from other suppliers', () => {
    expect(supplierDraftItems(mixed, 'sup6', getProduct)).toEqual(arizonaOrder);
    expect(supplierDraftItems(mixed, 'sup3', getProduct)).toEqual([{ productId: 'pep_orig_bot20', quantity: 2 }]);
    expect(supplierDraftItems(mixed, 'sup1', getProduct).map(i => i.productId)).toEqual(['bh_provolone', 'bh_turkey', 'bh_ham']);
    expect(supplierDraftItems(mixed, 'sup2', getProduct)).toEqual([]);
  });

  it('every saved line belongs to exactly one supplier draft', () => {
    const all = suppliers.flatMap(s => supplierDraftItems(mixed, s.id, getProduct));
    expect(all).toHaveLength(mixed.length);
    expect(new Set(all)).toEqual(new Set(mixed));
  });

  it('lines whose product no longer exists are in no draft (as in the order summary)', () => {
    const withGone = [...arizonaOrder, { productId: 'deleted_product', quantity: 3 }];
    expect(suppliers.flatMap(s => supplierDraftItems(withGone, s.id, getProduct))).toEqual(arizonaOrder);
    expect(draftLineCounts(withGone, getProduct)).toEqual({ sup6: 2 });
  });

  it('counts lines per supplier', () => {
    expect(draftLineCounts(mixed, getProduct)).toEqual({ sup6: 2, sup3: 1, sup1: 3 });
    expect(draftLineCounts([], getProduct)).toEqual({});
  });

  it('never changes the saved order', () => {
    const before = JSON.stringify(mixed);
    suppliers.forEach(s => {
      supplierDraftItems(mixed, s.id, getProduct);
      supplierDraftSummary(mixed, s.id, getProduct, getSupplier);
    });
    expect(JSON.stringify(mixed)).toBe(before);
  });

  it('the Arizona draft summary equals the whole-order summary of the saved Arizona order ($77.98)', () => {
    const draft = supplierDraftSummary(mixed, 'sup6', getProduct, getSupplier);
    expect(draft).toEqual(buildOrderSummary(arizonaOrder, getProduct, getSupplier));
    expect(draft.groups).toHaveLength(1);
    expect(draft.pricedTotal).toBeCloseTo(77.98, 2);
  });

  it("the Boar's Head draft has no priced lines and no total", () => {
    const draft = supplierDraftSummary(mixed, 'sup1', getProduct, getSupplier);
    expect(draft.groups.map(g => g.supplier.id)).toEqual(['sup1']);
    expect(draft.hasPriced).toBe(false);
    expect(draft.pricedTotal).toBe(0);
  });

  it('the shared text for one supplier is the usual order text with only that supplier', () => {
    const t = (key: OrderTextKey) => translations.en[key];
    const text = supplierDraftText(mixed, 'sup6', getProduct, getSupplier, 'DeliOrderNYC', NOW, t);
    expect(text).toBe(buildOrderText(buildOrderSummary(arizonaOrder, getProduct, getSupplier), 'DeliOrderNYC', NOW, t));
    expect(text).not.toMatch(/PEPSI|BOAR/);
  });

  it('reads one line quantity by unit; an older case line is never read as items', () => {
    expect(lineQuantity(mixed, 'bh_provolone', 'item')).toBe(2);
    expect(lineQuantity(mixed, 'bh_ham', 'item')).toBe(0);
    expect(lineQuantity(mixed, 'bh_ham', 'case')).toBe(1);
    expect(lineQuantity(mixed, 'pep_orig_bot20', 'case')).toBe(2);
    expect(lineQuantity(mixed, 'bh_american', 'item')).toBe(0);
  });
});

describe("Boar's Head checklist", () => {
  const boarsHead = groupSupplierProducts('sup1', products).flatMap(g => g.products);

  it('selection and quantities come only from the saved order', () => {
    expect(checklistRows(boarsHead, mixed).map(r => [r.product.id, r.selected, r.quantity, r.olderCaseQuantity])).toEqual([
      ['bh_ham', false, 0, 1],
      ['bh_turkey', true, 1, 0],
      ['bh_roastbeef', false, 0, 0],
      ['bh_american', false, 0, 0],
      ['bh_provolone', true, 2, 0],
    ]);
  });

  it('with an empty order nothing is selected', () => {
    expect(checklistRows(boarsHead, []).every(r => !r.selected && r.quantity === 0 && r.olderCaseQuantity === 0)).toBe(true);
  });
});

describe("Boar's Head list text", () => {
  const groupOf = (items: OrderItem[]) => supplierDraftSummary(items, 'sup1', getProduct, getSupplier).groups[0];

  it('is MEATS then CHEESES, whole numbers, no prices, no dates', () => {
    const items: OrderItem[] = [
      { productId: 'bh_provolone', quantity: 2, unit: 'item' },
      { productId: 'bh_turkey', quantity: 1, unit: 'item' },
      { productId: 'bh_american', quantity: 3, unit: 'item' },
    ];
    expect(buildItemListText(groupOf(items), 'Deli Corner', tFor('en'))).toBe(
      [
        'DELI CORNER',
        "BOAR'S HEAD - ORDER",
        '',
        'MEATS',
        '- 1 OvenGold Turkey Breast (Roasted)',
        '',
        'CHEESES',
        '- 3 American Cheese (White)',
        '- 2 Provolone Cheese (Mild)',
      ].join('\n'),
    );
  });

  it('keeps an older case line saying it is in cases', () => {
    const text = buildItemListText(groupOf(mixed), 'Deli Corner', tFor('en'))!;
    expect(text).toContain('- 1 case(s) Deluxe Ham (Sweet) [earlier order line, in cases]');
    expect(text).not.toMatch(/\$/);
    expect(text.split('\n').filter(l => l.startsWith('- '))).toHaveLength(3);
  });

  it('leaves out every other supplier', () => {
    const text = buildItemListText(groupOf(mixed), 'Deli Corner', tFor('en'))!;
    expect(text).not.toMatch(/Arizona|Pepsi/i);
  });

  it('is null when nothing is selected', () => {
    expect(buildItemListText(groupOf(arizonaOrder), 'Deli Corner', tFor('en'))).toBeNull();
  });

  it('section titles are translated in Spanish and Arabic', () => {
    const items: OrderItem[] = [
      { productId: 'bh_turkey', quantity: 1, unit: 'item' },
      { productId: 'bh_american', quantity: 1, unit: 'item' },
    ];
    expect(buildItemListText(groupOf(items), 'x', tFor('es'))).toMatch(/\nCARNES\n[\s\S]*\nQUESOS\n/);
    const ar = buildItemListText(groupOf(items), 'x', tFor('ar'))!;
    expect(ar).toContain(translations.ar.listMeats);
    expect(ar).toContain(translations.ar.listCheeses);
  });
});
