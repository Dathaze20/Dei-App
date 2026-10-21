// components/counter/CounterCatalog.tsx
//
// The Catalog tab: every product, organised by supplier in compact sections, with search across
// all of them. Tapping a product (or its Edit button) opens the editor, which also has the shelf
// tag and Delete. Suppliers are listed at the end with Add supplier. Every action has a word on
// it, not just an icon.
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Product, Supplier } from '../../types';
import ProductThumb from '../ProductThumb';
import SupplierForm from '../SupplierForm';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { ArrowUturnLeftIcon, MagnifyingGlassIcon, PlusIcon, XIcon } from '../shared/icons';
import CounterGroup from './CounterGroup';
import ProductEditorSheet from './ProductEditorSheet';
import ImportSheet from './ImportSheet';

const NO_SUPPLIER = '__none__';

const CounterCatalog: React.FC = () => {
  const { products, suppliers, addSupplier, getWorkflow } = useInventory();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // "Edit in Catalog" from a product sheet opens that product here.
  useEffect(() => {
    const id = (location.state as { edit?: string } | null)?.edit;
    if (!id) return;
    const product = products.find(p => p.id === id);
    if (product) setEditing(product);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const search = query.trim().toLowerCase();
  const sections = useMemo(() => {
    const matches = (p: Product) =>
      !search || [p.name, p.flavor, p.category, p.size, p.upc ?? ''].some(field => (field ?? '').toLowerCase().includes(search));
    const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name) || a.flavor.localeCompare(b.flavor));
    const list: { id: string; name: string; supplier?: Supplier; items: Product[] }[] = [...suppliers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(supplier => ({ id: supplier.id, name: supplier.name, supplier, items: sorted.filter(p => p.supplierId === supplier.id && matches(p)) }));
    // Products whose supplier no longer exists are still listed, never hidden.
    const orphans = sorted.filter(p => !suppliers.some(s => s.id === p.supplierId) && matches(p));
    if (orphans.length) list.push({ id: NO_SUPPLIER, name: t('otherProducts'), items: orphans });
    return list;
  }, [products, suppliers, search, t]);

  const shown = sections.filter(section => section.items.length > 0);
  const resultCount = shown.reduce((total, s) => total + s.items.length, 0);

  const saveSupplier = (data: Omit<Supplier, 'id'>) => {
    addSupplier(data);
    setAddingSupplier(false);
    setNotice(t('supplierAdded', { name: data.name }));
  };

  return (
    <div className="space-y-3" data-testid="counter-catalog">
      <section className={`${ui.card} p-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold leading-tight">{t('navCatalog')}</h1>
            <p className={ui.muted}>{t('catalogSummary', { products: products.length, suppliers: suppliers.length })}</p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className={ui.primary} onClick={() => setEditing({ supplierId: '' })}>
            <PlusIcon className="h-5 w-5" /> {t('addProduct')}
          </button>
          <button type="button" className={ui.secondary} onClick={() => setAddingSupplier(true)}>
            <PlusIcon className="h-5 w-5" /> {t('addSupplier')}
          </button>
          <button type="button" className={`${ui.secondary} col-span-2`} onClick={() => setImporting(true)} data-testid="open-import">
            <ArrowUturnLeftIcon className="h-5 w-5 rotate-90" /> {t('importProducts')}
          </button>
        </div>
        <div className="relative mt-2">
          <MagnifyingGlassIcon className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('searchCatalog')}
            aria-label={t('searchCatalog')}
            className={`${ui.input} ps-10 pe-12 [&::-webkit-search-cancel-button]:appearance-none`}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={t('clearSearch')} className={`${ui.iconButton} absolute end-0 top-0`}>
              <XIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        {search && <p className={`mt-2 ${ui.muted}`} role="status">{t('searchResultsCount', { count: resultCount })}</p>}
      </section>

      {notice && <p role="status" className={ui.ok} data-testid="catalog-notice">{notice}</p>}

      {shown.length === 0 && <p className="py-10 text-center text-slate-500 dark:text-slate-400">{t('noProductsMatch', { query: `"${query.trim()}"` })}</p>}

      {shown.map(section => (
        <CounterGroup
          key={section.id}
          title={section.name}
          count={section.items.length}
          inOrder={0}
          open={open[section.id] ?? !!search}
          onToggle={() => setOpen(prev => ({ ...prev, [section.id]: !(prev[section.id] ?? !!search) }))}
        >
          {section.items.map(product => (
            <div key={product.id} className="flex items-center gap-3 py-2 ps-3 pe-1.5" data-testid="catalog-product">
              <ProductThumb product={product} alt="" className="h-14 w-14 rounded-xl" onClick={() => setEditing(product)} />
              <button type="button" onClick={() => setEditing(product)} className="min-w-0 flex-1 text-start" aria-label={t('editNamed', { name: [product.name, product.flavor].filter(Boolean).join(' ') })}>
                {/* The flavor first (the section already names the supplier, often the brand). */}
                <span dir="auto" className="block truncate font-semibold leading-snug rtl:text-right">{product.flavor || product.name}</span>
                <span dir="auto" className="block truncate text-xs text-slate-500 rtl:text-right dark:text-slate-400">
                  {[product.flavor ? product.name : '', product.size].filter(Boolean).join(' · ')}
                </span>
                <span className="block truncate font-mono text-[11px] text-slate-400">{product.upc ? `UPC ${product.upc}` : t('noUpc')}</span>
              </button>
              <button type="button" onClick={() => setEditing(product)} className={`${ui.secondary} !px-3 text-sm`} tabIndex={-1} aria-hidden="true">
                {t('edit')}
              </button>
            </div>
          ))}
        </CounterGroup>
      ))}

      <section className={`${ui.card} p-4`} data-testid="catalog-suppliers">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={`${ui.heading} min-w-0 flex-1`}>{t('manageSuppliers')}</h2>
          <button type="button" className={ui.secondary} onClick={() => setAddingSupplier(true)}>
            <PlusIcon className="h-5 w-5" /> {t('addSupplier')}
          </button>
        </div>
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
          {[...suppliers].sort((a, b) => a.name.localeCompare(b.name)).map(supplier => {
            const workflow = getWorkflow(supplier.id);
            return (
              <li key={supplier.id} className="flex items-center gap-3 py-2">
                <span className={`h-3 w-3 flex-shrink-0 rounded-full ${supplier.color}`} aria-hidden="true" />
                <span dir="auto" className="min-w-0 flex-1 truncate font-semibold">{supplier.name}</span>
                <span className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {workflow.orderStyle === 'items' ? t('supplierItemList') : t('supplierCases')} · {products.filter(p => p.supplierId === supplier.id).length}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <ProductEditorSheet
        product={editing}
        onClose={() => setEditing(null)}
        onDone={message => {
          setEditing(null);
          setNotice(message);
        }}
      />
      <ImportSheet
        open={importing}
        onClose={() => setImporting(false)}
        onDone={message => {
          setImporting(false);
          setNotice(message);
        }}
      />
      <Sheet open={addingSupplier} onClose={() => setAddingSupplier(false)} title={t('newSupplier')} testId="supplier-editor">
        <SupplierForm onSave={saveSupplier} onCancel={() => setAddingSupplier(false)} />
      </Sheet>
    </div>
  );
};

export default CounterCatalog;
