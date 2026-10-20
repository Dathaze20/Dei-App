import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useInventory from '../hooks/useInventory';
import { Product, Supplier } from '../types';
import { PlusIcon } from '../components/shared/icons';
import ProductDetailModal from '../components/ProductDetailModal';
import Modal from '../components/Modal';
import SupplierForm from '../components/SupplierForm';
import ProductListItem from '../components/ProductListItem';
import ProductGroup from '../components/ProductGroup';
import { startsCollapsed } from '../utils/productGrouping';
import AnimatedPage from '../components/AnimatedPage';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';

const groupColors = [
  '#3b82f6', // blue-500
  '#16a34a', // green-600
  '#8b5cf6', // violet-500
  '#f97316', // orange-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#f59e0b', // amber-500
];

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};


const HomePage: React.FC = () => {
  const { products, suppliers, currentOrder, addToOrder, getSupplierById, getProductById, addSupplier } = useInventory();
  const { t } = useTranslation();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSupplierModalOpen, setSupplierModalOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const location = useLocation();
  const navigate = useNavigate();

  const itemsInCart = useMemo(() => new Set(currentOrder.items.map(i => i.productId)), [currentOrder.items]);

  const handleQuantityChange = (productId: string, newQuantity: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, newQuantity)
    }));
  };

  const handleAddToOrder = (productId: string) => {
    const quantity = quantities[productId] || 1;
    addToOrder(productId, quantity);
  };

  useEffect(() => {
    const { selectedProductId } = location.state || {};
    if (selectedProductId) {
      const product = getProductById(selectedProductId);
      if (product) {
        setSelectedProduct(product);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, getProductById, navigate]);

  const sortedSuppliers = useMemo(() => {
    return [...suppliers].sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers]);

  const displayedProducts = useMemo(() => {
    const lowercasedQuery = searchQuery.toLowerCase();
    const sourceProducts = searchQuery 
      ? products.filter(p =>
          p.name.toLowerCase().includes(lowercasedQuery) ||
          p.flavor.toLowerCase().includes(lowercasedQuery) ||
          getSupplierById(p.supplierId)?.name.toLowerCase().includes(lowercasedQuery) ||
          p.category.toLowerCase().includes(lowercasedQuery) ||
          (p.upc && p.upc.includes(searchQuery))
        )
      : products.filter(p => p.supplierId === selectedSupplierId);
      
    return sourceProducts.sort((a, b) => a.name.localeCompare(b.name) || a.flavor.localeCompare(b.flavor));
  }, [searchQuery, products, selectedSupplierId, getSupplierById]);

  const groupedProducts = useMemo(() => {
    if (searchQuery) return null;

    const getGroupKey = (product: Product): string => {
        const supplier = getSupplierById(product.supplierId);
        if (supplier?.name === 'Arizona') return product.size;
        if (supplier?.name === "Boar's Head") return product.category;
        if (['Frito-Lay', 'Wise Foods', 'Utz'].includes(supplier?.name || '')) return product.name;
        return product.category || "Other";
    };

    const groups: Record<string, Product[]> = {};
    displayedProducts.forEach(p => {
        const key = getGroupKey(p);
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(p);
    });
    
    return Object.keys(groups).sort((a, b) => a.localeCompare(b)).reduce(
        (obj, key) => { 
            obj[key] = groups[key]; 
            return obj;
        }, 
        {} as Record<string, Product[]>
    );
  }, [displayedProducts, searchQuery, getSupplierById]);


  useEffect(() => {
    if (sortedSuppliers.length > 0 && !selectedSupplierId) {
      setSelectedSupplierId(sortedSuppliers[0].id);
    }
  }, [sortedSuppliers, selectedSupplierId]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
  };
  
  const handleSaveSupplier = (supplierData: Omit<Supplier, 'id'>) => {
    addSupplier(supplierData);
    setSupplierModalOpen(false);
  };

  const renderProductListItems = (productsToList: Product[]) => {
      if (productsToList.length === 0) {
        return (
          <div className="text-center py-16 px-6">
            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300">
              {searchQuery ? t('noProductsMatch', { query: `"${searchQuery}"`}) : t('noProductsForSupplier')}
            </h3>
            <p className="text-brand-muted mt-2">
              {searchQuery ? t('tryAnotherSearch') : t('addProductsOnManagePage')}
            </p>
          </div>
        );
      }
      return (
        <motion.div 
          className="divide-y divide-slate-100 dark:divide-slate-800/50"
          variants={listVariants}
          initial="hidden"
          animate="visible"
        >
          {productsToList.map(product => (
            <ProductListItem
              key={product.id}
              product={product}
              onSelect={handleSelectProduct}
              onAddToOrder={handleAddToOrder}
              orderQuantity={quantities[product.id] || 1}
              onQuantityChange={handleQuantityChange}
              isInCart={itemsInCart.has(product.id)}
            />
          ))}
        </motion.div>
      );
  }

  return (
    <AnimatedPage>
      <div className="lg:flex lg:gap-8">
        {/* Supplier List for Large Screens */}
        <aside className="hidden lg:block lg:w-64 lg:flex-shrink-0">
          <div className="lg:sticky lg:top-24">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3 px-2">{t('suppliers')}</h2>
            <motion.div className="space-y-1" variants={listVariants} initial="hidden" animate="visible">
              {sortedSuppliers.map(supplier => (
                <motion.div key={supplier.id} variants={{ hidden: {opacity: 0, x: -20}, visible: {opacity: 1, x: 0} }}>
                  <button
                    onClick={() => {
                        setSelectedSupplierId(supplier.id);
                        setSearchQuery('');
                    }}
                    className={`w-full text-start px-3 py-2 rounded-md text-sm transition-all duration-200 transform active:scale-98 ${
                      selectedSupplierId === supplier.id && !searchQuery
                        ? 'bg-brand-primary/10 text-brand-primary font-bold border-l-4 border-brand-primary'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {supplier.name}
                  </button>
                </motion.div>
              ))}
            </motion.div>
             <motion.button
                onClick={() => setSupplierModalOpen(true)}
                className="w-full mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-brand-primary hover:bg-brand-primary/10 py-2 px-3 rounded-md transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
            >
                <PlusIcon className="h-5 w-5" />
                <span>{t('newSupplier')}</span>
            </motion.button>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
            <div className="flex gap-2 mb-2 items-center sticky top-below-header z-30 bg-slate-100 dark:bg-slate-950 -mx-3 px-3 py-2 sm:mx-0 sm:px-0">
                <motion.input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (e.target.value) {
                          setSelectedSupplierId('');
                        } else if (sortedSuppliers.length > 0) {
                          setSelectedSupplierId(sortedSuppliers[0].id);
                        }
                    }}
                    placeholder={t('searchPlaceholder')}
                    className="w-full min-w-0 min-h-11 px-4 py-2 border-none ring-1 ring-slate-300 dark:ring-slate-700 rounded-lg bg-white/50 dark:bg-slate-800/50 focus:ring-2 focus:ring-brand-primary focus:outline-none transition-all duration-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm"
                    layoutId="search-bar"
                />
            </div>
            
            <div className="lg:hidden mb-3">
                {/* Supplier capsules scroll sideways inside their own strip; the page itself never does. */}
                <div className="flex items-center gap-2 py-1 -mx-3 px-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none]" data-testid="supplier-capsules">
                    {sortedSuppliers.map(supplier => (
                        <motion.button
                          key={supplier.id}
                          onClick={() => {
                              setSelectedSupplierId(supplier.id);
                              setSearchQuery('');
                          }}
                          className={`flex-shrink-0 min-h-11 px-4 rounded-full font-semibold text-sm whitespace-nowrap transition-colors transform active:scale-95 ${
                            selectedSupplierId === supplier.id && !searchQuery
                              ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/30'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700'
                          }`}
                          whileTap={{ scale: 0.95 }}
                        >
                          {supplier.name}
                        </motion.button>
                    ))}
                    <motion.button
                        onClick={() => setSupplierModalOpen(true)}
                        className="flex-shrink-0 flex items-center justify-center h-11 w-11 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        aria-label={t('newSupplier')}
                        whileTap={{ scale: 0.9 }}
                    >
                        <PlusIcon className="h-5 w-5" />
                    </motion.button>
                </div>
            </div>

            <motion.div
              className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5"
              layout
            >
              {groupedProducts ? (
                <motion.div 
                  className="p-1.5 sm:p-3"
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {Object.entries(groupedProducts).map(([groupName, productsInGroup], index, all) => (
                    <ProductGroup 
                      key={`${selectedSupplierId}:${groupName}`}
                      title={groupName}
                      count={productsInGroup.length}
                      color={groupColors[index % groupColors.length]}
                      defaultOpen={!startsCollapsed({ products: productsInGroup }, all.length)}
                    >
                       {renderProductListItems(productsInGroup)}
                    </ProductGroup>
                  ))}
                  {Object.keys(groupedProducts).length === 0 && renderProductListItems([])}
                </motion.div>
              ) : (
                renderProductListItems(displayedProducts)
              )}
            </motion.div>
        </div>
      </div>
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          supplier={getSupplierById(selectedProduct.supplierId)}
          isOpen={!!selectedProduct}
          onClose={handleCloseModal}
          onAddToOrder={addToOrder}
        />
      )}
      <Modal isOpen={isSupplierModalOpen} onClose={() => setSupplierModalOpen(false)} title={t('newSupplier')}>
        <SupplierForm onSave={handleSaveSupplier} onCancel={() => setSupplierModalOpen(false)} />
      </Modal>
    </AnimatedPage>
  );
};

export default HomePage;