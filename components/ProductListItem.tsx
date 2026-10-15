import React from 'react';
import { Product } from '../types';
import { PlusIcon, MinusIcon, CheckCircleIcon } from './shared/icons';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';

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
  return (
    <motion.div 
      className="flex items-center gap-4 py-4 px-2 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg"
      variants={itemVariants}
      whileHover={{ scale: 1.02 }}
      layout
    >
      <motion.img
        src={product.imageUrl || 'https://placehold.co/100x100/e2e8f0/4a5568?text=N/A'}
        alt={`${product.name} ${product.flavor}`}
        className="w-20 h-20 object-cover rounded-lg flex-shrink-0 bg-slate-200 cursor-pointer"
        loading="lazy"
        onClick={() => onSelect(product)}
        whileHover={{ scale: 1.05 }}
      />
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(product)}>
        <p className="font-bold text-lg text-slate-800 dark:text-slate-100 truncate">{product.name}</p>
        <p className="text-sm text-brand-muted">{product.flavor}</p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {t('unitsInStock', { count: product.currentStockUnits })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <AnimatePresence mode="wait">
          {isInCart ? (
            <motion.div
              key="in-cart"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold text-sm p-3 bg-green-100 dark:bg-green-900/50 rounded-xl"
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
              <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-600">
                <motion.button
                  onClick={() => onQuantityChange(product.id, orderQuantity - 1)}
                  className="p-3 rounded-l-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                  aria-label={t('decreaseQuantity')}
                  disabled={orderQuantity <= 1}
                  whileTap={{ scale: 0.9 }}
                >
                  <MinusIcon className="h-4 w-4" />
                </motion.button>
                <span className="w-10 text-center font-bold text-md select-none">{orderQuantity}</span>
                <motion.button
                  onClick={() => onQuantityChange(product.id, orderQuantity + 1)}
                  className="p-3 rounded-r-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
                  aria-label={t('increaseQuantity')}
                  whileTap={{ scale: 0.9 }}
                >
                  <PlusIcon className="h-4 w-4" />
                </motion.button>
              </div>
              <motion.button
                onClick={() => onAddToOrder(product.id)}
                className="bg-brand-primary hover:bg-brand-primary-hover text-white font-bold p-3 rounded-xl transition-colors shadow-lg shadow-brand-primary/20"
                aria-label={t('addToOrderAria', { quantity: orderQuantity })}
                whileHover={{ scale: 1.1, y: -2, boxShadow: "0px 8px 15px rgba(79, 70, 229, 0.3)" }}
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