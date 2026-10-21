// components/counter/SupplierSelector.tsx
//
// Choosing a supplier: one compact button with the current supplier (v0.1.6; the row of recent
// chips is gone to give the products the screen). Tapping it opens a grid that fits the screen and
// the text size, with the recently used suppliers first, then all of them, and search. Order-line
// counts show on both.
import React, { useMemo, useState } from 'react';
import { Supplier } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { ChevronDownIcon, MagnifyingGlassIcon, Squares2X2Icon, XIcon } from '../shared/icons';

interface SupplierSelectorProps {
  suppliers: Supplier[];
  activeId: string;
  quickIds: string[];
  badges: Record<string, number>;
  onSelect: (id: string) => void;
  className?: string;
}

const Badge: React.FC<{ count: number; tone: 'light' | 'teal' }> = ({ count, tone }) =>
  count > 0 ? (
    <span className={`min-w-5 flex-shrink-0 rounded-full px-1.5 text-center text-xs font-bold ${tone === 'light' ? 'bg-white/25 text-white' : 'bg-teal-500 text-white'}`}>
      {count}
    </span>
  ) : null;

const SupplierSelector: React.FC<SupplierSelectorProps> = ({ suppliers, activeId, quickIds, badges, onSelect, className = '' }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers]);
  const active = byId.get(activeId);
  const sorted = useMemo(() => [...suppliers].sort((a, b) => a.name.localeCompare(b.name)), [suppliers]);
  const search = query.trim().toLowerCase();
  const shown = search ? sorted.filter(s => s.name.toLowerCase().includes(search)) : sorted;

  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
    setQuery('');
  };

  const tile = (supplier: Supplier) => {
    const isActive = supplier.id === activeId;
    return (
      <div
        key={supplier.id}
        className={`flex min-w-0 items-stretch rounded-xl ring-1 ${
          isActive ? 'bg-cyan-500/10 ring-cyan-500 dark:bg-cyan-400/10 dark:ring-cyan-400' : 'bg-white ring-slate-200 dark:bg-slate-900 dark:ring-white/10'
        }`}
        data-testid="supplier-tile"
      >
        <button
          type="button"
          onClick={() => choose(supplier.id)}
          aria-pressed={isActive}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-1.5 py-1.5 px-3 text-start"
        >
          <span dir="auto" className="min-w-0 flex-1 break-words text-[0.9375rem] font-semibold leading-tight">{supplier.name}</span>
          <Badge count={badges[supplier.id] ?? 0} tone="teal" />
        </button>
      </div>
    );
  };

  return (
    <>
      {/* One compact button: the current supplier and its order lines. Tapping it opens every
          supplier, with the recent ones first. */}
      {active && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('currentSupplierChange', { name: active.name })}
          data-testid="current-supplier"
          className={`flex min-h-11 min-w-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-1 text-sm font-bold text-white shadow-md shadow-cyan-500/25 ${className}`}
        >
          <span dir="auto" className="min-w-0 break-words text-start leading-tight">{active.name}</span>
          <Badge count={badges[active.id] ?? 0} tone="light" />
          <ChevronDownIcon className="ms-auto h-4 w-4 flex-shrink-0" />
        </button>
      )}

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
        title={t('allSuppliers')}
        testId="supplier-grid"
      >
        <div className="space-y-3">
          {suppliers.length > 8 && (
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('searchSuppliers')}
                aria-label={t('searchSuppliers')}
                className={`${ui.input} ps-10 pe-12 [&::-webkit-search-cancel-button]:appearance-none`}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label={t('clearSearch')} className={`${ui.iconButton} absolute end-0 top-0`}>
                  <XIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
          {!search && quickIds.length > 0 && (
            <section>
              <h3 className={`${ui.eyebrow} mb-1`}>{t('recentSuppliers')}</h3>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9rem),1fr))]" data-testid="supplier-grid-recent">
                {quickIds.map(id => byId.get(id)).filter((x): x is Supplier => !!x).map(tile)}
              </div>
            </section>
          )}
          <section>
            {!search && quickIds.length > 0 && <h3 className={`${ui.eyebrow} mb-1`}>{t('allSuppliers')}</h3>}
            {shown.length === 0 ? (
              <p className={ui.muted}>{t('noSuppliersMatch')}</p>
            ) : (
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9rem),1fr))]" data-testid="supplier-grid-all">
                {shown.map(tile)}
              </div>
            )}
          </section>
        </div>
      </Sheet>
    </>
  );
};

export default SupplierSelector;
