// components/counter/CounterRow.tsx
//
// A product row on the Counter screen (the v0.1.6 default; utils/rowText.ts decides the words):
//   picture (52 px; tap it for a large preview), the flavor first, then what the screen does not
//   already say (product line without the supplier's name, size unless the size pill says it),
//   and one control on the right:
//     order mode  "+" adds one case (or one item for item suppliers) straight to the order; the
//                 control then shows ✓ and the quantity; tapping it opens the quantity adjuster
//                 (− / + / Remove). Adding and removing show Undo.
//     count mode  "Count" opens the counting keypad; the verified stock shows under the name.
//     item list   (Boar's Head) the same control, as a tick: tick adds one item.
// Names are never cut short: they wrap. Picking for an order never counts stock.
import React from 'react';
import { motion } from 'framer-motion';
import { Product } from '../../types';
import { GroupedBy, rowText } from '../../utils/rowText';
import ProductThumb from '../ProductThumb';
import StockLabel from '../StockLabel';
import { useTranslation } from '../../hooks/useTranslation';
import { CalculatorIcon, CheckIcon, PlusIcon } from '../shared/icons';

export type RowMode = 'order' | 'count' | 'list';

interface CounterRowProps {
  product: Product;
  mode: RowMode;
  quantity: number;
  /** "cases" or "items", for the control's spoken label. */
  unitLabel: string;
  olderCaseQuantity: number;
  supplierName?: string;
  groupedBy: GroupedBy;
  onOpen: (product: Product) => void;
  onAdd: (product: Product) => void;
  onAdjust: (product: Product) => void;
  onCount: (product: Product) => void;
}

const CounterRow: React.FC<CounterRowProps> = ({
  product, mode, quantity, unitLabel, olderCaseQuantity, supplierName, groupedBy, onOpen, onAdd, onAdjust, onCount,
}) => {
  const { t } = useTranslation();
  const label = [product.name, product.flavor].filter(Boolean).join(' ');
  const { primary, secondary } = rowText(product, groupedBy, supplierName, mode === 'list');
  const selected = quantity > 0;

  let control: React.ReactNode;
  if (mode === 'count') {
    control = (
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={() => onCount(product)}
        aria-label={t('countFor', { name: label })}
        data-testid="row-count"
        className="inline-flex min-h-11 min-w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-cyan-600 px-2 py-1 text-white shadow-sm dark:bg-cyan-400 dark:text-slate-950"
      >
        <CalculatorIcon className="h-5 w-5" />
        <span className="whitespace-nowrap text-[0.6875rem] font-bold leading-tight">{t('countShort')}</span>
      </motion.button>
    );
  } else if (!selected) {
    control = (
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={() => onAdd(product)}
        {...(mode === 'list' ? { role: 'checkbox', 'aria-checked': false, 'aria-label': t('onTheList', { name: label }) } : { 'aria-label': t('addOne', { name: label }) })}
        data-testid="row-add"
        className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-teal-700 ring-2 ring-inset ring-teal-500 dark:text-teal-300 dark:ring-teal-400"
      >
        {mode === 'list' ? <span className="h-5 w-5" aria-hidden="true" /> : <PlusIcon className="h-6 w-6" />}
      </motion.button>
    );
  } else {
    control = (
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={() => onAdjust(product)}
        aria-label={t('changeQuantityFor', { name: label, quantity, unit: unitLabel })}
        data-testid="row-selected"
        className="inline-flex h-11 min-w-[3.5rem] flex-shrink-0 items-center justify-center gap-1 rounded-full bg-teal-600 px-3 font-bold tabular-nums text-white shadow-sm dark:bg-teal-400 dark:text-slate-950"
      >
        <CheckIcon className="h-5 w-5 flex-shrink-0" />
        <span className="whitespace-nowrap">{quantity}</span>
      </motion.button>
    );
  }

  return (
    <div
      data-testid="counter-row"
      data-product={product.id}
      data-selected={selected || undefined}
      className={`row-pad flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 ps-2 pe-2 transition-colors ${
        selected ? 'bg-teal-500/[0.08] dark:bg-teal-400/[0.08]' : ''
      }`}
    >
      {/* The picture: tap for a large preview with the full name, size and details. */}
      <button type="button" onClick={() => onOpen(product)} aria-label={t('pictureOf', { name: label })} className="flex-shrink-0 rounded-lg" data-testid="row-picture">
        <ProductThumb product={product} alt="" className="row-thumb rounded-lg" />
      </button>
      {/* basis in em (not rem): it grows with Android's text size, so at the largest sizes the
          control moves under the name instead of squeezing the words until they break. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(product)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(product); } }}
        aria-label={t('productDetailsFor', { name: label })}
        className="flex min-h-11 min-w-0 flex-1 basis-[6em] cursor-pointer flex-col justify-center self-stretch rounded-md text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
      >
        <p dir="auto" className="break-words text-[0.9375rem] font-semibold leading-snug text-slate-900 rtl:text-right dark:text-slate-50" data-testid="row-name">{primary}</p>
        {secondary && <p dir="auto" className="row-meta break-words text-[0.8125rem] leading-snug text-slate-500 rtl:text-right dark:text-slate-400">{secondary}</p>}
        {mode === 'count' && <StockLabel product={product} className="leading-snug" />}
        {olderCaseQuantity > 0 && (
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('olderCasesNote', { quantity: olderCaseQuantity })}</p>
        )}
      </div>
      <div className="ms-auto flex-shrink-0">{control}</div>
    </div>
  );
};

export default CounterRow;
