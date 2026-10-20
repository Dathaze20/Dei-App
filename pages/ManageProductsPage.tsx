import React, { useState, useEffect } from 'react';
import useInventory from '../hooks/useInventory';
import { Product, Supplier } from '../types';
import Modal from '../components/Modal';
import { PlusIcon, TrashIcon, PencilIcon, QrCodeIcon } from '../components/shared/icons';
import SupplierChip from '../components/SupplierChip';
import SupplierForm from '../components/SupplierForm';
import ShelfTagModal from '../components/ShelfTagModal';
import DataExportPanel from '../components/DataExportPanel';
import RestorePanel from '../components/RestorePanel';
import AppUpdatePanel from '../components/AppUpdatePanel';
import ScreenStylePanel from '../components/ScreenStylePanel';
import { isAndroidApp } from '../utils/nativeApp';
import StockLabel from '../components/StockLabel';
import ProductGroup from '../components/ProductGroup';
import ProductThumb from '../components/ProductThumb';
import AnimatedPage from '../components/AnimatedPage';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';

const emptyProduct: Omit<Product, 'id' | 'currentStockUnits'> = {
  name: '', category: '', supplierId: '', flavor: '', size: '', unitsPerCase: 1, costPrice: 0, retailPrice: 0, imageUrl: '', reorderThresholdUnits: 0, upc: '',
};

const groupColors = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ef4444', '#f59e0b', '#14b8a6'];

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};


const ManageProductsPage: React.FC = () => {
  const { products, suppliers, addProduct, updateProduct, deleteProduct, getSupplierById, addSupplier, deliName, updateDeliName, getWorkflow } = useInventory();
  const { t } = useTranslation();
  const [isModalOpen, setModalOpen] = useState(false);
  const [isSupplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [tagProduct, setTagProduct] = useState<Product | null>(null);
  const [localDeliName, setLocalDeliName] = useState(deliName);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = (product: Product) => {
    const result = deleteProduct(product.id);
    if ('reason' in result) {
      const reason = result.reason === 'counts-unavailable' ? t('deleteBlockedUnavailable') : t('deleteBlockedWrite');
      setDeleteError(t('deleteBlocked', { name: [product.name, product.flavor].filter(Boolean).join(' '), reason }));
    } else {
      setDeleteError(null);
    }
  };

  useEffect(() => {
    setLocalDeliName(deliName);
  }, [deliName]);
  
  const handleDeliNameSave = () => {
    updateDeliName(localDeliName);
  }

  const handleOpenModal = (product?: Partial<Product>) => {
    setEditingProduct(product || emptyProduct);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingProduct(null);
    setModalOpen(false);
  };
  
  const handleOpenTagModal = (product: Product) => {
    setTagProduct(product);
  };

  const handleSaveProduct = (productData: Partial<Product>) => {
    if (productData.id) {
      const originalProduct = products.find(p => p.id === productData.id);
      if (originalProduct) {
        const updatedFullProduct: Product = { ...originalProduct, ...productData };
        updateProduct(updatedFullProduct);
      }
    } else {
      addProduct(productData as Omit<Product, 'id' | 'currentStockUnits'>);
    }
    handleCloseModal();
  };

  const handleSaveSupplier = (supplierData: Omit<Supplier, 'id'>) => {
    addSupplier(supplierData);
    setSupplierModalOpen(false);
  }
  
  const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));
  // Phones list products per supplier (suppliers by name; products keep the order above).
  const productsBySupplier = [...suppliers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(supplier => ({ supplierId: supplier.id, name: supplier.name, items: sortedProducts.filter(p => p.supplierId === supplier.id) }))
    .filter(section => section.items.length > 0);
  // Products whose supplier no longer exists are still listed, never hidden.
  const orphans = sortedProducts.filter(p => !suppliers.some(s => s.id === p.supplierId));
  if (orphans.length > 0) productsBySupplier.push({ supplierId: '__none__', name: t('otherProducts'), items: orphans });

  return (
    <AnimatedPage>
      <div className="space-y-8">
      <motion.div 
        className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 p-3 sm:p-6"
        initial={{ opacity: 0, y:20 }}
        animate={{ opacity: 1, y:0 }}
        transition={{ delay: 0.1 }}
      >
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('storeSettings')}</h2>
          <div className="space-y-4 max-w-md">
            <div>
              <label htmlFor="deliName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('deliName')}
              </label>
              <input
                type="text"
                name="deliName"
                id="deliName"
                value={localDeliName}
                onChange={(e) => setLocalDeliName(e.target.value)}
                className="mt-1 block w-full min-h-11 rounded-md border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 shadow-sm focus:border-brand-primary focus:ring-2 focus:ring-brand-primary sm:text-sm px-3 transition"
                placeholder={t('placeholderDeliName')}
              />
            </div>
            <div className="text-end">
              <motion.button
                onClick={handleDeliNameSave}
                className="bg-brand-primary hover:bg-brand-primary-hover text-white font-bold min-h-11 px-4 rounded-lg transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {t('saveName')}
              </motion.button>
            </div>
          </div>
      </motion.div>

      <ScreenStylePanel current="classic" />

      {isAndroidApp() && <AppUpdatePanel />}

      <DataExportPanel />

      <RestorePanel />

      <motion.div 
        className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 p-3 sm:p-6"
        initial={{ opacity: 0, y:20 }}
        animate={{ opacity: 1, y:0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('manageProducts')}</h1>
          <div className="flex gap-2">
              <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={() => handleOpenModal()} className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white font-bold min-h-11 px-4 rounded-lg transition-colors">
                <PlusIcon className="h-5 w-5" />
                <span>{t('newProduct')}</span>
              </motion.button>
          </div>
        </div>

        {deleteError && (
          <p role="alert" data-testid="delete-error" className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-700 dark:text-red-300 ring-1 ring-red-500/30 text-sm font-semibold">
            {deleteError}
          </p>
        )}

        {/* Phones: one collapsible section per supplier (closed at first) with compact rows, so the
            page is not a single list of every product. Every product, field and action is kept. */}
        <div className="md:hidden space-y-2">
          {productsBySupplier.map(({ supplierId, name, items }, index) => (
            <ProductGroup key={supplierId} title={name} count={items.length} color={groupColors[index % groupColors.length]} defaultOpen={false}>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {items.map(product => (
                  <div key={product.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 px-1" data-testid="manage-product">
                    <div className="flex min-w-0 flex-1 basis-44 items-center gap-3">
                      <ProductThumb product={product} alt="" className="w-12 h-12 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <p dir="auto" className="rtl:text-right truncate font-bold leading-snug text-slate-800 dark:text-slate-100">{product.name}</p>
                        <p dir="auto" className="rtl:text-right line-clamp-2 break-words text-sm leading-snug text-slate-600 dark:text-slate-300">{product.flavor}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-600 dark:text-slate-300">
                          <span>{getWorkflow(product.supplierId).countStock ? <StockLabel product={product} /> : '—'}</span>
                          <span className="font-mono break-all">UPC {product.upc || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="ms-auto flex flex-shrink-0 items-center gap-1">
                      <motion.button whileTap={{scale:0.9}} onClick={() => handleOpenTagModal(product)} aria-label={t('shelfTag')} className="inline-flex h-11 w-11 items-center justify-center text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-slate-700 rounded-full transition-colors"><QrCodeIcon className="h-5 w-5" /></motion.button>
                      <motion.button whileTap={{scale:0.9}} onClick={() => handleOpenModal(product)} aria-label={t('editProduct')} className="inline-flex h-11 w-11 items-center justify-center text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-slate-700 rounded-full transition-colors"><PencilIcon className="h-5 w-5" /></motion.button>
                      <motion.button whileTap={{scale:0.9}} onClick={() => handleDelete(product)} aria-label={t('deleteProduct')} className="inline-flex h-11 w-11 items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-slate-700 rounded-full transition-colors"><TrashIcon className="h-5 w-5"/></motion.button>
                    </div>
                  </div>
                ))}
              </div>
            </ProductGroup>
          ))}
        </div>
        
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-start">
            <thead className="bg-slate-50/70 dark:bg-slate-800/50">
              <tr>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 text-start">Product</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 text-start">Supplier</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 text-start">Stock / Threshold</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 text-start">UPC</th>
                <th className="p-4 font-semibold text-slate-600 dark:text-slate-300 text-start">Actions</th>
              </tr>
            </thead>
            <motion.tbody className="divide-y divide-slate-200 dark:divide-slate-800" variants={listVariants} initial="hidden" animate="visible">
              {sortedProducts.map(product => {
                  const supplier = getSupplierById(product.supplierId);
                  return (
                      <motion.tr key={product.id} variants={itemVariants} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-4">
                              <div className="flex items-center gap-4">
                                <img src={product.imageUrl || 'https://placehold.co/400x400/e2e8f0/4a5568?text=No+Image'} alt="" className="w-12 h-12 object-cover rounded-md flex-shrink-0 bg-slate-200" />
                                <div>
                                  <p className="font-bold">{product.name}</p>
                                  <p className="text-sm text-brand-muted">{product.flavor} / {product.size}</p>
                                </div>
                              </div>
                          </td>
                          <td className="p-4">{supplier ? <SupplierChip supplier={supplier} /> : 'N/A'}</td>
                          <td className="p-4 font-medium">{getWorkflow(product.supplierId).countStock ? <StockLabel product={product} /> : '—'}</td>
                          <td className="p-4 font-mono text-xs text-slate-500">{product.upc || '-'}</td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              <motion.button whileTap={{scale:0.9}} whileHover={{scale:1.1}} onClick={() => handleOpenTagModal(product)} className="p-2.5 text-green-600 hover:text-green-800 hover:bg-green-100 dark:hover:bg-green-100/10 rounded-full transition-colors"><QrCodeIcon className="h-5 w-5" /></motion.button>
                              <motion.button whileTap={{scale:0.9}} whileHover={{scale:1.1}} onClick={() => handleOpenModal(product)} className="p-2.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 dark:hover:bg-blue-100/10 rounded-full transition-colors"><PencilIcon className="h-5 w-5" /></motion.button>
                              <motion.button whileTap={{scale:0.9}} whileHover={{scale:1.1}} onClick={() => handleDelete(product)} className="p-2.5 text-red-600 hover:text-red-800 hover:bg-red-100 dark:hover:bg-red-100/10 rounded-full transition-colors"><TrashIcon className="h-5 w-5"/></motion.button>
                            </div>
                          </td>
                      </motion.tr>
                  )
              })}
            </motion.tbody>
          </table>
        </div>
      </motion.div>

      <motion.div 
        className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 p-3 sm:p-6"
        initial={{ opacity: 0, y:20 }}
        animate={{ opacity: 1, y:0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('manageSuppliers')}</h2>
            <motion.button whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={() => setSupplierModalOpen(true)} className="flex items-center gap-2 bg-brand-secondary hover:bg-brand-secondary-hover text-white font-bold min-h-11 px-4 rounded-lg transition-colors">
                <PlusIcon className="h-5 w-5" />
                <span>{t('newSupplier')}</span>
            </motion.button>
        </div>
        <div className="flex flex-wrap gap-3">
            {suppliers.map(supplier => (
                <div key={supplier.id} className="flex items-center gap-4 p-2 pe-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <SupplierChip supplier={supplier} />
                </div>
            ))}
        </div>
      </motion.div>

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingProduct?.id ? t('editProduct') : t('newProduct')}>
        {editingProduct && <ProductForm product={editingProduct} suppliers={suppliers} onSave={handleSaveProduct} onCancel={handleCloseModal} />}
      </Modal>

      <Modal isOpen={isSupplierModalOpen} onClose={() => setSupplierModalOpen(false)} title={t('newSupplier')}>
        <SupplierForm onSave={handleSaveSupplier} onCancel={() => setSupplierModalOpen(false)} />
      </Modal>
      
      {tagProduct && (
        <ShelfTagModal product={tagProduct} isOpen={!!tagProduct} onClose={() => setTagProduct(null)} />
      )}
    </div>
    </AnimatedPage>
  );
};

// --- ProductForm Component ---
interface ProductFormProps { product: Partial<Product>; suppliers: Supplier[]; onSave: (product: Partial<Product>) => void; onCancel: () => void; }
const ProductForm: React.FC<ProductFormProps> = ({ product: initialProduct, suppliers, onSave, onCancel }) => {
    const { t } = useTranslation();
    const [product, setProduct] = useState(initialProduct);
    useEffect(() => { setProduct(initialProduct); }, [initialProduct]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
            const parsedValue = parseFloat(value);
            // If parsing fails (e.g., empty string), default to 0 to avoid NaN issues.
            setProduct(prev => ({ ...prev, [name]: isNaN(parsedValue) ? 0 : parsedValue }));
        } else {
            setProduct(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(product); };
    
    const inputStyle = "min-w-0 min-h-11 px-3 py-2 border rounded-lg bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all duration-300 ease-in-out"

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input name="name" value={product.name || ''} onChange={handleChange} placeholder={t('productName')} className={inputStyle} required />
                <input name="flavor" value={product.flavor || ''} onChange={handleChange} placeholder={t('flavorVariant')} className={inputStyle} />
                <input name="category" value={product.category || ''} onChange={handleChange} placeholder={t('category')} className={inputStyle} />
                <select name="supplierId" value={product.supplierId || ''} onChange={handleChange} className={inputStyle} required>
                    <option value="" disabled>{t('selectSupplier')}</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input name="size" value={product.size || ''} onChange={handleChange} placeholder={t('sizeExample')} className={inputStyle} />
                <input name="unitsPerCase" value={product.unitsPerCase || 1} type="number" onChange={handleChange} placeholder={t('itemsPerCase')} className={inputStyle} />
                <input name="reorderThresholdUnits" value={product.reorderThresholdUnits || 0} type="number" onChange={handleChange} placeholder={t('reorderThreshold')} className={inputStyle} />
                <input name="costPrice" value={product.costPrice || 0} type="number" step="0.01" onChange={handleChange} placeholder={t('costPrice')} className={inputStyle} />
                <div className="sm:col-span-2"><input name="retailPrice" value={product.retailPrice || 0} type="number" step="0.01" onChange={handleChange} placeholder={t('retailPrice')} className={`${inputStyle} w-full`} /></div>
                <div className="sm:col-span-2"><input name="upc" value={product.upc || ''} onChange={handleChange} placeholder={t('upcOptional')} className={`${inputStyle} w-full`} /></div>
                <div className="sm:col-span-2"><input name="imageUrl" value={product.imageUrl || ''} onChange={handleChange} placeholder={t('imageUrlOptional')} className={`${inputStyle} w-full`} /></div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={onCancel} className="min-h-11 px-4 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 font-semibold active:scale-98">{t('cancel')}</button>
                <button type="submit" className="min-h-11 px-4 rounded-lg bg-brand-primary text-white hover:bg-brand-primary-hover font-semibold active:scale-98">{t('saveProduct')}</button>
            </div>
        </form>
    );
};

export default ManageProductsPage;