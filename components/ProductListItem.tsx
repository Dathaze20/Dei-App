import React from 'react';
import { Product } from '../types';
import { PlusIcon, MinusIcon, CheckCircleIcon } from './shared/icons';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import useInventory from '../hooks/useInventory';
import StockLabel from './StockLabel';
import ProductThumb from './ProductThumb';

interface ProductListItemProps {
  product: Product;
  onSelect: (product: Product) => void;
  onAddToOrder: (productId: string) => void;
  orderQuantity: number;
  onQuantityChange: (productId: string, newQuantity: number) => void;
  isInCart: boolean;
}

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 100 } },
};


const ProductListItem: React.FC<ProductListItemProps> = ({
  product,
  onSelect,
  onAddToOrder,
  orderQuantity,
  onQuantityChange,
  isInCart,
}) => {
  const { t } = useTranslation();
  const { getWorkflow } = useInventory();
  const ordersItems = getWorkflow(product.supplierId).orderStyle === 'items';
  // One compact row: picture, name, flavor and stock on the left; quantity controls on the right.
  // When the screen is narrow or the text is large, the controls move under the name instead of
  // pushing the row wider than the screen. Every button stays at least 44x44.
  return (
    <motion.div 
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 px-1 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg"
      variants={itemVariants}
      layout
      data-testid="product-row"
    >
      <div className="flex min-w-0 flex-1 basis-40 items-center gap-3">
        <ProductThumb product={product} className="w-14 h-14 rounded-lg" onClick={() => onSelect(product)} />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(product)}>
          <p dir="auto" className="rtl:text-right truncate text-[0.9375rem] leading-snug font-bold text-slate-800 dark:text-slate-100">{product.name}</p>
          <p dir="auto" className="rtl:text-right line-clamp-2 break-words text-sm leading-snug text-slate-600 dark:text-slate-300">{product.flavor}</p>
          <div className="flex items-center gap-2 mt-0.5 text-xs">
            <StockLabel product={product} />
          </div>
        </div>
      </div>

      <div className="ms-auto flex items-center gap-2 flex-shrink-0">
        <AnimatePresence mode="wait">
          {isInCart ? (
            <motion.div
              key="in-cart"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="flex min-h-11 items-center gap-1.5 text-green-700 dark:text-green-400 font-semibold text-sm px-3 bg-green-100 dark:bg-green-900/50 rounded-xl"
            >
              <CheckCircleIcon className="h-5 w-5" />
              <span>{t('inOrder')}</span>
            </motion.div>
          ) : (
            <motion.div
              key="add-to-cart"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="flex items-center gap-2"
            >
              <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-600" dir="ltr">
                <motion.button
                  onClick={() => onQuantityChange(product.id, orderQuantity - 1)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-l-xl transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                  aria-label={t('decreaseQuantity')}
                  disabled={orderQuantity <= 1}
                  whileTap={{ scale: 0.9 }}
                >
                  <MinusIcon className="h-4 w-4" />
                </motion.button>
                <span className="min-w-7 text-center font-bold select-none">{orderQuantity}</span>
                <motion.button
                  onClick={() => onQuantityChange(product.id, orderQuantity + 1)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-r-xl transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
                  aria-label={t('increaseQuantity')}
                  whileTap={{ scale: 0.9 }}
                >
                  <PlusIcon className="h-4 w-4" />
                </motion.button>
              </div>
              <motion.button
                onClick={() => onAddToOrder(product.id)}
                className="inline-flex h-11 w-11 items-center justify-center bg-brand-primary hover:bg-brand-primary-hover text-white font-bold rounded-xl transition-colors shadow-md shadow-brand-primary/20"
                aria-label={ordersItems ? t('addItemsAria', { quantity: orderQuantity }) : t('addToOrderAria', { quantity: orderQuantity })}
                whileTap={{ scale: 0.95 }}
              >
                <PlusIcon className="h-5 w-5" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ProductListItem;