// components/counter/CounterHome.tsx
//
// The Counter tab: supplier capsules (with how many lines each supplier has in the order), then
// that supplier's products in compact groups. Search looks across every supplier.
//   Order mode: "+" adds one to the saved order; the tray at the bottom shows this supplier's part
//               of the order and opens it for review and sharing.
//   Count mode: each row opens the counting keypad; Save & Next follows the rows on screen.
//   Boar's Head is a tick list (MEATS, CHEESES) with Create List; it is never counted or priced.
// Everything reads and writes the one saved order and the verified counts through the existing
// functions; nothing is stored twice.
import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Product } from '../../types';
import { compareProducts, groupSupplierProducts, resolveGroupingMode, startsCollapsed, ProductGroup } from '../../utils/productGrouping';
import { countingOrder } from '../../utils/countKeypad';
import { draftLineCounts, lineQuantity, supplierDraftSummary } from '../../utils/supplierDraft';
import { lineUnit } from '../../utils/supplierWorkflow';
import Segmented from '../ui/Segmented';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { ChevronRightIcon, ListBulletIcon } from '../shared/icons';
import CounterGroup from './CounterGroup';
import CounterRow, { RowMode } from './CounterRow';
import CountSheet from './CountSheet';
import ProductSheet from './ProductSheet';
import ShareSheet from './ShareSheet';
import SupplierOrderPanel from './SupplierOrderPanel';
import { groupTotals, money } from './OrderLines';

export type CounterMode = 'order' | 'count';

interface CounterHomeProps {
  query: string;
  supplierId: string;
  onSelectSupplier: (id: string) => void;
  mode: CounterMode;
  onMode: (mode: CounterMode) => void;
}

const SECTION_KEYS = { meats: 'listMeats', cheeses: 'listCheeses', other: 'listOther' } as const;

const CounterHome: React.FC<CounterHomeProps> = ({ query, supplierId, onSelectSupplier, mode, onMode }) => {
  const { products, suppliers, currentOrder, getProductById, getSupplierById, addToOrder, updateOrderItemQuantity, removeFromOrder, getWorkflow } = useInventory();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Product | null>(null);
  const [countingId, setCountingId] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Groups the person opened or closed (by key); others follow startsCollapsed.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const sortedSuppliers = useMemo(() => [...suppliers].sort((a, b) => a.name.localeCompare(b.name)), [suppliers]);
  const activeId = suppliers.some(s => s.id === supplierId) ? supplierId : sortedSuppliers[0]?.id ?? '';
  const badges = useMemo(() => draftLineCounts(currentOrder.items, getProductById), [currentOrder.items, getProductById]);
  const activeWorkflow = getWorkflow(activeId);

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

  const groupKey = (group: ProductGroup) => (search ? group.key : `${activeId}:${group.key}`);
  const isOpen = (group: ProductGroup) => toggled[groupKey(group)] ?? (search ? true : !startsCollapsed(group, groups.length));
  const toggle = (group: ProductGroup) => setToggled(prev => ({ ...prev, [groupKey(group)]: !isOpen(group) }));

  const grouping = resolveGroupingMode(activeId);
  const groupedBy = search ? 'other' : grouping === 'size' ? 'size' : grouping === 'line' ? 'line' : 'other';

  const unitFor = (product: Product) => (getWorkflow(product.supplierId).orderStyle === 'items' ? 'item' : 'case');
  const quantityOf = (product: Product) => lineQuantity(currentOrder.items, product.id, unitFor(product));
  const olderCasesOf = (product: Product) => (unitFor(product) === 'item' ? lineQuantity(currentOrder.items, product.id, 'case') : 0);
  const rowMode = (product: Product): RowMode =>
    getWorkflow(product.supplierId).orderStyle === 'items' ? 'list' : mode === 'count' && getWorkflow(product.supplierId).countStock ? 'count' : 'order';

  const add = (product: Product) => {
    const quantity = quantityOf(product);
    if (quantity > 0) updateOrderItemQuantity(product.id, quantity + 1, unitFor(product));
    else addToOrder(product.id, 1);
  };
  const remove = (product: Product) => updateOrderItemQuantity(product.id, quantityOf(product) - 1, unitFor(product));
  const uncheck = (product: Product) => removeFromOrder(product.id, 'item');

  // Save & Next walks the counted products of the open groups, in screen order.
  const orderedIds = useMemo(
    () =>
      countingOrder(
        groups,
        new Set(groups.filter(g => !isOpen(g)).map(g => g.key)),
        p => getWorkflow(p.supplierId).countStock,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, toggled, getWorkflow],
  );

  const inOrderCount = (list: Product[]) =>
    list.filter(p => currentOrder.items.some(item => item.productId === p.id && lineUnit(item) === unitFor(p))).length;
  const resultCount = groups.reduce((total, g) => total + g.products.length, 0);

  // This supplier's part of the order, for the tray.
  const trayGroup = useMemo(
    () => supplierDraftSummary(currentOrder.items, activeId, getProductById, getSupplierById, getWorkflow).groups[0],
    [currentOrder.items, activeId, getProductById, getSupplierById, getWorkflow],
  );
  const showTray = !search && !!trayGroup && trayGroup.lines.length > 0;
  useEffect(() => {
    if (!showTray) setTrayOpen(false);
  }, [showTray]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const startCount = (product: Product) => {
    setSelected(null);
    setCountingId(product.id);
  };

  const isList = activeWorkflow.orderStyle === 'items';
  const trayTotals = trayGroup ? groupTotals(trayGroup) : null;

  return (
    <div className="space-y-3" data-testid="counter-home">
      {!search && (
        <nav aria-label={t('suppliersLabel')} className="sticky top-below-header z-30 -mx-3 bg-slate-100 px-3 pb-2 pt-2 dark:bg-[#0b1120]">
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
          {activeWorkflow.countStock ? (
            <Segmented
              className="mt-2"
              label={t('counterModeLabel')}
              value={mode}
              onChange={onMode}
              options={[
                { value: 'order', label: t('modeOrder'), testId: 'mode-order' },
                { value: 'count', label: t('modeCount'), testId: 'mode-count' },
              ]}
            />
          ) : (
            isList && <p className="mt-2 px-1 text-sm text-slate-600 dark:text-slate-300" data-testid="list-hint">{t('listHint')}</p>
          )}
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
            key={groupKey(group)}
            title={group.title ?? t(SECTION_KEYS[group.titleKey ?? 'other'])}
            count={group.products.length}
            inOrder={inOrderCount(group.products)}
            open={isOpen(group)}
            onToggle={() => toggle(group)}
            caps={group.title === null}
          >
            {group.products.map(product => (
              <CounterRow
                key={product.id}
                product={product}
                mode={rowMode(product)}
                quantity={quantityOf(product)}
                olderCaseQuantity={olderCasesOf(product)}
                onOpen={setSelected}
                onAdd={add}
                onRemove={remove}
                onCount={startCount}
                onUncheck={uncheck}
                groupedBy={groupedBy}
              />
            ))}
          </CounterGroup>
        ))
      )}

      {/* Room for the tray, so the last row is never hidden behind it. */}
      {showTray && <div className="h-16" aria-hidden="true" />}

      <AnimatePresence>
        {notice && (
          <motion.p
            key="notice"
            role="status"
            data-testid="counter-notice"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-x-3 z-40 mx-auto max-w-md rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl dark:bg-white dark:text-slate-900 ${
              showTray ? 'bottom-[calc(var(--nav-h)+var(--safe-bottom)+4.75rem)]' : 'bottom-[calc(var(--nav-h)+var(--safe-bottom)+0.75rem)]'
            }`}
          >
            {notice}
          </motion.p>
        )}
      </AnimatePresence>

      {showTray && trayGroup && trayTotals && (
        <div className="fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--safe-bottom))] z-30 px-safe">
          <div className="mx-auto max-w-3xl px-3 pb-2">
            <button
              type="button"
              onClick={() => (isList ? setSharing(activeId) : setTrayOpen(true))}
              data-testid="order-tray"
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-slate-900 px-4 py-2 text-start text-white shadow-xl shadow-slate-900/20 ring-1 ring-teal-400/50 dark:bg-slate-800"
            >
              <span className="flex h-9 min-w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-500 px-2 text-sm font-extrabold text-white dark:bg-teal-400 dark:text-slate-950">
                {trayTotals.lines}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{trayGroup.supplier.name}</span>
                <span className="block truncate text-xs text-slate-300">
                  {t('linesAndUnits', { lines: trayTotals.lines, units: trayTotals.units, unit: isList ? t('itemsUnit') : t('casesUnit') })}
                  {trayGroup.subtotal !== null && ` · ${money(trayGroup.subtotal)} ${t('estimateShort')}`}
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-1 text-sm font-bold text-teal-300">
                {isList ? <><ListBulletIcon className="h-5 w-5" />{t('createList')}</> : t('review')}
                <ChevronRightIcon className="h-4 w-4 rtl:-scale-x-100" />
              </span>
            </button>
          </div>
        </div>
      )}

      <ProductSheet product={selected} onClose={() => setSelected(null)} onCount={startCount} />
      <CountSheet
        productId={countingId}
        orderedIds={countingId && orderedIds.includes(countingId) ? orderedIds : countingId ? [countingId] : []}
        onClose={() => setCountingId(null)}
        onMove={setCountingId}
        onSaved={setNotice}
      />
      <Sheet
        open={trayOpen && !!trayGroup}
        onClose={() => setTrayOpen(false)}
        testId="tray-sheet"
        title={trayGroup?.supplier.name ?? ''}
        subtitle={isList ? t('listHint') : t('trayHelp')}
      >
        {trayGroup && (
          <SupplierOrderPanel
            group={trayGroup}
            showHeading={false}
            onShare={id => setSharing(id)}
          />
        )}
      </Sheet>
      <ShareSheet supplierId={sharing} onClose={() => setSharing(null)} />
    </div>
  );
};

export default CounterHome;
