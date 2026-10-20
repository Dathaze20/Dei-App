// components/counter/ProductSheet.tsx
//
// Everything about one product, with the full name (never cut off): picture, supplier, size,
// case size and catalog cost (an estimate), the verified stock, Count, and the product's line in
// the order with − / +. Changes go straight to the one saved order.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Product } from '../../types';
import { lineQuantity } from '../../utils/supplierDraft';
import ProductThumb from '../ProductThumb';
import StockLabel from '../StockLabel';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { CalculatorIcon, MinusIcon, PencilIcon, PlusIcon } from '../shared/icons';

interface ProductSheetProps {
  product: Product | null;
  onClose: () => void;
  onCount: (product: Product) => void;
}

const ProductSheet: React.FC<ProductSheetProps> = ({ product, onClose, onCount }) => {
  const { currentOrder, getSupplierById, getWorkflow, addToOrder, updateOrderItemQuantity } = useInventory();
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!product) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const workflow = getWorkflow(product.supplierId);
  const unit = workflow.orderStyle === 'items' ? 'item' : 'case';
  const quantity = lineQuantity(currentOrder.items, product.id, unit);
  const olderCases = unit === 'item' ? lineQuantity(currentOrder.items, product.id, 'case') : 0;
  const supplier = getSupplierById(product.supplierId);
  const unitLabel = unit === 'item' ? t('itemsUnit') : t('casesUnit');

  const add = () => (quantity > 0 ? updateOrderItemQuantity(product.id, quantity + 1, unit) : addToOrder(product.id, 1));
  const remove = () => updateOrderItemQuantity(product.id, quantity - 1, unit);

  const facts: [string, string][] = [
    [t('supplierLabel'), supplier?.name ?? t('otherProducts')],
    [t('sizeLabel'), product.size || '—'],
  ];
  if (workflow.orderStyle === 'cases') {
    facts.push([t('unitsPerCaseLabel'), String(product.unitsPerCase)]);
    facts.push([t('catalogCostLabel'), t('perCaseEstimate', { price: `$${product.costPrice.toFixed(2)}` })]);
  }
  if (workflow.countStock) facts.push([t('reorderAtLabel'), String(product.reorderThresholdUnits)]);
  if (product.upc) facts.push(['UPC', product.upc]);

  return (
    <Sheet
      open
      onClose={onClose}
      testId="product-sheet"
      title={product.name}
      subtitle={product.flavor}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className={ui.eyebrow}>{t('inTheOrder')}</p>
            <p className="font-semibold" data-testid="product-sheet-quantity">
              {quantity > 0 ? `${quantity} ${unitLabel}` : t('notInOrder')}
            </p>
          </div>
          <div dir="ltr" className="flex flex-shrink-0 items-center rounded-xl bg-slate-100 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
            <button type="button" onClick={remove} disabled={quantity <= 0} aria-label={t('removeOne', { name: product.name })} className="inline-flex h-12 w-12 items-center justify-center disabled:opacity-30">
              <MinusIcon className="h-5 w-5" />
            </button>
            <span className="min-w-8 text-center text-lg font-bold tabular-nums">{quantity}</span>
            <button type="button" onClick={add} aria-label={t('addOne', { name: product.name })} className="inline-flex h-12 w-12 items-center justify-center rounded-e-xl bg-teal-500 text-white dark:bg-teal-400 dark:text-slate-950">
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-4">
          <ProductThumb product={product} className="h-24 w-24 rounded-2xl" />
          <dl className="min-w-0 flex-1 space-y-1 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="flex flex-wrap gap-x-2">
                <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                <dd dir="auto" className="min-w-0 break-words font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {workflow.countStock && (
          <div className={`${ui.card} flex flex-wrap items-center gap-3 p-3`}>
            <div className="min-w-0 flex-1">
              <p className={ui.eyebrow}>{t('stockLabel')}</p>
              <StockLabel product={product} className="text-sm" />
            </div>
            <button type="button" className={ui.primary} onClick={() => onCount(product)} data-testid="open-count">
              <CalculatorIcon className="h-5 w-5" /> {t('countStock')}
            </button>
          </div>
        )}

        {olderCases > 0 && <p className={ui.warn}>{t('olderCasesNote', { quantity: olderCases })}</p>}

        <button
          type="button"
          className={`${ui.ghost} w-full`}
          onClick={() => {
            onClose();
            navigate('/counter/catalog', { state: { edit: product.id } });
          }}
        >
          <PencilIcon className="h-5 w-5" /> {t('editInCatalog')}
        </button>
      </div>
    </Sheet>
  );
};

export default ProductSheet;
