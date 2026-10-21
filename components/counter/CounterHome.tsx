// components/counter/CounterHome.tsx
//
// The Counter tab: the supplier selector (current, pinned and recent suppliers, and All suppliers),
// then that supplier's products in compact sections. Search looks across every supplier. Which
// sections are open and where the list was scrolled are kept when leaving and coming back.
//   Order mode: "+" adds one to the saved order; the tray at the bottom shows this supplier's part
//               of the order and opens it for review and sharing.
//   Count mode: each row opens the counting keypad; Save & Next follows the rows on screen.
//   Boar's Head is a tick list (MEATS, CHEESES) with Create List; it is never counted or priced.
// Everything reads and writes the one saved order and the verified counts through the existing
// functions; nothing is stored twice.
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import { ArrowsPointingInIcon, ChevronRightIcon, ChevronUpDownIcon, ListBulletIcon } from '../shared/icons';
import { useToast } from '../ui/Toast';
import { useDevicePrefs } from '../../hooks/useDevicePrefs';
import { quickSuppliers, withFavoriteToggled, withSupplierChosen, WorkMode } from '../../utils/devicePrefs';
import SupplierSelector from './SupplierSelector';
import CounterGroup from './CounterGroup';
import CounterRow, { RowMode } from './CounterRow';
import CountSheet from './CountSheet';
import ProductSheet from './ProductSheet';
import ShareSheet from './ShareSheet';
import SupplierOrderPanel from './SupplierOrderPanel';
import { groupTotals, money } from './OrderLines';

export type CounterMode = WorkMode;

interface CounterHomeProps {
  query: string;
  supplierId: string;
  onSelectSupplier: (id: string) => void;
  mode: CounterMode;
  onMode: (mode: CounterMode) => void;
  /** Sections opened or closed by the person, kept by the shell while the app is open. */
  toggled: Record<string, boolean>;
  onToggled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  /** A product to open (from a shelf-tag link). */
  openProductId: string | null;
  onProductOpened: () => void;
}

/** Where each supplier's list was scrolled, while the app is open. */
const scrollBySupplier = new Map<string, number>();
/** Scroll margin for sections, so a section jumped to sits under the sticky bars. */
const SECTION_SCROLL = 'scroll-mt-[calc(var(--safe-top)+var(--header-h)+7.5rem)]';

const SECTION_KEYS = { meats: 'listMeats', cheeses: 'listCheeses', other: 'listOther' } as const;

const CounterHome: React.FC<CounterHomeProps> = ({ query, supplierId, onSelectSupplier, mode, onMode, toggled, onToggled, openProductId, onProductOpened }) => {
  const { products, suppliers, currentOrder, getProductById, getSupplierById, addToOrder, updateOrderItemQuantity, removeFromOrder, getWorkflow } = useInventory();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Product | null>(null);
  const [countingId, setCountingId] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const toast = useToast();
  const [prefs, setPrefs] = useDevicePrefs();

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
  const toggle = (group: ProductGroup) => onToggled(prev => ({ ...prev, [groupKey(group)]: !isOpen(group) }));
  const collapseAll = () => onToggled(prev => ({ ...prev, ...Object.fromEntries(groups.map(g => [groupKey(g), false])) }));
  const jumpTo = (group: ProductGroup) => {
    onToggled(prev => ({ ...prev, [groupKey(group)]: true }));
    setJumpOpen(false);
    setTimeout(() => document.getElementById(`section-${group.key}`)?.scrollIntoView({ block: 'start' }), 60);
  };

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

  // Keep each supplier's scroll position: saved when leaving it (another supplier, another tab),
  // put back when it is shown again. Search results always start at the top.
  useLayoutEffect(() => {
    if (search) return;
    const saved = scrollBySupplier.get(activeId) ?? 0;
    const frame = requestAnimationFrame(() => window.scrollTo(0, saved));
    return () => {
      cancelAnimationFrame(frame);
      scrollBySupplier.set(activeId, window.scrollY);
    };
  }, [activeId, search]);

  // A product from a shelf-tag link opens once its supplier is showing.
  useEffect(() => {
    if (!openProductId) return;
    const product = getProductById(openProductId);
    if (product && product.supplierId === activeId) {
      setSelected(product);
      onProductOpened();
    }
  }, [openProductId, activeId, getProductById, onProductOpened]);

  // The supplier shown before the first choice (the first one) counts as recent too, so going
  // back to it is one tap.
  const choose = (id: string) => {
    if (id === activeId) return;
    if (!prefs.recent.includes(activeId)) setPrefs(p => withSupplierChosen(p, activeId));
    onSelectSupplier(id);
  };

  const existingIds = useMemo(() => new Set(suppliers.map(s => s.id)), [suppliers]);
  const quickIds = quickSuppliers(prefs, activeId, existingIds);

  const startCount = (product: Product) => {
    setSelected(null);
    setCountingId(product.id);
  };

  const isList = activeWorkflow.orderStyle === 'items';
  const trayTotals = trayGroup ? groupTotals(trayGroup) : null;

  return (
    <div className="space-y-3" data-testid="counter-home">
      {!search && (
        <nav aria-label={t('suppliersLabel')} className="sticky top-below-header z-30 -mx-3 space-y-2 bg-slate-100 px-3 pb-2 pt-2 dark:bg-[#0b1120]">
          <SupplierSelector
            suppliers={suppliers}
            activeId={activeId}
            quickIds={quickIds}
            favorites={prefs.favorites}
            badges={badges}
            onSelect={choose}
            onToggleFavorite={id => setPrefs(p => withFavoriteToggled(p, id))}
          />
          <div className="flex flex-wrap items-center gap-2">
            {activeWorkflow.countStock ? (
              <Segmented
                className="min-w-0 flex-1 basis-[13rem]"
                label={t('counterModeLabel')}
                value={mode}
                onChange={onMode}
                options={[
                  { value: 'order', label: t('modeOrder'), testId: 'mode-order' },
                  { value: 'count', label: t('modeCount'), testId: 'mode-count' },
                ]}
              />
            ) : (
              <p className="min-w-0 flex-1 basis-[13rem] px-1 text-sm text-slate-600 dark:text-slate-300" data-testid="list-hint">{isList ? t('listHint') : ''}</p>
            )}
            {groups.length > 2 && (
              <button
                type="button"
                onClick={() => setJumpOpen(true)}
                aria-label={t('jumpToSection')}
                data-testid="jump-button"
                className="ms-auto inline-flex h-11 flex-shrink-0 items-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-white/10"
              >
                <ChevronUpDownIcon className="h-5 w-5" />
                <span className="max-[379px]:sr-only">{t('sectionsShort')}</span>
              </button>
            )}
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
            key={groupKey(group)}
            id={search ? undefined : `section-${group.key}`}
            className={SECTION_SCROLL}
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

      <Sheet open={jumpOpen} onClose={() => setJumpOpen(false)} title={t('jumpToSection')} testId="jump-sheet">
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {groups.map(group => (
            <li key={group.key}>
              <button type="button" onClick={() => jumpTo(group)} className="flex min-h-12 w-full items-center gap-2 py-2 text-start">
                <span dir="auto" className="min-w-0 flex-1 break-words font-semibold">{group.title ?? t(SECTION_KEYS[group.titleKey ?? 'other'])}</span>
                {inOrderCount(group.products) > 0 && (
                  <span className="rounded-full bg-teal-500/15 px-2 text-xs font-bold text-teal-700 dark:text-teal-300">{t('inOrderShort', { count: inOrderCount(group.products) })}</span>
                )}
                <span className="rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">{group.products.length}</span>
                <span className={`text-xs ${isOpen(group) ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-400'}`}>{isOpen(group) ? t('sectionOpen') : t('sectionClosed')}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`${ui.secondary} mt-3 w-full`}
          onClick={() => {
            collapseAll();
            setJumpOpen(false);
          }}
          data-testid="collapse-all"
        >
          <ArrowsPointingInIcon className="h-5 w-5" /> {t('collapseAll')}
        </button>
      </Sheet>
      <ProductSheet product={selected} onClose={() => setSelected(null)} onCount={startCount} />
      <CountSheet
        productId={countingId}
        orderedIds={countingId && orderedIds.includes(countingId) ? orderedIds : countingId ? [countingId] : []}
        onClose={() => setCountingId(null)}
        onMove={setCountingId}
        onSaved={message => toast(message)}
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
