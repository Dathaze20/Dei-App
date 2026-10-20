// components/ProductThumb.tsx
//
// A product's picture at a fixed size. Without a picture, or when it cannot load (offline at the
// counter, a dead link), a tidy placeholder with the product's initial is shown instead of the
// browser's broken-image text, which used to spill out of the box on phones.
import React, { useState } from 'react';
import { Product } from '../types';

interface ProductThumbProps {
  product: Pick<Product, 'name' | 'flavor' | 'imageUrl'>;
  /** Tailwind size and shape classes, e.g. "w-14 h-14 rounded-lg". */
  className: string;
  onClick?: () => void;
  alt?: string;
}

const ProductThumb: React.FC<ProductThumbProps> = ({ product, className, onClick, alt }) => {
  const [failed, setFailed] = useState(false);
  const label = alt ?? `${product.name} ${product.flavor}`.trim();
  const base = `${className} flex-shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-700 ${onClick ? 'cursor-pointer' : ''}`;

  if (!product.imageUrl || failed) {
    return (
      <div
        role={label ? 'img' : undefined}
        aria-label={label || undefined}
        className={`${base} flex items-center justify-center text-lg font-bold text-slate-500 dark:text-slate-300 select-none`}
        onClick={onClick}
        data-testid="product-thumb-placeholder"
      >
        {product.name.trim().charAt(0).toUpperCase() || '?'}
      </div>
    );
  }
  return (
    <img
      src={product.imageUrl}
      alt={label}
      className={`${base} object-cover`}
      loading="lazy"
      onClick={onClick}
      onError={() => setFailed(true)}
    />
  );
};

export default ProductThumb;
