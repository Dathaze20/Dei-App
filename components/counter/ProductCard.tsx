// components/counter/ProductCard.tsx
//
// A product as a picture card, for finding products by sight on the Counter screen. Two cards sit
// side by side on a phone at normal text sizes; where a card is wide enough (one column, which is
// what larger Android text gives) it turns into a row with the picture on the left. The switch is
// a CSS container query (index.css, .product-card), so the same buttons are always present:
//   order mode  "+" (on the picture's corner) adds one case straight to the order; once it is in
//               the order, [− quantity +] sits under the name, so it never hides the picture;
//   count mode  "Count" opens the counting keypad.
// The flavor leads (it is what tells "Fruit Punch" from "Caution" in the same size); the product
// line and size follow. Tapping the picture or the name opens the full details.
import React from 'react';
import { Product } from '../../types';
import ProductThumb from '../ProductThumb';
import StockLabel from '../StockLabel';
import CounterStepper from './CounterStepper';
import { useTranslation } from '../../hooks/useTranslation';
import { CalculatorIcon } from '../shared/icons';

interface ProductCardProps {
  product: Product;
  mode: 'order' | 'count';
  quantity: number;
  onOpen: (product: Product) => void;
  onAdd: (product: Product) => void;
  onRemove: (product: Product) => void;
  onCount: (product: Product) => void;
  /** What the filter or heading already says, so the card does not repeat it. */
  groupedBy: 'line' | 'size' | 'other';
}

const ProductCard: React.FC<ProductCardProps> = ({ product, mode, quantity, onOpen, onAdd, onRemove, onCount, groupedBy }) => {
  const { t } = useTranslation();
  const label = [product.name, product.flavor].filter(Boolean).join(' ');
  const flavorFirst = !!product.flavor;
  const primary = flavorFirst ? product.flavor : product.name;
  const secondary = (
    groupedBy === 'line' ? [flavorFirst ? '' : product.flavor, product.size]
    : groupedBy === 'size' ? [flavorFirst ? product.name : '']
    : [flavorFirst ? product.name : '', product.size]
  ).filter(Boolean).join(' · ');
  const selected = quantity > 0;

  return (
    <div
      data-testid="counter-row"
      data-product={product.id}
      className={`product-card rounded-2xl bg-white ring-1 transition-colors dark:bg-slate-900 ${
        selected ? 'ring-2 ring-teal-500 dark:ring-teal-400' : 'ring-slate-200 dark:ring-white/10'
      }`}
    >
      <div className="card-body">
        <div className="card-media">
          <ProductThumb product={product} className="card-thumb rounded-xl" onClick={() => onOpen(product)} />
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpen(product)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(product); } }}
          aria-label={t('productDetailsFor', { name: label })}
          className="card-text min-w-0 cursor-pointer rounded-md text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        >
          <p dir="auto" className="line-clamp-2 break-words text-[0.9375rem] font-semibold leading-snug text-slate-900 rtl:text-right dark:text-slate-50" data-testid="row-name">{primary}</p>
          {secondary && <p dir="auto" className="truncate text-[0.8125rem] leading-snug text-slate-500 rtl:text-right dark:text-slate-400">{secondary}</p>}
          {/* Stock is for counting; while ordering it would only be noise (the stock line above the
              cards still shows anything verified low or out). */}
          {mode === 'count' && <StockLabel product={product} className="leading-snug" />}
        </div>
        <div className={mode === 'order' && selected ? 'card-action-inline' : 'card-action'}>
          {mode === 'count' ? (
            <button
              type="button"
              onClick={() => onCount(product)}
              aria-label={t('countFor', { name: label })}
              data-testid="row-count"
              className="inline-flex min-h-11 min-w-11 flex-col items-center justify-center rounded-xl bg-cyan-600 px-2 py-1 text-white shadow-md shadow-black/20 dark:bg-cyan-400 dark:text-slate-950"
            >
              <CalculatorIcon className="h-5 w-5" />
              <span className="text-[0.6875rem] font-bold leading-tight">{t('countShort')}</span>
            </button>
          ) : (
            <CounterStepper quantity={quantity} name={label} onAdd={() => onAdd(product)} onRemove={() => onRemove(product)} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
