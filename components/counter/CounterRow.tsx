// components/counter/CounterRow.tsx
//
// A compact product row: picture, the product's identity on two lines, and the stock state. Tapping the text or picture opens the existing product sheet
// (details, verified stock counting, add with a chosen quantity).
import React from 'react';
import { Product } from '../../types';
import ProductThumb from '../ProductThumb';
import StockLabel from '../StockLabel';
import CounterStepper from './CounterStepper';
import { useTranslation } from '../../hooks/useTranslation';

interface CounterRowProps {
  product: Product;
  quantity: number;
  olderCaseQuantity: number;
  onOpen: (product: Product) => void;
  onAdd: (product: Product) => void;
  onRemove: (product: Product) => void;
  /**
   * What the group already says, so the row does not repeat it: in a product-line group (Pepsi)
   * the row shows flavor + size; in a size group (23 oz. Big Can) flavor + name; otherwise
   * name + flavor + size.
   */
  groupedBy: 'line' | 'size' | 'other';
}

const CounterRow: React.FC<CounterRowProps> = ({ product, quantity, olderCaseQuantity, onOpen, onAdd, onRemove, groupedBy }) => {
  const { t } = useTranslation();
  const label = [product.name, product.flavor].filter(Boolean).join(' ');
  const flavorFirst = groupedBy !== 'other' && !!product.flavor;
  const primary = flavorFirst ? product.flavor : product.name;
  const secondary = (
    groupedBy === 'line' ? [flavorFirst ? '' : product.flavor, product.size]
    : groupedBy === 'size' ? [flavorFirst ? product.name : product.flavor]
    : [product.flavor, product.size]
  ).filter(Boolean).join(' · ');
  return (
    <div
      data-testid="counter-row"
      className={`flex items-center gap-3 py-2 ps-2 pe-1.5 border-s-2 transition-colors ${
        quantity > 0 ? 'border-teal-500 bg-teal-500/[0.06] dark:bg-teal-400/[0.07]' : 'border-transparent'
      }`}
    >
      <ProductThumb product={product} className="w-11 h-11 rounded-lg" onClick={() => onOpen(product)} />
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(product)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(product); } }}
        aria-label={t('productDetailsFor', { name: label })}
        className="min-w-0 flex-1 cursor-pointer text-start rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
      >
        <p dir="auto" className="truncate rtl:text-right text-[0.9375rem] font-semibold leading-snug text-slate-900 dark:text-slate-50">{primary}</p>
        {secondary && <p dir="auto" className="truncate rtl:text-right text-xs leading-snug text-slate-500 dark:text-slate-400">{secondary}</p>}
        <StockLabel product={product} className="mt-0.5 leading-snug" />
        {olderCaseQuantity > 0 && (
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('olderCasesNote', { quantity: olderCaseQuantity })}</p>
        )}
      </div>
      <CounterStepper quantity={quantity} name={label} onAdd={() => onAdd(product)} onRemove={() => onRemove(product)} />
    </div>
  );
};

export default CounterRow;
