import React, { useEffect, useState } from 'react';
import { Product } from '../types';
import useInventory from '../hooks/useInventory';
import { useTranslation } from '../hooks/useTranslation';
import { parseCountInput, stockWarning } from '../utils/stockCounts';
import { AlertTriangleIcon } from './shared/icons';
import { formatCountDate } from './StockLabel';

/**
 * Classic View stock counting. Saves only when "Save count" is pressed, only whole numbers,
 * and says "saved" only after the count is really stored. An old, unverified number can be used
 * as the count only after confirming it was physically checked.
 */
const StockCountPanel: React.FC<{ product: Product }> = ({ product }) => {
  const { getStock, saveStockCount } = useInventory();
  const { t, language } = useTranslation();
  const view = getStock(product);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmingOld, setConfirmingOld] = useState(false);
  const [physicallyChecked, setPhysicallyChecked] = useState(false);

  useEffect(() => {
    setInput('');
    setMessage(null);
    setConfirmingOld(false);
    setPhysicallyChecked(false);
  }, [product.id]);

  if (view.state === 'not-tracked') return null;

  const save = (units: number | null, source: 'classic' | 'confirmed-legacy') => {
    if (units === null) {
      setMessage({ tone: 'error', text: t('countInvalid') });
      return;
    }
    const result = saveStockCount(product.id, units, source);
    if (!('reason' in result)) {
      setMessage({ tone: 'ok', text: t('countSaved', { count: result.count.units }) });
      setInput('');
      setConfirmingOld(false);
      setPhysicallyChecked(false);
      return;
    }
    const reason =
      result.reason === 'invalid' ? t('countInvalid') : result.reason === 'blocked' ? t('countBlockedReason') : t('countWriteReason');
    setMessage({ tone: 'error', text: t('countNotSaved', { reason }) });
  };

  const warning = stockWarning(view, product);
  const status =
    view.state === 'verified'
      ? warning === 'out'
        ? { text: t('outOfStockCounted'), tone: 'bg-red-500/10 text-red-700 dark:text-red-300' }
        : warning === 'low'
          ? { text: t('lowStockCounted'), tone: 'bg-amber-400/10 text-amber-700 dark:text-amber-300' }
          : { text: t('stockOkCounted'), tone: 'bg-green-500/10 text-green-700 dark:text-green-300' }
      : view.state === 'unavailable'
        ? { text: t('countsUnavailableHelp'), tone: 'bg-red-500/10 text-red-700 dark:text-red-300' }
        : { text: t('notCountedYet', { count: view.legacyUnits }), tone: 'bg-slate-200/70 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200' };

  return (
    <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800/50 space-y-3" data-testid="stock-count-panel">
      <div>
        <label htmlFor="stockCount" className="block text-sm font-bold text-slate-700 dark:text-slate-300">
          {t('stockCountTitle')}
        </label>
        <p className="text-xs text-brand-muted">{t('stockCountHelp')}</p>
      </div>

      {view.state === 'verified' && (
        <div className="text-sm" data-testid="last-counts">
          <p className="font-semibold">{t('lastCounts')}</p>
          <ul className="text-slate-600 dark:text-slate-300">
            {[{ units: view.units, countedAt: view.countedAt }, ...(view.previous ? [view.previous] : [])].map(count => (
              <li key={count.countedAt}>{t('countEntry', { count: count.units, date: formatCountDate(count.countedAt, language, true) })}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={`p-3 rounded-md text-sm font-semibold flex items-center gap-3 ${status.tone}`} data-testid="stock-status">
        <AlertTriangleIcon className="h-6 w-6 flex-shrink-0" />
        <span>{status.text}</span>
      </div>

      <div className="flex gap-2">
        <input
          id="stockCount"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={input}
          onChange={e => {
            setInput(e.target.value);
            setMessage(null);
          }}
          disabled={view.state === 'unavailable'}
          className="flex-1 min-w-0 min-h-[48px] p-2 text-lg border rounded bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-brand-primary focus:border-transparent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => save(parseCountInput(input), 'classic')}
          disabled={view.state === 'unavailable'}
          className="min-h-[48px] px-4 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white font-bold disabled:opacity-50"
        >
          {t('saveCount')}
        </button>
      </div>

      {view.state === 'unverified' && !confirmingOld && (
        <button
          type="button"
          onClick={() => setConfirmingOld(true)}
          className="min-h-[48px] w-full px-4 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold"
        >
          {t('useOldNumber', { count: view.legacyUnits })}
        </button>
      )}
      {view.state === 'unverified' && confirmingOld && (
        <div className="space-y-2 p-3 rounded-md ring-1 ring-amber-500/40 bg-amber-400/10" data-testid="confirm-old-number">
          <label className="flex items-start gap-3 min-h-[48px] cursor-pointer font-semibold text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 mt-0.5 flex-shrink-0"
              checked={physicallyChecked}
              onChange={e => setPhysicallyChecked(e.target.checked)}
            />
            <span>{t('confirmOldNumberCheck', { count: view.legacyUnits })}</span>
          </label>
          <button
            type="button"
            onClick={() => save(view.legacyUnits, 'confirmed-legacy')}
            disabled={!physicallyChecked}
            className="min-h-[48px] w-full px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-50"
          >
            {t('confirmOldNumber', { count: view.legacyUnits })}
          </button>
        </div>
      )}

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`text-sm font-semibold ${message.tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
};

export default StockCountPanel;
