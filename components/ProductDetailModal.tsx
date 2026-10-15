import React, { useState, useMemo, useEffect } from 'react';
import Modal from './Modal';
import { Product, Supplier } from '../types';
import SupplierChip from './SupplierChip';
import { PlusIcon, AlertTriangleIcon } from './shared/icons';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';

interface ProductDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product;
    supplier: Supplier | undefined;
    onAddToOrder: (productId: string, quantity: number) => void;
    onUpdateStock: (productId: string, newStock: number) => void;
}

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ isOpen, onClose, product, supplier, onAddToOrder, onUpdateStock }) => {
    const { t } = useTranslation();
    const [orderQuantity, setOrderQuantity] = useState(1);
    const [currentStock, setCurrentStock] = useState(product.currentStockUnits);
    const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

    const stockStatus = useMemo(() => {
        if (currentStock <= 0) {
            return {
                level: 'danger',
                message: t('outOfStock'),
                color: 'bg-red-500/10 text-red-600 dark:text-red-400',
                iconColor: 'text-red-500'
            };
        }
        if (currentStock <= product.reorderThresholdUnits) {
            return {
                level: 'warning',
                message: t('lowStock'),
                color: 'bg-amber-400/10 text-amber-600 dark:text-amber-400',
                iconColor: 'text-amber-500'
            };
        }
        return {
            level: 'ok',
            message: t('stockOk'),
            color: 'bg-green-500/10 text-green-600 dark:text-green-400',
            iconColor: 'text-green-500'
        };
    }, [currentStock, product.reorderThresholdUnits, t]);

    useEffect(() => {
        // When stock is low or out, default order quantity to 1 case
        if (stockStatus.level === 'danger' || stockStatus.level === 'warning') {
            setOrderQuantity(1);
        } else {
            setOrderQuantity(1); // Default to 1 anyway
        }
    }, [stockStatus.level]);
    
    useEffect(() => {
        setCurrentStock(product.currentStockUnits);
    }, [product.currentStockUnits]);

    const handleStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newStock = parseInt(e.target.value, 10);
        setCurrentStock(isNaN(newStock) ? 0 : newStock);

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        
        const newTimer = setTimeout(() => {
            onUpdateStock(product.id, isNaN(newStock) ? 0 : newStock);
        }, 500); // 500ms debounce
        
        setDebounceTimer(newTimer);
    };

    const handleAddToOrder = () => {
        if (orderQuantity > 0) {
            onAddToOrder(product.id, orderQuantity);
            onClose(); // Close modal after adding to order
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('productDetailTitle')}>
            <div className="flex flex-col md:flex-row gap-6">
                <div className="md:w-1/3 flex-shrink-0">
                    <img
                        src={product.imageUrl || 'https://placehold.co/400x400/e2e8f0/4a5568?text=No+Image'}
                        alt={`${product.name} ${product.flavor}`}
                        className="w-full h-auto object-cover rounded-lg shadow-md"
                    />
                    {supplier && (
                        <div className="mt-4">
                            <SupplierChip supplier={supplier} />
                        </div>
                    )}
                </div>
                <div className="flex-1 space-y-4">
                    <div>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{product.name}</h3>
                        <p className="text-lg text-brand-muted">{product.flavor}</p>
                    </div>

                    <div className="text-sm text-slate-600 dark:text-slate-400">
                        <p><span className="font-semibold">{t('size')}</span> {product.size}</p>
                        <p><span className="font-semibold">{t('unitsPerCase')}</span> {product.unitsPerCase}</p>
                        <p><span className="font-semibold">{t('reorderAt')}</span> {product.reorderThresholdUnits} units</p>
                    </div>

                    <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800/50">
                        <label htmlFor="currentStock" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                            {t('currentStockUnits')}
                        </label>
                        <input
                            id="currentStock"
                            type="number"
                            value={currentStock}
                            onChange={handleStockChange}
                            className="w-full p-2 border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-brand-primary focus:border-transparent transition"
                        />
                         <div className={`mt-3 p-3 rounded-md text-sm font-semibold flex items-center gap-3 ${stockStatus.color}`}>
                            <AlertTriangleIcon className={`h-6 w-6 flex-shrink-0 ${stockStatus.iconColor}`} />
                            <span>{stockStatus.message}</span>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                      <p className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t('addToOrder')}</p>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-600">
                            <input
                              type="number"
                              value={orderQuantity}
                              onChange={(e) => setOrderQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-20 text-center bg-transparent dark:text-white font-bold focus:outline-none p-2"
                              aria-label={t('itemsPerCase')}
                            />
                             <span className="pe-3 text-sm text-brand-muted">{t('casesUnit')}</span>
                        </div>
                        <motion.button
                          onClick={handleAddToOrder}
                          className="bg-gradient-to-r from-brand-primary to-violet-600 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2 transition-transform w-full justify-center"
                          whileHover={{ scale: 1.05,
                            boxShadow: "0px 10px 20px rgba(79, 70, 229, 0.25)"
                           }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <PlusIcon className="h-5 w-5" />
                          <span>{t('addToOrder')}</span>
                        </motion.button>
                      </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ProductDetailModal;