// components/counter/StoreOrdering.tsx
//
// Store ordering (v0.1.7, Menu › Store ordering): this deli's own ordering facts, editable here and
// never trapped in the assistant's chat. Per supplier: delivery days, order cut-off, lead time;
// per product: carried or not, about how many cases a week, how much to keep on hand. Each value
// shows where it came from (utils/storeProfile.ts); typed here it is the owner's estimate.
// Below, how this store has actually ordered, from its saved orders (a pattern, not sales).
import React, { useMemo, useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useDevicePrefs } from '../../hooks/useDevicePrefs';
import { useTranslation } from '../../hooks/useTranslation';
import { useStoreProfile } from '../../contexts/StoreProfileContext';
import { Product } from '../../types';
import { supplierPattern } from '../../utils/orderPatterns';
import { Fact, ProductField, Weekday, fact, withProductFact, withSupplierFact } from '../../utils/storeProfile';
import { formatCountDate } from '../StockLabel';
import ProductThumb from '../ProductThumb';
import { ui } from '../ui/styles';
import { useToast } from '../ui/Toast';

const SOURCE_KEYS: Record<string, string> = {
  'owner-estimate': 'srcOwnerEstimate', 'confirmed-order': 'srcConfirmedOrder', invoice: 'srcInvoice', 'verified-count': 'srcVerifiedCount', 'sales-record': 'srcSalesRecord',
};
const DAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const StoreOrdering: React.FC = () => {
  const { products, suppliers, orderHistory } = useInventory();
  const { profile, available, update } = useStoreProfile();
  const { t, language } = useTranslation();
  const toast = useToast();
  const [prefs] = useDevicePrefs();
  const sorted = useMemo(() => [...suppliers].sort((a, b) => a.name.localeCompare(b.name)), [suppliers]);
  const [supplierId, setSupplierId] = useState(() => (suppliers.some(s => s.id === prefs.lastSupplier) ? prefs.lastSupplier : sorted[0]?.id ?? ''));
  const [showAll, setShowAll] = useState(false);
  const locale = language === 'ar' ? 'ar-u-nu-latn' : language === 'es' ? 'es-US' : 'en-US';

  const supplierFacts = profile.suppliers[supplierId] ?? {};
  const ofSupplier = products.filter(p => p.supplierId === supplierId).sort((a, b) => `${a.name} ${a.flavor}`.localeCompare(`${b.name} ${b.flavor}`));
  const withNumbers = ofSupplier.filter(p => profile.products[p.id]);
  const shown = showAll || withNumbers.length === 0 ? ofSupplier : withNumbers;
  const pattern = useMemo(() => supplierPattern(orderHistory, supplierId), [orderHistory, supplierId]);

  const save = (change: Parameters<typeof update>[0]) => {
    if (!update(change)) toast(t('profileSaveFailed'));
  };
  const source = (f: Fact<unknown> | undefined) => (f ? t('factFrom', { source: t(SOURCE_KEYS[f.source] as never), date: formatCountDate(f.at, language) }) : t('unknownValue'));

  const days = supplierFacts.deliveryDays?.value ?? [];
  const toggleDay = (d: Weekday) => {
    const next = (days.includes(d) ? days.filter(x => x !== d) : [...days, d]).sort((a, b) => a - b) as Weekday[];
    save(p => withSupplierFact(p, supplierId, 'deliveryDays', next.length ? fact(next, 'owner-estimate') : null));
  };

  const setProductNumber = (product: Product, field: Extract<ProductField, 'weeklyCases' | 'reorderAtUnits'>, text: string) => {
    const trimmed = text.trim();
    const current = profile.products[product.id]?.[field]?.value;
    if (trimmed === '') {
      if (current !== undefined) save(p => withProductFact(p, product.id, field, null));
      return;
    }
    if (!/^\d{1,5}$/.test(trimmed)) return;
    const value = Number(trimmed);
    if (value !== current) save(p => withProductFact(p, product.id, field, fact(value, 'owner-estimate')));
  };

  const setCarried = (product: Product, value: boolean | null) =>
    save(p => withProductFact(p, product.id, 'carried', value === null ? null : fact(value, 'owner-estimate')));

  return (
    <div className="space-y-3" data-testid="store-ordering">
      <section className={`${ui.card} space-y-2 p-3`}>
        <h1 className="text-lg font-extrabold leading-tight">{t('storeOrdering')}</h1>
        <p className={ui.muted}>{t('storeOrderingIntro')}</p>
        <p className={`${ui.muted} text-xs`}>{t('storeOrderingTalk')}</p>
        {!available && <p role="alert" className={ui.error}>{t('profileBlocked')}</p>}
        <label className="block">
          <span className={ui.label}>{t('supplierLabel')}</span>
          <select className={ui.input} value={supplierId} onChange={e => setSupplierId(e.target.value)} data-testid="store-supplier">
            {sorted.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </section>

      <section className={`${ui.card} space-y-3 p-3`} data-testid="store-supplier-facts">
        <div>
          <p className={ui.eyebrow}>{t('deliveryDays')}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {DAY_ORDER.map(d => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(d)}
                disabled={!available}
                onClick={() => toggleDay(d)}
                className={`min-h-11 min-w-11 rounded-xl px-2 text-sm font-semibold ring-1 ${days.includes(d) ? 'bg-cyan-600 text-white ring-cyan-600 dark:bg-cyan-400 dark:text-slate-950' : 'ring-slate-300 dark:ring-white/20'}`}
                data-testid="store-day"
              >
                {new Date(2026, 0, 4 + d).toLocaleDateString(locale, { weekday: 'short' })}
              </button>
            ))}
          </div>
          <p className={`${ui.muted} mt-1 text-xs`}>{source(supplierFacts.deliveryDays)}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 basis-[8rem]">
            <span className={ui.label}>{t('orderCutoff')}</span>
            <input
              type="time"
              className={ui.input}
              disabled={!available}
              value={supplierFacts.orderCutoff?.value.time ?? ''}
              onChange={e => save(p => withSupplierFact(p, supplierId, 'orderCutoff', e.target.value ? fact({ time: e.target.value, daysBefore: supplierFacts.orderCutoff?.value.daysBefore ?? 1 }, 'owner-estimate') : null))}
            />
          </label>
          <label className="min-w-0 basis-[9rem]">
            <span className={ui.label}>{t('cutoffDaysBefore')}</span>
            <input
              inputMode="numeric"
              className={ui.input}
              disabled={!available || !supplierFacts.orderCutoff}
              defaultValue={supplierFacts.orderCutoff?.value.daysBefore ?? ''}
              key={`cut-${supplierId}-${supplierFacts.orderCutoff?.at}`}
              onBlur={e => {
                const n = Number(e.target.value);
                if (supplierFacts.orderCutoff && Number.isInteger(n) && n >= 0 && n <= 14) save(p => withSupplierFact(p, supplierId, 'orderCutoff', fact({ ...supplierFacts.orderCutoff!.value, daysBefore: n }, 'owner-estimate')));
              }}
            />
          </label>
          <label className="min-w-0 basis-[8rem]">
            <span className={ui.label}>{t('leadDays')}</span>
            <input
              inputMode="numeric"
              className={ui.input}
              disabled={!available}
              defaultValue={supplierFacts.leadDays?.value ?? ''}
              key={`lead-${supplierId}-${supplierFacts.leadDays?.at}`}
              onBlur={e => {
                const v = e.target.value.trim();
                const n = Number(v);
                if (v === '') save(p => withSupplierFact(p, supplierId, 'leadDays', null));
                else if (Number.isInteger(n) && n >= 0 && n <= 30) save(p => withSupplierFact(p, supplierId, 'leadDays', fact(n, 'owner-estimate')));
              }}
            />
          </label>
        </div>
      </section>

      <section className={`${ui.card} p-3`} data-testid="store-products">
        <h2 className={`${ui.eyebrow} mb-1`}>{t('usualProducts')}</h2>
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {shown.map(product => {
            const facts = profile.products[product.id] ?? {};
            return (
              <li key={product.id} className="space-y-1.5 py-2" data-testid="store-product">
                <div className="flex items-center gap-2">
                  <ProductThumb product={product} alt="" className="h-10 w-10 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block break-words font-semibold leading-tight">{product.flavor || product.name}</span>
                    <span dir="auto" className="block break-words text-xs text-slate-500 dark:text-slate-400">{[product.flavor ? product.name : '', product.size].filter(Boolean).join(' · ')}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-2 ps-12">
                  <label className="min-w-0 basis-[7rem] flex-1">
                    <span className="block text-xs font-semibold">{t('weeklyCasesLabel')}</span>
                    <input
                      inputMode="numeric"
                      className={`${ui.input} !min-h-11`}
                      disabled={!available}
                      placeholder={t('unknownValue')}
                      defaultValue={facts.weeklyCases?.value ?? ''}
                      key={`w-${product.id}-${facts.weeklyCases?.at}`}
                      onBlur={e => setProductNumber(product, 'weeklyCases', e.target.value)}
                      data-testid="store-weekly"
                    />
                    <span className="block text-[0.6875rem] text-slate-500 dark:text-slate-400">{source(facts.weeklyCases)}</span>
                  </label>
                  <label className="min-w-0 basis-[7rem] flex-1">
                    <span className="block text-xs font-semibold">{t('keepOnHand')}</span>
                    <input
                      inputMode="numeric"
                      className={`${ui.input} !min-h-11`}
                      disabled={!available}
                      placeholder={String(product.reorderThresholdUnits)}
                      defaultValue={facts.reorderAtUnits?.value ?? ''}
                      key={`r-${product.id}-${facts.reorderAtUnits?.at}`}
                      onBlur={e => setProductNumber(product, 'reorderAtUnits', e.target.value)}
                    />
                    <span className="block text-[0.6875rem] text-slate-500 dark:text-slate-400">{source(facts.reorderAtUnits)}</span>
                  </label>
                  <div role="group" aria-label={t('carriedLabel')} className="flex items-center gap-1">
                    <span className="me-1 text-xs font-semibold">{t('carriedLabel')}</span>
                    {([true, false] as const).map(v => (
                      <button
                        key={String(v)}
                        type="button"
                        aria-pressed={facts.carried?.value === v}
                        disabled={!available}
                        onClick={() => setCarried(product, facts.carried?.value === v ? null : v)}
                        className={`min-h-11 min-w-11 rounded-xl px-2 text-sm font-semibold ring-1 ${facts.carried?.value === v ? 'bg-slate-800 text-white ring-slate-800 dark:bg-white dark:text-slate-900' : 'ring-slate-300 dark:ring-white/20'}`}
                      >
                        {v ? t('carriedYes') : t('carriedNo')}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {withNumbers.length > 0 && (
          <button type="button" className={`${ui.ghost} mt-1 w-full`} onClick={() => setShowAll(v => !v)} data-testid="store-show-all">
            {showAll ? t('showSetProducts') : t('showAllProducts', { count: ofSupplier.length })}
          </button>
        )}
      </section>

      <section className={`${ui.card} space-y-1 p-3`} data-testid="store-pattern">
        <h2 className={ui.eyebrow}>{t('orderPatternTitle')}</h2>
        {!pattern && <p className={ui.muted}>{t('orderPatternNone')}</p>}
        {pattern && (
          <>
            <p className={`${ui.muted} text-xs`}>{t(pattern.basis === 'sent' ? 'usualBasisSent' : 'usualBasisSaved', { orders: pattern.ordersInWindow, weeks: pattern.weeks })}</p>
            <ul className="space-y-1 text-sm">
              {pattern.products.slice(0, 15).map(p => (
                <li key={`${p.productId}${p.unit}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span dir="auto" className="min-w-0 flex-1 font-semibold">{[p.flavor || p.name, p.size].filter(Boolean).join(' · ')}</span>
                  <span className="text-slate-600 dark:text-slate-300">{t('usualPattern', { orders: p.orders, perOrder: `${p.perOrder} ${p.unit === 'item' ? t('itemsUnit') : t('casesUnit')}`, perWeek: p.perWeek })}</span>
                </li>
              ))}
            </ul>
            <p className={`${ui.muted} text-xs`}>{t('a_notBestsellers' as never)}</p>
          </>
        )}
      </section>
    </div>
  );
};

export default StoreOrdering;
