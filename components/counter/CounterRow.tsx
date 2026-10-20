// components/counter/CounterRow.tsx
//
// A compact product row: picture, the product's identity on two lines (without repeating the
// group heading), the verified stock state, and one fast control:
//   order mode  "+" adds one to the saved order, then [− quantity +];
//   count mode  "Count" opens the counting keypad;
//   item list   (Boar's Head) a tick box to put it on the list, then [− quantity +].
// Tapping the name or picture opens the product sheet with the full name and every detail.
import React from 'react';
import { motion } from 'framer-motion';
import { Product } from '../../types';
import ProductThumb from '../ProductThumb';
import StockLabel from '../StockLabel';
import CounterStepper from './CounterStepper';
import { useTranslation } from '../../hooks/useTranslation';
import { CalculatorIcon, CheckIcon } from '../shared/icons';

export type RowMode = 'order' | 'count' | 'list';

interface CounterRowProps {
  product: Product;
  mode: RowMode;
  quantity: number;
  olderCaseQuantity: number;
  onOpen: (product: Product) => void;
  onAdd: (product: Product) => void;
  onRemove: (product: Product) => void;
  onCount: (product: Product) => void;
  /** Item lists: take the product off the list completely. */
  onUncheck: (product: Product) => void;
  /**
   * What the group already says, so the row does not repeat it: in a product-line group (Pepsi)
   * the row shows flavor + size; in a size group (23 oz. Big Can) flavor + name; otherwise
   * name + flavor + size.
   */
  groupedBy: 'line' | 'size' | 'other';
}

const CounterRow: React.FC<CounterRowProps> = ({ product, mode, quantity, olderCaseQuantity, onOpen, onAdd, onRemove, onCount, onUncheck, groupedBy }) => {
  const { t } = useTranslation();
  const label = [product.name, product.flavor].filter(Boolean).join(' ');
  const flavorFirst = groupedBy !== 'other' && !!product.flavor;
  const primary = flavorFirst ? product.flavor : product.name;
  const secondary = (
    groupedBy === 'line' ? [flavorFirst ? '' : product.flavor, product.size]
    : groupedBy === 'size' ? [flavorFirst ? product.name : product.flavor]
    : [product.flavor, product.size]
  ).filter(Boolean).join(' · ');
  const selected = quantity > 0;

  return (
    <div
      data-testid="counter-row"
      data-product={product.id}
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2 ps-2 pe-1.5 border-s-2 transition-colors ${
        selected ? 'border-teal-500 bg-teal-500/[0.06] dark:bg-teal-400/[0.07]' : 'border-transparent'
      }`}
    >
      {mode === 'list' && (
        <motion.button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={t('onTheList', { name: label })}
          whileTap={{ scale: 0.9 }}
          onClick={() => (selected ? onUncheck(product) : onAdd(product))}
          className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center"
        >
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ring-2 transition-colors ${
            selected ? 'bg-teal-500 text-white ring-teal-500 dark:bg-teal-400 dark:text-slate-950 dark:ring-teal-400' : 'ring-slate-300 dark:ring-white/25'
          }`}>
            {selected && <CheckIcon className="h-5 w-5" />}
          </span>
        </motion.button>
      )}
      <ProductThumb product={product} className="h-11 w-11 rounded-lg" onClick={() => onOpen(product)} />
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(product)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(product); } }}
        aria-label={t('productDetailsFor', { name: label })}
        className="min-w-0 flex-1 basis-[8.5rem] cursor-pointer text-start rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
      >
        <p dir="auto" className="truncate rtl:text-right text-[0.9375rem] font-semibold leading-snug text-slate-900 dark:text-slate-50">{primary}</p>
        {secondary && <p dir="auto" className="truncate rtl:text-right text-xs leading-snug text-slate-500 dark:text-slate-400">{secondary}</p>}
        <StockLabel product={product} className="mt-0.5 leading-snug" />
        {olderCaseQuantity > 0 && (
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('olderCasesNote', { quantity: olderCaseQuantity })}</p>
        )}
      </div>
      {mode === 'count' ? (
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={() => onCount(product)}
          aria-label={t('countFor', { name: label })}
          className="ms-auto inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-xl bg-cyan-600 px-3 text-sm font-bold text-white shadow-md shadow-cyan-600/20 dark:bg-cyan-400 dark:text-slate-950"
        >
          <CalculatorIcon className="h-5 w-5" />
          <span>{t('countShort')}</span>
        </motion.button>
      ) : mode === 'list' && !selected ? null : (
        <div className="ms-auto flex-shrink-0">
          <CounterStepper quantity={quantity} name={label} onAdd={() => onAdd(product)} onRemove={() => onRemove(product)} />
        </div>
      )}
    </div>
  );
};

export default CounterRow;
