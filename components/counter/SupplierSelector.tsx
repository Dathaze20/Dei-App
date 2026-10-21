// components/counter/SupplierSelector.tsx
//
// Choosing a supplier without swiping sideways. The everyday bar shows the current supplier (tap
// it for every supplier) and, on the same line, the pinned and recently used ones that fit; any
// that do not fit are simply left for the full list, never cut off. "All suppliers" opens a grid
// that fits the screen and the text size (fewer columns at larger text), with search and a pin
// on each supplier. Order-line counts show on both.
import React, { useMemo, useState } from 'react';
import { Supplier } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { ChevronDownIcon, MagnifyingGlassIcon, Squares2X2Icon, StarIcon, XIcon } from '../shared/icons';

interface SupplierSelectorProps {
  suppliers: Supplier[];
  activeId: string;
  quickIds: string[];
  favorites: string[];
  badges: Record<string, number>;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

const Badge: React.FC<{ count: number; tone: 'light' | 'teal' }> = ({ count, tone }) =>
  count > 0 ? (
    <span className={`min-w-5 flex-shrink-0 rounded-full px-1.5 text-center text-xs font-bold ${tone === 'light' ? 'bg-white/25 text-white' : 'bg-teal-500 text-white'}`}>
      {count}
    </span>
  ) : null;

const SupplierSelector: React.FC<SupplierSelectorProps> = ({ suppliers, activeId, quickIds, favorites, badges, onSelect, onToggleFavorite }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(suppliers.map(s => [s.id, s])), [suppliers]);
  const active = byId.get(activeId);
  const sorted = useMemo(() => [...suppliers].sort((a, b) => a.name.localeCompare(b.name)), [suppliers]);
  const search = query.trim().toLowerCase();
  const shown = search ? sorted.filter(s => s.name.toLowerCase().includes(search)) : sorted;
  const pinned = sorted.filter(s => favorites.includes(s.id));

  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
    setQuery('');
  };

  const tile = (supplier: Supplier) => {
    const isActive = supplier.id === activeId;
    const isFavorite = favorites.includes(supplier.id);
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
          className="flex min-h-12 min-w-0 flex-1 items-center gap-1.5 py-1.5 ps-3 text-start"
        >
          <span dir="auto" className="min-w-0 flex-1 break-words text-[0.9375rem] font-semibold leading-tight">{supplier.name}</span>
          <Badge count={badges[supplier.id] ?? 0} tone="teal" />
        </button>
        <button
          type="button"
          onClick={() => onToggleFavorite(supplier.id)}
          aria-pressed={isFavorite}
          aria-label={t(isFavorite ? 'unpinSupplier' : 'pinSupplier', { name: supplier.name })}
          className={`inline-flex w-11 flex-shrink-0 items-center justify-center ${isFavorite ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}
        >
          <StarIcon className="h-5 w-5" filled={isFavorite} />
        </button>
      </div>
    );
  };

  return (
    <>
      {/* One row, no sideways scrolling: the current supplier (tap it for the full list; its name
          shortens on very large text), "All" (always shown), then pinned and recent ones; those
          that do not fit wrap out of sight (they are all in the full list), so nothing is cut in
          half. overflow: clip (not hidden) so focus can never scroll a hidden chip into view. */}
      <div className="flex h-11 min-w-0 gap-2" data-testid="supplier-bar">
        {active && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('currentSupplierChange', { name: active.name })}
            data-testid="current-supplier"
            className="flex h-11 min-w-0 max-w-[70%] flex-shrink items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-4 text-sm font-bold text-white shadow-md shadow-cyan-500/25"
          >
            <span className="min-w-0 truncate">{active.name}</span>
            <Badge count={badges[active.id] ?? 0} tone="light" />
            <ChevronDownIcon className="h-4 w-4 flex-shrink-0" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('allSuppliers')}
          data-testid="all-suppliers"
          className="flex h-11 flex-shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold text-cyan-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-cyan-300 dark:ring-white/10"
        >
          <Squares2X2Icon className="h-5 w-5 flex-shrink-0" />
          <span className="max-[379px]:sr-only">{t('allShort')}</span>
        </button>
        <div className="quick-chips flex h-11 min-w-0 flex-1 flex-wrap gap-2 overflow-clip">
        {quickIds.map(id => {
          const supplier = byId.get(id);
          if (!supplier) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              data-testid="quick-supplier"
              className="flex h-11 min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-white/10"
            >
              {favorites.includes(id) && <StarIcon className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" filled />}
              <span className="min-w-0 truncate">{supplier.name}</span>
              <Badge count={badges[id] ?? 0} tone="teal" />
            </button>
          );
        })}
        </div>
      </div>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
        title={t('allSuppliers')}
        subtitle={t('suppliersPinHelp')}
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
          {!search && pinned.length > 0 && (
            <section>
              <h3 className={`${ui.eyebrow} mb-1.5`}>{t('pinnedSuppliers')}</h3>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9rem),1fr))]">{pinned.map(tile)}</div>
            </section>
          )}
          <section>
            {!search && pinned.length > 0 && <h3 className={`${ui.eyebrow} mb-1.5`}>{t('allSuppliers')}</h3>}
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
