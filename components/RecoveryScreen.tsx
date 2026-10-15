import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { AlertTriangleIcon, ArrowDownTrayIcon } from './shared/icons';
import { createExport, serializeExport } from '../utils/dataExport';
import { APP_NAME, APP_VERSION, BootState, getRestoreEngine } from '../utils/safetyBootstrap';
import { downloadTextFile, snapshotFileName } from '../utils/fileDownload';

type Blocked = Extract<BootState, { kind: 'blocked' }>;

const button = 'flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 w-full';

/** Builds a normal, restorable export file from a set of key/value pairs. */
const exportFromRecord = async (record: Record<string, string>) => {
  const keys = Object.keys(record);
  const storage = { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => record[k] ?? null };
  return serializeExport(
    await createExport(storage, {
      now: new Date(),
      origin: window.location.origin,
      href: window.location.href,
      userAgent: navigator.userAgent,
      appName: APP_NAME,
      appVersion: APP_VERSION,
    }),
  );
};

/**
 * Replaces the whole app when a restore could not be completed AND could not be rolled back
 * (or when an interrupted restore cannot be checked). The app's screens are not mounted, so
 * nothing can save; every recovery file stays available for download.
 */
const RecoveryScreen: React.FC<{ state: Blocked }> = ({ state }) => {
  const { t } = useTranslation();
  const engine = getRestoreEngine();
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const downloadSnapshot = async () => {
    if (state.reason !== 'rollback-failed' || !engine) return;
    const snapshot = (await engine.listSnapshots()).find(s => s.id === state.snapshotId);
    if (snapshot) downloadTextFile(snapshotFileName(snapshot.purpose, snapshot.createdAt), snapshot.exportText);
    else setStatus('The safety snapshot could not be found.');
  };

  const downloadTarget = async () => {
    const journal = await engine?.getJournal();
    if (journal) downloadTextFile(snapshotFileName('restore-target', journal.startedAt), await exportFromRecord(journal.target));
    else setStatus('The restore journal could not be read.');
  };

  const retry = async () => {
    if (!engine) return;
    setWorking(true);
    const outcome = await engine.retryRollback().catch(e => ({ status: 'error' as const, message: String(e) }));
    if (outcome.status === 'rolled-back' || outcome.status === 'none') {
      window.location.reload();
      return;
    }
    setStatus('message' in outcome ? outcome.message : null);
    setWorking(false);
  };

  return (
    <div className="min-h-screen p-4 flex items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
      <div role="alert" className="max-w-lg w-full space-y-4 bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 ring-1 ring-red-500/30">
        <h1 className="text-2xl font-extrabold flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangleIcon className="h-7 w-7 flex-shrink-0" />
          <span>{t('recoveryTitle')}</span>
        </h1>
        <p>{state.reason === 'rollback-failed' ? t('recoveryBody') : t('recoveryUnavailableBody')}</p>
        <div className="text-xs text-slate-600 dark:text-slate-400">
          <p className="font-semibold">{t('recoveryDetails')}</p>
          <p className="break-words">{state.message}</p>
        </div>
        {state.reason === 'rollback-failed' && (
          <div className="space-y-2">
            <button onClick={downloadSnapshot} className={`${button} bg-brand-primary text-white`}>
              <ArrowDownTrayIcon className="h-5 w-5" />
              <span>{t('recoveryDownloadSnapshot')}</span>
            </button>
            <button onClick={downloadTarget} className={`${button} bg-slate-200 dark:bg-slate-700`}>
              <ArrowDownTrayIcon className="h-5 w-5" />
              <span>{t('recoveryDownloadTarget')}</span>
            </button>
            <button onClick={retry} disabled={working} className={`${button} bg-red-600 text-white`}>{t('recoveryRetry')}</button>
          </div>
        )}
        {state.reason === 'recovery-unavailable' && (
          <button onClick={() => window.location.reload()} className={`${button} bg-brand-primary text-white`}>{t('recoveryReload')}</button>
        )}
        <p className="text-sm font-semibold">{t('recoveryHelp')}</p>
        {status && <p className="text-sm text-red-600 dark:text-red-400">{status}</p>}
      </div>
    </div>
  );
};

export default RecoveryScreen;
