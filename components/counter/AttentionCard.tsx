// components/counter/AttentionCard.tsx
//
// "Needs attention" for the supplier on screen (utils/attention.ts): products at or below their
// reorder point, never counted, or not counted lately. One line on the Counter screen; Review
// lists them with the reason ("Verified 8 · reorder at 12"), and Count these walks the keypad
// through them with Save & Next. Products at or below their reorder point can be put on the
// order from the same list (one case; change it in the tray). It suggests what to check, never
// how much to order.
import React, { useState } from 'react';
import { Product } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import useInventory from '../../hooks/useInventory';
import { lineQuantity } from '../../utils/supplierDraft';
import { useToast } from '../ui/Toast';
import { AttentionItem, AttentionReason, attentionTotals, STALE_DAYS } from '../../utils/attention';
import ProductThumb from '../ProductThumb';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { AlertTriangleIcon, CalculatorIcon, ChevronRightIcon, PlusIcon } from '../shared/icons';

interface AttentionCardProps {
  items: AttentionItem[];
  /** Start counting at `product`, then follow `orderedIds`. */
  onCount: (product: Product, orderedIds: string[]) => void;
}

const AttentionCard: React.FC<AttentionCardProps> = ({ items, onCount }) => {
  const { t } = useTranslation();
  const { currentOrder, addToOrder } = useInventory();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const totals = attentionTotals(items);
  const parts = [
    totals.low > 0 && t('attentionLow', { count: totals.low }),
    totals.never > 0 && t('attentionNever', { count: totals.never }),
    totals.stale > 0 && t('attentionStale', { count: totals.stale, days: STALE_DAYS }),
  ].filter(Boolean) as string[];
  const ids = items.map(i => i.product.id);
  const reasonText = (reason: AttentionReason) =>
    reason.kind === 'out' ? t('reasonOut', { reorder: reason.reorderAt })
    : reason.kind === 'low' ? t('reasonLow', { units: reason.units, reorder: reason.reorderAt })
    : reason.kind === 'never' ? t('reasonNever')
    : t('reasonStale', { units: reason.units, days: reason.days });
  const start = (product: Product) => {
    setOpen(false);
    onCount(product, ids);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="attention-card"
        className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-amber-50 px-3 py-2 text-start ring-1 ring-amber-200 dark:bg-amber-400/10 dark:ring-amber-400/25"
      >
        <AlertTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-300" />
        <span className="min-w-0 flex-1 basis-[9rem]">
          <span className="block text-sm font-bold text-amber-900 dark:text-amber-200">{t('attentionTitle')}</span>
          <span className="block text-xs text-amber-800 dark:text-amber-300">{parts.join(' · ')}</span>
        </span>
        <span className="ms-auto flex flex-shrink-0 items-center gap-0.5 text-sm font-bold text-amber-800 dark:text-amber-200">
          {t('attentionReview')}
          <ChevronRightIcon className="h-4 w-4 rtl:-scale-x-100" />
        </span>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('attentionTitle')}
        subtitle={t('attentionHelp')}
        testId="attention-sheet"
        footer={
          <button type="button" className={`${ui.primary} w-full`} onClick={() => start(items[0].product)} data-testid="attention-count-all">
            <CalculatorIcon className="h-5 w-5" /> {t('attentionCountAll', { count: items.length })}
          </button>
        }
      >
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {items.map(({ product, reason }) => (
            <li key={product.id} className="flex items-center gap-3 py-2" data-testid="attention-item">
              <ProductThumb product={product} alt="" className="h-14 w-14 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p dir="auto" className="line-clamp-2 break-words text-[0.9375rem] font-semibold leading-snug rtl:text-right">
                  {[product.name, product.flavor].filter(Boolean).join(' ')}
                </p>
                <p className={`text-xs font-semibold ${reason.kind === 'out' ? 'text-red-600 dark:text-red-400' : reason.kind === 'low' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {reasonText(reason)}
                </p>
              </div>
              {(reason.kind === 'low' || reason.kind === 'out') && (() => {
                const inOrder = lineQuantity(currentOrder.items, product.id, 'case');
                const name = [product.name, product.flavor].filter(Boolean).join(' ');
                return (
                  <button
                    type="button"
                    onClick={() => {
                      addToOrder(product.id, 1);
                      toast(t('addedToOrder', { name }));
                    }}
                    aria-label={`${t('addToOrderShort')}: ${name}`}
                    data-testid="attention-add"
                    className="inline-flex min-h-11 min-w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-teal-500 px-2 py-1 text-white dark:bg-teal-400 dark:text-slate-950"
                  >
                    <PlusIcon className="h-5 w-5" />
                    {inOrder > 0 && <span className="text-[0.6875rem] font-bold leading-tight">{inOrder}</span>}
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => start(product)}
                aria-label={t('countFor', { name: [product.name, product.flavor].filter(Boolean).join(' ') })}
                className="inline-flex min-h-11 min-w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-cyan-600 px-2 py-1 text-white dark:bg-cyan-400 dark:text-slate-950"
              >
                <CalculatorIcon className="h-5 w-5" />
                <span className="text-[0.6875rem] font-bold leading-tight">{t('countShort')}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
};

export default AttentionCard;
