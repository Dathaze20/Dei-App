// components/counter/QuantitySheet.tsx
//
// The quantity adjuster, opened by tapping a selected product's ✓ quantity on the Counter screen:
// large − and + (56 px), the quantity in the product's order unit (cases, or items for item
// suppliers such as Boar's Head), Remove from order (with Undo), and Done. Every change goes
// straight to the one saved order; nothing here counts stock.
import React from 'react';
import { Product } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import ProductThumb from '../ProductThumb';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { MinusIcon, PlusIcon, TrashIcon } from '../shared/icons';

interface QuantitySheetProps {
  product: Product | null;
  quantity: number;
  unitLabel: string;
  onChange: (product: Product, quantity: number) => void;
  onRemove: (product: Product) => void;
  onClose: () => void;
}

const QuantitySheet: React.FC<QuantitySheetProps> = ({ product, quantity, unitLabel, onChange, onRemove, onClose }) => {
  const { t } = useTranslation();
  const name = product ? [product.name, product.flavor].filter(Boolean).join(' ') : '';
  return (
    <Sheet
      open={!!product && quantity > 0}
      onClose={onClose}
      testId="quantity-sheet"
      leading={product && <ProductThumb product={product} className="h-12 w-12 rounded-xl" alt="" />}
      title={product ? product.flavor || product.name : ''}
      subtitle={product && [product.flavor ? product.name : '', product.size].filter(Boolean).join(' · ')}
      footer={
        <button type="button" className={`${ui.primary} w-full`} onClick={onClose} data-testid="quantity-done">
          {t('doneButton')}
        </button>
      }
    >
      {product && (
        <div className="space-y-3">
          <div dir="ltr" className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => (quantity <= 1 ? onRemove(product) : onChange(product, quantity - 1))}
              aria-label={t('removeOne', { name })}
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-slate-100"
              data-testid="quantity-minus"
            >
              <MinusIcon className="h-6 w-6" />
            </button>
            <p className="min-w-[5rem] text-center" aria-live="polite">
              <span className="block text-4xl font-extrabold tabular-nums" data-testid="quantity-value">{quantity}</span>
              <span className="block text-sm font-semibold text-slate-500 dark:text-slate-400">{unitLabel}</span>
            </p>
            <button
              type="button"
              onClick={() => onChange(product, quantity + 1)}
              aria-label={t('addOne', { name })}
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500 text-white dark:bg-teal-400 dark:text-slate-950"
              data-testid="quantity-plus"
            >
              <PlusIcon className="h-6 w-6" />
            </button>
          </div>
          <button type="button" className={`${ui.dangerQuiet} w-full`} onClick={() => onRemove(product)} data-testid="quantity-remove">
            <TrashIcon className="h-5 w-5" /> {t('removeFromOrderButton')}
          </button>
        </div>
      )}
    </Sheet>
  );
};

export default QuantitySheet;
