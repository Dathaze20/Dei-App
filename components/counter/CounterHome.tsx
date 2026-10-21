// components/counter/CounterHome.tsx
//
// The Counter tab (v0.1.6): one compact bar (the supplier button and Order | Count, then one row of
// filter pills) that slides away while scrolling down and comes back on any scroll up, then the
// supplier's products as rows (CounterRow; "Large pictures" in Settings keeps the cards). Search
// looks across every supplier. The chosen pill and the scroll position are kept on the phone.
//   Order mode: "+" adds one case (or item) to the saved order, with Undo; the ✓ quantity opens the
//               adjuster. The tray at the bottom shows this supplier's part of the order.
//   Count mode: "Count with photos" first (shelf photos), and each row's Count opens the keypad;
//               Save & Next follows the rows on screen.
//   Boar's Head is a tick list (MEATS, CHEESES) with Create List; it is never counted or priced.
// Everything reads and writes the one saved order and the verified counts through the existing
// functions; nothing is stored twice.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Product } from '../../types';
import { compareProducts, groupSupplierProducts, resolveGroupingMode, ProductGroup } from '../../utils/productGrouping';
import { countingOrder } from '../../utils/countKeypad';
import { draftLineCounts, lineQuantity, supplierDraftSummary } from '../../utils/supplierDraft';
import { lineUnit } from '../../utils/supplierWorkflow';
import Segmented from '../ui/Segmented';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { CameraIcon, ChevronRightIcon, ListBulletIcon, Squares2X2Icon } from '../shared/icons';
import EmptyState from '../ui/EmptyState';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../ui/Toast';
import { useDevicePrefs } from '../../hooks/useDevicePrefs';
import { quickSuppliers, withSupplierChosen, WorkMode } from '../../utils/devicePrefs';
import { attentionList } from '../../utils/attention';
import { normalizeCode } from '../../utils/shelfCheck';
import { readWorkPlace, saveWorkPlace } from '../../utils/workPlace';
import SupplierSelector from './SupplierSelector';
import AttentionCard from './AttentionCard';
import BackupReminder from './BackupReminder';
import ProductCard from './ProductCard';
import FilterPills, { PillOption } from './FilterPills';
import CounterRow, { RowMode } from './CounterRow';
import QuantitySheet from './QuantitySheet';
import { useHideOnScroll } from '../../hooks/useHideOnScroll';
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
  /** A product to open (from a shelf-tag link). */
  openProductId: string | null;
  onProductOpened: () => void;
}

/** Where each supplier's list was scrolled, while the app is open. */
const scrollBySupplier = new Map<string, number>(Object.entries(readWorkPlace().scroll));
const SECTION_KEYS = { meats: 'listMeats', cheeses: 'listCheeses', other: 'listOther' } as const;

const CounterHome: React.FC<CounterHomeProps> = ({ query, supplierId, onSelectSupplier, mode, onMode, openProductId, onProductOpened }) => {
  const { products, suppliers, currentOrder, getProductById, getSupplierById, addToOrder, updateOrderItemQuantity, removeFromOrder, getWorkflow, getStock } = useInventory();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Product | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [countingId, setCountingId] = useState<string | null>(null);
  // Counting from "Needs attention" follows that list instead of the screen.
  const [countOrder, setCountOrder] = useState<string[] | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  // The chosen filter pill of each supplier, kept on the phone with the rest of the working place.
  const [filters, setFilters] = useState<Record<string, string>>(() => readWorkPlace().filters);
  // The bar is pinned (and slides away while scrolling down) only while it is small; at the
  // largest text sizes on small phones it would cover the products, so it simply scrolls away.
  const barRef = useRef<HTMLElement>(null);
  const [barPinned, setBarPinned] = useState(true);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const check = () => setBarPinned(bar.offsetHeight < window.innerHeight * 0.3);
    const observer = new ResizeObserver(check);
    observer.observe(bar);
    window.addEventListener('resize', check);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  });
  const barHidden = useHideOnScroll(!query.trim() && barPinned);
  const trayRef = useRef<HTMLDivElement>(null);
  const [trayHeight, setTrayHeight] = useState(64);
  useEffect(() => {
    const tray = trayRef.current;
    if (!tray || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setTrayHeight(tray.offsetHeight));
    observer.observe(tray);
    return () => observer.disconnect();
  });
  const toast = useToast();
  const navigate = useNavigate();
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
      (p.upc ?? '').includes(query.trim()) ||
      // A scanned barcode may carry extra leading zeros (EAN-13 form of a UPC-A).
      (/^\d{6,}$/.test(query.trim()) && !!p.upc && normalizeCode(p.upc) === normalizeCode(query)),
    );
    return sortedSuppliers
      .map(s => ({ key: `search:${s.id}`, title: s.name, titleKey: null, products: matches.filter(p => p.supplierId === s.id).sort(compareProducts) }))
      .filter(g => g.products.length > 0);
  }, [search, query, activeId, products, sortedSuppliers, getSupplierById]);

  const groupLabel = (group: ProductGroup) => group.title ?? t(SECTION_KEYS[group.titleKey ?? 'other']);
  const activeFilter = !search && groups.some(g => g.key === filters[activeId]) ? filters[activeId] : 'all';
  const shownGroups = search || activeFilter === 'all' ? groups : groups.filter(g => g.key === activeFilter);
  const chooseFilter = (key: string) => {
    setFilters(prev => ({ ...prev, [activeId]: key }));
    saveWorkPlace(place => ({ ...place, filters: { ...place.filters, [activeId]: key } }));
    // Show the chosen products from their start. When the bar is not pinned (largest text), go
    // straight to the products so they get the whole screen; the bar is one scroll up.
    requestAnimationFrame(() => {
      const list = document.getElementById('counter-products');
      if (!barPinned && list) list.scrollIntoView({ block: 'start' });
      else window.scrollTo(0, 0);
    });
  };

  const grouping = resolveGroupingMode(activeId);
  const groupedBy = search ? 'other' : grouping === 'size' ? 'size' : grouping === 'line' ? 'line' : 'other';

  const unitFor = (product: Product) => (getWorkflow(product.supplierId).orderStyle === 'items' ? 'item' : 'case');
  const quantityOf = (product: Product) => lineQuantity(currentOrder.items, product.id, unitFor(product));
  const olderCasesOf = (product: Product) => (unitFor(product) === 'item' ? lineQuantity(currentOrder.items, product.id, 'case') : 0);
  const rowMode = (product: Product): RowMode =>
    getWorkflow(product.supplierId).orderStyle === 'items' ? 'list' : mode === 'count' && getWorkflow(product.supplierId).countStock ? 'count' : 'order';

  const unitLabel = (product: Product) => (unitFor(product) === 'item' ? t('itemsUnit') : t('casesUnit'));
  const shortName = (product: Product) => product.flavor || product.name;
  // One tap adds one case (one item for item suppliers), with Undo right away.
  const add = (product: Product) => {
    const unit = unitFor(product);
    addToOrder(product.id, 1);
    toast(t('addedQuantity', { name: shortName(product), quantity: 1, unit: unitLabel(product) }), {
      label: t('undo'),
      run: () => {
        const now = lineQuantity(currentOrderRef.current.items, product.id, unit);
        updateOrderItemQuantity(product.id, now - 1, unit);
      },
    });
  };
  const changeQuantity = (product: Product, quantity: number) => updateOrderItemQuantity(product.id, quantity, unitFor(product));
  const removeLine = (product: Product) => {
    const unit = unitFor(product);
    const before = quantityOf(product);
    removeFromOrder(product.id, unit);
    setAdjustingId(null);
    toast(t('removedFromOrder', { name: shortName(product) }), {
      label: t('undo'),
      run: () => {
        if (lineQuantity(currentOrderRef.current.items, product.id, unit) === 0) addToOrder(product.id, before);
      },
    });
  };
  // The newest order for Undo, which runs after later renders.
  const currentOrderRef = useRef(currentOrder);
  currentOrderRef.current = currentOrder;
  const adjusting = adjustingId ? getProductById(adjustingId) ?? null : null;

  // Save & Next walks the counted products shown on screen (the chosen pill), in screen order.
  const orderedIds = useMemo(
    () => countingOrder(shownGroups, new Set<string>(), p => getWorkflow(p.supplierId).countStock),
    [shownGroups, getWorkflow],
  );

  const inOrderCount = (list: Product[]) =>
    list.filter(p => currentOrder.items.some(item => item.productId === p.id && lineUnit(item) === unitFor(p))).length;
  const resultCount = groups.reduce((total, g) => total + g.products.length, 0);
  const pills: PillOption[] = [
    { key: 'all', label: t('allShort'), count: resultCount, inOrder: inOrderCount(groups.flatMap(g => g.products)) },
    ...groups.map(g => ({ key: g.key, label: groupLabel(g), count: g.products.length, inOrder: inOrderCount(g.products) })),
  ];

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
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    // Put the list back where it was. Right after a start the list may not be tall enough yet
    // (slower phones), so keep trying for about a second; stop as soon as the person scrolls.
    let ready = false;
    let tries = 0;
    let frame = 0;
    const restore = () => {
      window.scrollTo(0, saved);
      if (Math.abs(window.scrollY - saved) > 2 && tries++ < 60) frame = requestAnimationFrame(restore);
      else ready = true;
    };
    frame = requestAnimationFrame(restore);
    const stop = () => {
      cancelAnimationFrame(frame);
      ready = true;
    };
    const interactions = ['touchstart', 'wheel', 'keydown', 'mousedown'] as const;
    interactions.forEach(type => window.addEventListener(type, stop, { passive: true, once: true }));
    // Also kept on the phone, so the place survives Android closing the app in the background.
    const onScroll = () => {
      if (!ready) return;
      const y = Math.round(window.scrollY);
      scrollBySupplier.set(activeId, y);
      saveWorkPlace(place => ({ ...place, scroll: { ...place.scroll, [activeId]: y } }));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      interactions.forEach(type => window.removeEventListener(type, stop));
      window.removeEventListener('scroll', onScroll);
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
    setCountOrder(null);
    setCountingId(product.id);
  };

  const attention = useMemo(
    () => (search || !activeWorkflow.countStock ? [] : attentionList(products.filter(p => p.supplierId === activeId), getStock)),
    [search, activeWorkflow.countStock, products, activeId, getStock],
  );

  const isList = activeWorkflow.orderStyle === 'items';
  // The stock line shows what AttentionCard would show (in Order mode only verified low or out).
  const showStockLine = attention.length > 0 && (mode === 'count' || attention.some(i => i.reason.kind === 'out' || i.reason.kind === 'low'));
  const trayTotals = trayGroup ? groupTotals(trayGroup) : null;

  return (
    <div className="space-y-3" data-testid="counter-home">
      {!search && (
        <nav
          aria-label={t('suppliersLabel')}
          ref={barRef}
          data-testid="counter-bar"
          data-pinned={barPinned || undefined}
          className={`${barPinned ? 'sticky top-below-header z-30' : 'relative'} -mx-3 space-y-2 bg-slate-100 px-3 pb-2 pt-2 transition-transform duration-200 dark:bg-[#0b1120] ${barHidden ? '-translate-y-[calc(100%+var(--header-h)+var(--safe-top))]' : ''}`}
        >
          {/* The supplier and Order | Count share one row; at very large text Order | Count moves
              below, whole (its words never break). */}
          <div className="flex flex-wrap items-center gap-2">
            <SupplierSelector
              className="flex-1 basis-[8rem]"
              suppliers={suppliers}
              activeId={activeId}
              quickIds={quickIds}
              badges={badges}
              onSelect={choose}
            />
            {activeWorkflow.countStock && (
              <Segmented
                className="ms-auto flex-shrink-0"
                label={t('counterModeLabel')}
                value={mode}
                onChange={onMode}
                options={[
                  { value: 'order', label: t('modeOrder'), testId: 'mode-order' },
                  { value: 'count', label: t('modeCount'), testId: 'mode-count' },
                ]}
              />
            )}
          </div>
          {isList && <p className="px-1 text-sm leading-snug text-slate-600 dark:text-slate-300" data-testid="list-hint">{t('listHint')}</p>}
          {groups.length > 1 && <FilterPills options={pills} value={activeFilter} onChange={chooseFilter} />}
        </nav>
      )}

      {search && <p className="px-1 text-sm text-slate-500 dark:text-slate-400" role="status">{t('searchResultsCount', { count: resultCount })}</p>}

      {!search && <BackupReminder />}

      {!search && (showStockLine || mode === 'count' && activeWorkflow.countStock) && (
        <div className="flex flex-wrap items-center gap-x-1">
          <div className="min-w-0 flex-1 basis-[16rem]">
            <AttentionCard
              items={attention}
              mode={mode}
              onCount={(product, ids) => {
                setSelected(null);
                setCountOrder(ids);
                setCountingId(product.id);
              }}
            />
          </div>
          {mode === 'count' && activeWorkflow.countStock && (
            <button
              type="button"
              className="ms-auto inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-cyan-600 px-4 py-1 text-start text-sm font-bold leading-tight text-white shadow-sm dark:bg-cyan-400 dark:text-slate-950"
              onClick={() => navigate('/counter/shelf', { state: { start: true } })}
              data-testid="open-shelf-check"
            >
              <CameraIcon className="h-5 w-5 flex-shrink-0" /> <span className="min-w-0">{t('countWithPhotos')}</span>
            </button>
          )}
        </div>
      )}

      <div id="counter-products" className="scroll-mt-[calc(var(--safe-top)+var(--header-h)+0.5rem)] space-y-3">
      {groups.length === 0 ? (
        search ? (
          <p className="py-12 text-center text-slate-500 dark:text-slate-400">{t('noProductsMatch', { query: `"${query.trim()}"` })}</p>
        ) : (
          <EmptyState
            testId="supplier-empty"
            icon={<Squares2X2Icon className="h-7 w-7" />}
            title={t('noProductsYetFor', { supplier: getSupplierById(activeId)?.name ?? '' })}
            message={t('noProductsYetHelp')}
            action={
              <button type="button" className={ui.primary} onClick={() => navigate('/counter/catalog')}>
                <Squares2X2Icon className="h-5 w-5" /> {t('openCatalog')}
              </button>
            }
          />
        )
      ) : (
        shownGroups.map(group => {
          // Rows by default; the cards only for "Large pictures" (never for item lists).
          const asList = getWorkflow(group.products[0]?.supplierId ?? activeId).orderStyle === 'items' || prefs.density !== 'pictures';
          const heading = search || (activeFilter === 'all' && groups.length > 1);
          return (
            <section key={group.key} data-testid="product-section" aria-label={groupLabel(group)}>
              {heading && (
                <h2 dir="auto" className={`mb-1.5 mt-1 px-1 text-sm font-bold text-slate-600 dark:text-slate-300 ${group.title === null ? 'uppercase tracking-wider' : ''}`}>
                  {groupLabel(group)} <span className="font-normal text-slate-400">· {group.products.length}</span>
                </h2>
              )}
              {asList ? (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-white/5 dark:bg-slate-900/80 dark:ring-white/10">
                  {group.products.map(product => (
                    <CounterRow
                      key={product.id}
                      product={product}
                      mode={rowMode(product)}
                      quantity={quantityOf(product)}
                      unitLabel={unitLabel(product)}
                      olderCaseQuantity={olderCasesOf(product)}
                      supplierName={getSupplierById(product.supplierId)?.name}
                      onOpen={setSelected}
                      onAdd={add}
                      onAdjust={p => setAdjustingId(p.id)}
                      onCount={startCount}
                      groupedBy={groupedBy}
                    />
                  ))}
                </div>
              ) : (
                <div className="product-grid" data-testid="product-grid">
                  {group.products.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      mode={rowMode(product) === 'count' ? 'count' : 'order'}
                      quantity={quantityOf(product)}
                      onOpen={setSelected}
                      onAdd={add}
                      onRemove={p => changeQuantity(p, quantityOf(p) - 1)}
                      onCount={startCount}
                      groupedBy={groupedBy}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}

      </div>

      {/* Room for the tray (its real height: it grows with the text), so the last row is never
          hidden behind it. */}
      {showTray && <div style={{ height: trayHeight + 8 }} aria-hidden="true" />}

      {showTray && trayGroup && trayTotals && (
        <div ref={trayRef} className="fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--safe-bottom))] z-30 px-safe">
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

      <QuantitySheet
        product={adjusting}
        quantity={adjusting ? quantityOf(adjusting) : 0}
        unitLabel={adjusting ? unitLabel(adjusting) : ''}
        onChange={changeQuantity}
        onRemove={removeLine}
        onClose={() => setAdjustingId(null)}
      />
      <ProductSheet product={selected} onClose={() => setSelected(null)} onCount={startCount} />
      <CountSheet
        productId={countingId}
        orderedIds={countOrder ?? (countingId && orderedIds.includes(countingId) ? orderedIds : countingId ? [countingId] : [])}
        onClose={() => {
          setCountingId(null);
          setCountOrder(null);
        }}
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
