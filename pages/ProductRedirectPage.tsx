import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';

const ProductRedirectPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (productId) {
      navigate('/', {
        replace: true,
        state: { selectedProductId: productId },
      });
    } else {
        // If no ID, just go home
        navigate('/', { replace: true });
    }
  }, [productId, navigate]);

  return (
    <div className="flex justify-center items-center h-64">
      <p className="text-lg font-semibold animate-pulse">{t('redirecting')}</p>
    </div>
  );
};

export default ProductRedirectPage;