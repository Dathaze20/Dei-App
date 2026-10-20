// components/counter/OrderLines.tsx
//
// One supplier's order lines with − / + and Remove, used by the order tray and the Orders tab.
// Case suppliers show the catalog cost as an estimate; item lists (Boar's Head) show no prices.
// A case line saved before item ordering keeps meaning cases until it is explicitly changed.
import React, { useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { SummaryGroup } from '../../utils/orderSummary';
import ProductThumb from '../ProductThumb';
import ConfirmSheet from '../ui/ConfirmSheet';
import { ui } from '../ui/styles';
import { MinusIcon, PlusIcon, TrashIcon } from '../shared/icons';

export const money = (value: number) => `$${value.toFixed(2)}`;

/** Lines and units of one supplier's part of the order. */
export const groupTotals = (group: SummaryGroup) => ({
  lines: group.lines.length,
  units: group.lines.reduce((total, line) => total + line.item.quantity, 0),
});

const OrderLines: React.FC<{ group: SummaryGroup }> = ({ group }) => {
  const { updateOrderItemQuantity, removeFromOrder, convertOrderLineToItems } = useInventory();
  const { t } = useTranslation();
  const [converting, setConverting] = useState<{ productId: string; quantity: number } | null>(null);

  return (
    <ul className="divide-y divide-slate-100 dark:divide-white/5">
      {group.lines.map(({ item, product, unit, priced, lineTotal, olderCaseLine }) => {
        const name = [product.name, product.flavor].filter(Boolean).join(' ');
        // Case suppliers lead with the flavor (the brand repeats down the list); item lists
        // (Boar's Head) lead with the product, as on the Counter tab: "OvenGold Turkey Breast".
        const flavorFirst = group.workflow.orderStyle === 'cases' && !!product.flavor;
        const primary = flavorFirst ? product.flavor : product.name;
        const secondary = [flavorFirst ? product.name : product.flavor, product.size].filter(Boolean).join(' · ');
        return (
          <li key={`${item.productId}|${unit}`} className="py-2" data-testid="order-line">
            <div className="flex flex-wrap items-start gap-x-3">
              <ProductThumb product={product} alt="" className="h-11 w-11 rounded-lg" />
              <div className="min-w-0 flex-1 basis-32">
                <p dir="auto" className="break-words font-semibold leading-snug rtl:text-right" data-testid="order-line-name">{primary}</p>
                <p dir="auto" className="break-words text-xs text-slate-500 rtl:text-right dark:text-slate-400">{secondary}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {priced
                    ? t('lineEstimate', { quantity: item.quantity, price: money(product.costPrice) })
                    : olderCaseLine
                      ? `${item.quantity} ${t('casesUnit')} · ${t('olderCaseLine')}`
                      : t('itemsQuantity', { quantity: item.quantity })}
                </p>
              </div>
              {lineTotal !== null && <p className="ms-auto flex-shrink-0 font-bold tabular-nums">{money(lineTotal)}</p>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 ps-14">
              <div dir="ltr" className="flex items-center rounded-xl bg-slate-100 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
                <button type="button" onClick={() => updateOrderItemQuantity(item.productId, item.quantity - 1, unit)} aria-label={t('removeOne', { name })} className="inline-flex h-11 w-11 items-center justify-center">
                  <MinusIcon className="h-5 w-5" />
                </button>
                <span className="min-w-8 text-center font-bold tabular-nums">{item.quantity}</span>
                <button type="button" onClick={() => updateOrderItemQuantity(item.productId, item.quantity + 1, unit)} aria-label={t('addOne', { name })} className="inline-flex h-11 w-11 items-center justify-center text-teal-600 dark:text-teal-300">
                  <PlusIcon className="h-5 w-5" />
                </button>
              </div>
              <span className="text-sm text-slate-500 dark:text-slate-400">{unit === 'item' ? t('itemsUnit') : t('casesUnit')}</span>
              {olderCaseLine && (
                <button type="button" className={ui.secondary} onClick={() => setConverting({ productId: item.productId, quantity: item.quantity })}>
                  {t('convertToItems')}
                </button>
              )}
              <button type="button" className={`${ui.ghost} ms-auto !text-red-700 dark:!text-red-300`} onClick={() => removeFromOrder(item.productId, unit)} aria-label={`${t('removeFromOrder')}: ${name}`}>
                <TrashIcon className="h-5 w-5" /> {t('remove')}
              </button>
            </div>
          </li>
        );
      })}
      <ConfirmSheet
        open={!!converting}
        title={t('convertToItems')}
        message={converting ? t('convertToItemsConfirm', { quantity: converting.quantity }) : ''}
        confirmLabel={t('convertToItems')}
        tone="primary"
        onCancel={() => setConverting(null)}
        onConfirm={() => {
          if (converting) convertOrderLineToItems(converting.productId);
          setConverting(null);
        }}
      />
    </ul>
  );
};

export default OrderLines;
