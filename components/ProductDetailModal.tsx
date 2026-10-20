import React, { useState } from 'react';
import Modal from './Modal';
import { Product, Supplier } from '../types';
import SupplierChip from './SupplierChip';
import { PlusIcon } from './shared/icons';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import useInventory from '../hooks/useInventory';
import StockCountPanel from './StockCountPanel';
import ProductThumb from './ProductThumb';

interface ProductDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product;
    supplier: Supplier | undefined;
    onAddToOrder: (productId: string, quantity: number) => void;
}

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ isOpen, onClose, product, supplier, onAddToOrder }) => {
    const { t } = useTranslation();
    const { getWorkflow } = useInventory();
    const workflow = getWorkflow(product.supplierId);
    const [orderQuantity, setOrderQuantity] = useState(1);
    const handleAddToOrder = () => {
        if (orderQuantity > 0) {
            onAddToOrder(product.id, orderQuantity);
            onClose(); // Close modal after adding to order
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('productDetailTitle')}>
            {/* Phones: small picture beside the name, so counting and ordering are near the top.
                Wider screens: large picture in its own column, as before. */}
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-4">
                <ProductThumb product={product} className="w-24 h-24 md:w-full md:h-auto md:aspect-square md:row-span-2 rounded-lg shadow-md" />
                <div className="min-w-0 space-y-2">
                    <div>
                        <h3 dir="auto" className="rtl:text-right break-words text-xl md:text-2xl font-bold leading-tight text-slate-900 dark:text-white">{product.name}</h3>
                        <p dir="auto" className="rtl:text-right break-words text-base md:text-lg text-brand-muted">{product.flavor}</p>
                    </div>
                    {supplier && <div className="flex"><SupplierChip supplier={supplier} /></div>}
                </div>
                <div className="col-span-2 md:col-span-1 min-w-0 space-y-4">
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                        <p><span className="font-semibold">{t('size')}</span> {product.size}</p>
                        {workflow.orderStyle === 'cases' && (
                            <p><span className="font-semibold">{t('unitsPerCase')}</span> {product.unitsPerCase}</p>
                        )}
                        {workflow.countStock && (
                            <p><span className="font-semibold">{t('reorderAt')}</span> {product.reorderThresholdUnits} units</p>
                        )}
                    </div>

                    <StockCountPanel product={product} />
                    
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                      <p className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t('addToOrder')}</p>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-shrink-0 items-center rounded-lg border border-slate-300 dark:border-slate-600">
                            <input
                              type="number"
                              value={orderQuantity}
                              onChange={(e) => setOrderQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-16 h-11 text-center bg-transparent dark:text-white font-bold focus:outline-none"
                              aria-label={workflow.orderStyle === 'items' ? t('itemsUnit') : t('casesUnit')}
                            />
                             <span className="pe-3 text-sm text-brand-muted">{workflow.orderStyle === 'items' ? t('itemsUnit') : t('casesUnit')}</span>
                        </div>
                        <motion.button
                          onClick={handleAddToOrder}
                          className="bg-gradient-to-r from-brand-primary to-violet-600 text-white font-bold min-h-11 px-4 rounded-lg flex items-center gap-2 transition-transform w-full justify-center"
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