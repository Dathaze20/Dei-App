// components/counter/ClearCountButton.tsx
//
// "Clear count" (v0.1.7): puts one product back to "Not counted" after a confirmation, with Undo
// right after. Not the same as saving 0: 0 is a verified "none on the shelf". The cleared count
// stays in the record (utils/stockCounts.ts, `cleared`) and never comes back as stock.
import React, { useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Product } from '../../types';
import ConfirmSheet from '../ui/ConfirmSheet';
import { ui } from '../ui/styles';
import { useToast } from '../ui/Toast';
import { XIcon } from '../shared/icons';

const ClearCountButton: React.FC<{ product: Product; onCleared?: () => void; className?: string }> = ({ product, onCleared, className = '' }) => {
  const { getStock, clearStockCount, undoClearStockCount } = useInventory();
  const { t } = useTranslation();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (getStock(product).state !== 'verified') return null;
  const name = [product.name, product.flavor].filter(Boolean).join(' ');

  const clear = () => {
    setAsking(false);
    const result = clearStockCount(product.id);
    if ('reason' in result) {
      setError(t('clearCountFailed', { reason: result.reason === 'blocked' ? t('countBlockedReason') : t('countWriteReason') }));
      return;
    }
    setError(null);
    toast(t('countCleared', { name }), { label: t('undo'), run: () => undoClearStockCount(product.id, result.clearedAt) });
    onCleared?.();
  };

  return (
    <>
      <button type="button" className={`${ui.ghost} !min-h-11 !px-2 text-sm text-red-700 dark:text-red-300 ${className}`} onClick={() => setAsking(true)} data-testid="clear-count">
        <XIcon className="h-4 w-4" /> {t('clearCount')}
      </button>
      {error && <p role="alert" className={ui.error}>{error}</p>}
      <ConfirmSheet
        open={asking}
        title={t('clearCountTitle')}
        message={t('clearCountMessage', { name })}
        confirmLabel={t('clearCount')}
        onCancel={() => setAsking(false)}
        onConfirm={clear}
      />
    </>
  );
};

export default ClearCountButton;
