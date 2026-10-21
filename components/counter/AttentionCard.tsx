// components/counter/AttentionCard.tsx
//
// The stock summary for the supplier on screen (utils/attention.ts): one quiet line, "Stock: 1 low ·
// 84 not counted". Only verified low or out stock is shown as urgent; never counted means unknown,
// not low. In Order mode it shows only when something is verified low or out. Review lists them in
// groups (Out, Low, Not counted, Counted a while ago) with the reason ("Verified 8 · reorder at
// 12"), and Count these walks the keypad through a group or all of them with Save & Next. Products at or below their reorder point can be put on the
// order from the same list (one case; change it in the tray). It suggests what to check, never
// how much to order.
import React, { useState } from 'react';
import { Product } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import useInventory from '../../hooks/useInventory';
import { lineQuantity } from '../../utils/supplierDraft';
import { useToast } from '../ui/Toast';
import { AttentionItem, AttentionReason, STALE_DAYS } from '../../utils/attention';
import ProductThumb from '../ProductThumb';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { AlertTriangleIcon, CalculatorIcon, ChevronRightIcon, PlusIcon } from '../shared/icons';

interface AttentionCardProps {
  items: AttentionItem[];
  /** In Order mode the summary only shows when something is verified low or out. */
  mode: 'order' | 'count';
  /** Start counting at `product`, then follow `orderedIds`. */
  onCount: (product: Product, orderedIds: string[]) => void;
}

const GROUPS: { kind: AttentionReason['kind']; title: 'attentionOutGroup' | 'attentionLowGroup' | 'attentionNeverGroup' | 'attentionStaleGroup' }[] = [
  { kind: 'out', title: 'attentionOutGroup' },
  { kind: 'low', title: 'attentionLowGroup' },
  { kind: 'never', title: 'attentionNeverGroup' },
  { kind: 'stale', title: 'attentionStaleGroup' },
];

const AttentionCard: React.FC<AttentionCardProps> = ({ items, mode, onCount }) => {
  const { t } = useTranslation();
  const { currentOrder, addToOrder } = useInventory();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const out = items.filter(i => i.reason.kind === 'out').length;
  const low = items.filter(i => i.reason.kind === 'low').length;
  const never = items.filter(i => i.reason.kind === 'never').length;
  const stale = items.filter(i => i.reason.kind === 'stale').length;
  if (items.length === 0 || (mode === 'order' && out + low === 0)) return null;
  // Only verified low or out stock is shown as urgent; "not counted" means unknown, not low.
  const parts: { text: string; tone: string }[] = [
    out > 0 && { text: t('stockOut', { count: out }), tone: 'text-red-700 dark:text-red-300 font-bold' },
    low > 0 && { text: t('stockLowShort', { count: low }), tone: 'text-amber-700 dark:text-amber-300 font-bold' },
    never > 0 && { text: t('stockNotCounted', { count: never }), tone: '' },
    stale > 0 && { text: t('stockStale', { count: stale, days: STALE_DAYS }), tone: '' },
  ].filter(Boolean) as { text: string; tone: string }[];
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
        className="flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-2 py-1 text-start text-sm text-slate-600 dark:text-slate-300"
      >
        {out + low > 0 && <AlertTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-300" />}
        <span className="font-semibold">{t('stockSummary')}:</span>
        <span className="min-w-0 flex-1 basis-[10rem]">
          {parts.map((part, index) => (
            <span key={part.text} className={part.tone}>{index > 0 && ' · '}{part.text}</span>
          ))}
        </span>
        <span className="ms-auto flex flex-shrink-0 items-center gap-0.5 font-semibold text-cyan-700 dark:text-cyan-300">
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
        {GROUPS.map(({ kind, title }) => {
          const group = items.filter(i => i.reason.kind === kind);
          if (group.length === 0) return null;
          return (
            <section key={title} className="mb-3" data-testid="attention-group">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className={`${ui.eyebrow} min-w-0 flex-1`}>{t(title)} · {group.length}</h3>
                <button type="button" className={`${ui.ghost} !min-h-11 !px-2 text-sm`} onClick={() => { setOpen(false); onCount(group[0].product, group.map(i => i.product.id)); }}>
                  <CalculatorIcon className="h-4 w-4" /> {t('countGroup')}
                </button>
              </div>
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {group.map(({ product, reason }) => (
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
            </section>
          );
        })}
      </Sheet>
    </>
  );
};

export default AttentionCard;
