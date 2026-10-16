import React, { useState, useSyncExternalStore } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { AlertTriangleIcon, CheckCircleIcon } from './shared/icons';
import { getGuardState, subscribeGuard } from '../utils/storageGuard';
import { readDataKeys } from '../utils/dataRestore';
import { StartupNotice, getRestoreEngine } from '../utils/safetyBootstrap';

const KEY_LABELS: Record<string, 'products' | 'suppliers' | 'order' | 'deliName' | 'stockCountsLabel'> = {
  inventory_stockCounts: 'stockCountsLabel',
  inventory_products: 'products',
  inventory_suppliers: 'suppliers',
  inventory_currentOrder: 'order',
  inventory_deliName: 'deliName',
};

const NOTICE_TEXT: Record<StartupNotice, 'guardRestored' | 'guardUndone' | 'guardRecoveredCompleted' | 'guardRecoveredRolledBack'> = {
  restored: 'guardRestored',
  undone: 'guardUndone',
  'recovered-completed': 'guardRecoveredCompleted',
  'recovered-rolled-back': 'guardRecoveredRolledBack',
};

/**
 * Shown at the top of every screen when saved data needs attention:
 * unreadable data (saving blocked), a restore running in another tab, or the result of a
 * restore/recovery that happened on the last page load.
 */
const StorageStatusBanner: React.FC<{ notice: StartupNotice | null }> = ({ notice }) => {
  const { t } = useTranslation();
  const guard = useSyncExternalStore(subscribeGuard, getGuardState);
  const [noticeVisible, setNoticeVisible] = useState(notice !== null);
  const [confirmingFresh, setConfirmingFresh] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalid = guard.blocked.filter(entry => entry.status === 'invalid');
  const unreadable = guard.blocked.filter(entry => entry.status !== 'changed-elsewhere');
  const changed = guard.blocked.filter(entry => entry.status === 'changed-elsewhere');
  const labelFor = (key: string) => (KEY_LABELS[key] ? t(KEY_LABELS[key]) : key);
  const engine = getRestoreEngine();

  const startFresh = async () => {
    if (!engine) return;
    setWorking(true);
    setError(null);
    try {
      const target = readDataKeys(window.localStorage);
      for (const entry of invalid) target[entry.key] = entry.fallbackText;
      const outcome = await engine.restore(target, 'pre-start-fresh');
      if (outcome.status === 'restored' || outcome.status === 'rollback-failed') {
        window.location.reload();
        return;
      }
      setError(outcome.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setWorking(false);
    setConfirmingFresh(false);
  };

  return (
    <div className="space-y-3 mb-4 empty:hidden" data-testid="storage-status">
      {unreadable.length > 0 && (
        <div role="alert" className="p-4 rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 ring-1 ring-red-500/30 text-sm space-y-2">
          <p className="font-bold flex items-center gap-2">
            <AlertTriangleIcon className="h-5 w-5 flex-shrink-0" />
            <span>{t('guardBlockedTitle')}</span>
          </p>
          <p>{t('guardBlockedBody', { items: unreadable.map(entry => labelFor(entry.key)).join(', ') })}</p>
          <ul className="list-disc ms-5 text-xs">
            {unreadable.flatMap(entry => entry.problems.slice(0, 3).map(problem => <li key={entry.key + problem}>{problem}</li>))}
          </ul>
          <p>{t('guardBlockedActions')}</p>
          <div className="flex flex-wrap gap-2">
            <NavLink to="/manage" className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold">{t('exportTitle')}</NavLink>
            {engine && invalid.length > 0 && !confirmingFresh && (
              <button onClick={() => setConfirmingFresh(true)} className="py-2 px-4 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold">
                {t('guardStartFresh')}
              </button>
            )}
          </div>
          {confirmingFresh && (
            <div className="space-y-2">
              <p className="font-semibold">{t('guardStartFreshConfirm')}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={startFresh} disabled={working} className="py-2 px-4 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50">
                  {working ? t('restoreRunning') : t('restoreConfirmAction')}
                </button>
                <button onClick={() => setConfirmingFresh(false)} disabled={working} className="py-2 px-4 rounded-lg bg-slate-200 dark:bg-slate-700 font-semibold">
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}
          {error && <p className="font-semibold">{t('restoreRefused')} {error}</p>}
        </div>
      )}

      {changed.length > 0 && (
        <div role="alert" className="p-4 rounded-xl bg-amber-400/10 text-amber-800 dark:text-amber-300 ring-1 ring-amber-400/30 text-sm space-y-2">
          <p className="font-bold flex items-center gap-2">
            <AlertTriangleIcon className="h-5 w-5 flex-shrink-0" />
            <span>{t('guardChangedTitle')}</span>
          </p>
          <p>{t('guardChangedBody', { items: changed.map(entry => labelFor(entry.key)).join(', ') })}</p>
          <button onClick={() => window.location.reload()} className="py-2 px-4 rounded-lg bg-brand-primary text-white font-semibold">
            {t('recoveryReload')}
          </button>
        </div>
      )}

      {guard.suspendedReason === 'another-tab' && (
        <p role="status" className="p-4 rounded-xl bg-amber-400/10 text-amber-800 dark:text-amber-300 ring-1 ring-amber-400/30 text-sm font-semibold">
          {t('guardOtherTab')}
        </p>
      )}

      {notice && noticeVisible && (
        <div role="status" className={`p-4 rounded-xl text-sm flex items-start justify-between gap-3 ring-1 ${notice === 'recovered-rolled-back' ? 'bg-amber-400/10 text-amber-800 dark:text-amber-300 ring-amber-400/30' : 'bg-green-500/10 text-green-700 dark:text-green-400 ring-green-500/30'}`}>
          <p className="font-semibold flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
            <span>{t(NOTICE_TEXT[notice])}</span>
          </p>
          <button onClick={() => setNoticeVisible(false)} className="underline flex-shrink-0">{t('dismiss')}</button>
        </div>
      )}
    </div>
  );
};

export default StorageStatusBanner;
