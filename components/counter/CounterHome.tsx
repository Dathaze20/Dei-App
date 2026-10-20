// components/counter/CounterHome.tsx
//
// The Counter tab: supplier capsules (with how many lines each supplier has in the order), then
// that supplier's products in compact groups. Search looks across every supplier.
// Everything reads and writes the one saved order through the existing order functions.
import React, { useMemo, useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Product } from '../../types';
import { compareProducts, groupSupplierProducts, resolveGroupingMode, startsCollapsed, ProductGroup } from '../../utils/productGrouping';
import { draftLineCounts, lineQuantity } from '../../utils/supplierDraft';
import { lineUnit } from '../../utils/supplierWorkflow';
import ProductDetailModal from '../ProductDetailModal';
import CounterGroup from './CounterGroup';
import CounterRow from './CounterRow';

interface CounterHomeProps {
  query: string;
  supplierId: string;
  onSelectSupplier: (id: string) => void;
}

const SECTION_KEYS = { meats: 'listMeats', cheeses: 'listCheeses', other: 'listOther' } as const;

const CounterHome: React.FC<CounterHomeProps> = ({ query, supplierId, onSelectSupplier }) => {
  const { products, suppliers, currentOrder, getProductById, getSupplierById, addToOrder, updateOrderItemQuantity, getWorkflow } = useInventory();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Product | null>(null);

  const sortedSuppliers = useMemo(() => [...suppliers].sort((a, b) => a.name.localeCompare(b.name)), [suppliers]);
  const activeId = suppliers.some(s => s.id === supplierId) ? supplierId : sortedSuppliers[0]?.id ?? '';
  const badges = useMemo(() => draftLineCounts(currentOrder.items, getProductById), [currentOrder.items, getProductById]);

  const search = query.trim().toLowerCase();
  const groups: ProductGroup[] = useMemo(() => {
    if (!search) return groupSupplierProducts(activeId, products);
    const matches = products.filter(p =>
      [p.name, p.flavor, p.category, p.size, getSupplierById(p.supplierId)?.name ?? ''].some(f => (f ?? '').toLowerCase().includes(search)) ||
      (p.upc ?? '').includes(query.trim()),
    );
    return sortedSuppliers
      .map(s => ({ key: `search:${s.id}`, title: s.name, titleKey: null, products: matches.filter(p => p.supplierId === s.id).sort(compareProducts) }))
      .filter(g => g.products.length > 0);
  }, [search, query, activeId, products, sortedSuppliers, getSupplierById]);

  const mode = resolveGroupingMode(activeId);
  const groupedBy = search ? 'other' : mode === 'size' ? 'size' : mode === 'line' ? 'line' : 'other';

  const unitFor = (product: Product) => (getWorkflow(product.supplierId).orderStyle === 'items' ? 'item' : 'case');
  const quantityOf = (product: Product) => lineQuantity(currentOrder.items, product.id, unitFor(product));
  const olderCasesOf = (product: Product) =>
    getWorkflow(product.supplierId).orderStyle === 'items' ? lineQuantity(currentOrder.items, product.id, 'case') : 0;

  const add = (product: Product) => {
    const quantity = quantityOf(product);
    if (quantity > 0) updateOrderItemQuantity(product.id, quantity + 1, unitFor(product));
    else addToOrder(product.id, 1);
  };
  const remove = (product: Product) => updateOrderItemQuantity(product.id, quantityOf(product) - 1, unitFor(product));

  const inOrderCount = (list: Product[]) =>
    list.filter(p => currentOrder.items.some(item => item.productId === p.id && lineUnit(item) === unitFor(p))).length;
  const resultCount = groups.reduce((total, g) => total + g.products.length, 0);

  return (
    <div className="space-y-3" data-testid="counter-home">
      {!search && (
        <nav aria-label={t('suppliersLabel')} className="sticky top-below-header z-30 -mx-3 bg-slate-100 px-3 py-2 dark:bg-[#0b1120]">
          <div className="flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none]" data-testid="counter-capsules">
            {sortedSuppliers.map(supplier => {
              const active = supplier.id === activeId;
              const count = badges[supplier.id] ?? 0;
              return (
                <button
                  key={supplier.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectSupplier(supplier.id)}
                  className={`relative flex min-h-11 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/30'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-white/10'
                  }`}
                >
                  {supplier.name}
                  {count > 0 && (
                    <span className={`min-w-5 rounded-full px-1.5 text-xs font-bold ${active ? 'bg-white/25 text-white' : 'bg-teal-500 text-white'}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {search && <p className="px-1 text-sm text-slate-500 dark:text-slate-400" role="status">{t('searchResultsCount', { count: resultCount })}</p>}

      {groups.length === 0 ? (
        <p className="py-12 text-center text-slate-500 dark:text-slate-400">
          {search ? t('noProductsMatch', { query: `"${query.trim()}"` }) : t('noProductsForSupplier')}
        </p>
      ) : (
        groups.map(group => (
          <CounterGroup
            key={`${search ? 'search' : activeId}:${group.key}`}
            title={group.title ?? t(SECTION_KEYS[group.titleKey ?? 'other'])}
            count={group.products.length}
            inOrder={inOrderCount(group.products)}
            defaultOpen={search ? true : !startsCollapsed(group, groups.length)}
            caps={group.title === null}
          >
            {group.products.map(product => (
              <CounterRow
                key={product.id}
                product={product}
                quantity={quantityOf(product)}
                olderCaseQuantity={olderCasesOf(product)}
                onOpen={setSelected}
                onAdd={add}
                onRemove={remove}
                groupedBy={groupedBy}
              />
            ))}
          </CounterGroup>
        ))
      )}

      {selected && (
        <ProductDetailModal
          product={selected}
          supplier={getSupplierById(selected.supplierId)}
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          onAddToOrder={addToOrder}
        />
      )}
    </div>
  );
};

export default CounterHome;
