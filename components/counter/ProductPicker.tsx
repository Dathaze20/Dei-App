// components/counter/ProductPicker.tsx
//
// Choosing a product by sight: a search box and the matching products as small picture rows,
// starting with the given supplier's products.
import React, { useMemo, useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Product } from '../../types';
import { compareProducts } from '../../utils/productGrouping';
import ProductThumb from '../ProductThumb';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';

interface ProductPickerProps {
  open: boolean;
  supplierId: string | null;
  title: string;
  onPick: (product: Product) => void;
  onClose: () => void;
}

const ProductPicker: React.FC<ProductPickerProps> = ({ open, supplierId, title, onPick, onClose }) => {
  const { products } = useInventory();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = products.filter(p =>
      search ? [p.name, p.flavor, p.size, p.upc ?? ''].some(f => (f ?? '').toLowerCase().includes(search)) : !supplierId || p.supplierId === supplierId,
    );
    return [...list].sort((a, b) => Number(b.supplierId === supplierId) - Number(a.supplierId === supplierId) || compareProducts(a, b)).slice(0, 80);
  }, [products, search, supplierId]);

  return (
    <Sheet open={open} onClose={() => { setQuery(''); onClose(); }} title={title} testId="product-picker">
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t('searchCatalog')}
        aria-label={t('searchCatalog')}
        className={`${ui.input} mb-2`}
      />
      <ul className="divide-y divide-slate-100 dark:divide-white/5">
        {shown.map(product => (
          <li key={product.id}>
            <button type="button" className="flex min-h-14 w-full items-center gap-3 py-1.5 text-start" onClick={() => { setQuery(''); onPick(product); }} data-testid="picker-product">
              <ProductThumb product={product} alt="" className="h-12 w-12 rounded-lg" />
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block break-words font-semibold leading-snug">{product.flavor || product.name}</span>
                <span dir="auto" className="block truncate text-xs text-slate-500 dark:text-slate-400">{[product.flavor ? product.name : '', product.size].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
};

export default ProductPicker;
