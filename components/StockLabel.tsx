import React from 'react';
import { Product } from '../types';
import useInventory from '../hooks/useInventory';
import { useTranslation } from '../hooks/useTranslation';
import { stockWarning } from '../utils/stockCounts';

/** Short dates in the app's language, with Western digits so numbers read the same in Arabic. */
export const formatCountDate = (iso: string, language: string, withTime = false): string => {
  const locale = language === 'ar' ? 'ar-u-nu-latn' : language === 'es' ? 'es-US' : 'en-US';
  const date = new Date(iso);
  return withTime
    ? date.toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
};

/**
 * One line describing a product's stock: a verified count with its date, "Not counted · old: N"
 * for numbers nobody has verified, or a notice when saved counts cannot be read. Products of
 * suppliers that are not stock-counted (Boar's Head) show nothing.
 */
const StockLabel: React.FC<{ product: Product; className?: string }> = ({ product, className = '' }) => {
  const { getStock } = useInventory();
  const { t, language } = useTranslation();
  const view = getStock(product);
  if (view.state === 'not-tracked') return null;
  if (view.state === 'verified') {
    const warning = stockWarning(view, product);
    const tone =
      warning === 'out' ? 'text-red-600 dark:text-red-400' : warning === 'low' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300';
    return (
      <p className={`text-xs font-semibold ${tone} ${className}`} data-testid="stock-label" data-stock-state="verified">
        {t('countedInStock', { count: view.units, date: formatCountDate(view.countedAt, language) })}
      </p>
    );
  }
  if (view.state === 'unavailable') {
    return (
      <p className={`text-xs font-semibold text-red-600 dark:text-red-400 ${className}`} data-testid="stock-label" data-stock-state="unavailable">
        {t('countsUnavailable')}
      </p>
    );
  }
  return (
    <p className={`text-xs text-slate-400 dark:text-slate-500 ${className}`} data-testid="stock-label" data-stock-state="unverified">
      {t('notCountedOld', { count: view.legacyUnits })}
    </p>
  );
};

export default StockLabel;
