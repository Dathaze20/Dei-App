import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { AlertTriangleIcon, ArrowDownTrayIcon, CheckCircleIcon } from './shared/icons';
import {
  BackupAnalysis,
  ListDiff,
  RestoreDiff,
  RestoreOutcome,
  analyzeBackup,
  diffRestore,
  readDataKeys,
  readLastRestore,
} from '../utils/dataRestore';
import { SnapshotPurpose, SnapshotRecord } from '../utils/safetyStore';
import { getRestoreEngine, getRestoreEngineError, setStartupNotice } from '../utils/safetyBootstrap';
import { downloadTextFile, snapshotFileName } from '../utils/fileDownload';

const buttonBase = 'flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50';
const primary = `${buttonBase} bg-brand-primary hover:bg-brand-primary-hover text-white`;
const secondary = `${buttonBase} bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100`;
const MAX_LISTED = 8;

const PURPOSE_KEYS: Record<SnapshotPurpose, 'snapshotPurposePreRestore' | 'snapshotPurposePreUndo' | 'snapshotPurposePreStartFresh'> = {
  'pre-restore': 'snapshotPurposePreRestore',
  'pre-undo': 'snapshotPurposePreUndo',
  'pre-start-fresh': 'snapshotPurposePreStartFresh',
};

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '?');

/**
 * Restore from Backup (replace only), Undo Last Restore, and the list of recovery snapshots.
 * All the safety logic lives in utils/dataRestore.ts; this component only collects decisions.
 */
const RestorePanel: React.FC = () => {
  const { t } = useTranslation();
  const engine = getRestoreEngine();
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<BackupAnalysis | null>(null);
  const [checking, setChecking] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [countsLossAcknowledged, setCountsLossAcknowledged] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'warning'; text: string } | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [confirmingUndo, setConfirmingUndo] = useState(false);
  const lastRestore = useMemo(() => {
    try {
      return readLastRestore(window.localStorage);
    } catch {
      return null;
    }
  }, [running]);

  const refreshSnapshots = () => {
    engine?.listSnapshots().then(setSnapshots, () => setSnapshots([]));
  };
  useEffect(refreshSnapshots, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The exact deli data on this device when the preview was made, and the comparison shown.
  // The restore is only allowed to run if the data still equals `baseline` (checked by the engine
  // inside its lock, right before the first write).
  const [review, setReview] = useState<{ baseline: Record<string, string>; diff: RestoreDiff } | null>(null);
  const diff = review?.diff ?? null;

  if (!engine) {
    return (
      <section className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 p-4 sm:p-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{t('restoreTitle')}</h2>
        <p role="alert" className="p-3 rounded-md text-sm bg-amber-400/10 text-amber-800 dark:text-amber-300">
          {t('restoreUnavailable', { message: getRestoreEngineError() ?? '' })}
        </p>
      </section>
    );
  }

  const reset = () => {
    setAnalysis(null);
    setReview(null);
    setAcknowledged(false);
    setCountsLossAcknowledged(false);
    setConfirmed(false);
    setMessage(null);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setText(await file.text());
  };

  const handleCheck = async () => {
    reset();
    setChecking(true);
    try {
      const result = await analyzeBackup(text);
      if (result.canRestore) {
        const baseline = readDataKeys(window.localStorage);
        setReview({ baseline, diff: diffRestore(baseline, result.target) });
      }
      setAnalysis(result);
    } catch (e) {
      setMessage({ tone: 'error', text: `${t('restoreRefused')} ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setChecking(false);
    }
  };

  const finish = (outcome: RestoreOutcome, notice: 'restored' | 'undone') => {
    if (outcome.status === 'restored') {
      setStartupNotice(notice);
      window.location.reload();
      return;
    }
    if (outcome.status === 'rollback-failed') {
      window.location.reload(); // the startup check shows the recovery screen
      return;
    }
    setRunning(false);
    refreshSnapshots();
    if (outcome.status === 'refused' && outcome.reason === 'data-changed') {
      // The preview is out of date: throw it away so a new comparison must be reviewed and confirmed.
      reset();
      setMessage({ tone: 'error', text: t('restoreDataChanged') });
      return;
    }
    setMessage(
      outcome.status === 'rolled-back'
        ? { tone: 'warning', text: `${t('restoreRolledBack')} ${outcome.message}` }
        : { tone: 'error', text: `${t('restoreRefused')} ${outcome.message}` },
    );
  };

  const handleRestore = async () => {
    if (!analysis?.canRestore || !review) return;
    setRunning(true);
    setMessage(null);
    finish(await engine.restore(analysis.target, 'pre-restore', { expectedCurrent: review.baseline }), 'restored');
  };

  const handleUndo = async () => {
    setConfirmingUndo(false);
    setRunning(true);
    setMessage(null);
    finish(await engine.undoLastRestore(), 'undone');
  };

  const status = analysis?.verification.status;
  // Restoring a backup without this device's verified stock counts (e.g. any backup made before
  // stock counting existed) removes them, so that needs its own explicit acknowledgement.
  const countsLost = diff?.stockCounts.lost ?? 0;
  const countsUnreadable = diff?.stockCounts.currentUnreadable ?? false;
  const countsAtRisk = countsLost > 0 || countsUnreadable;
  const canSubmit =
    !!analysis?.canRestore &&
    !!review &&
    confirmed &&
    (!analysis.requiresAcknowledgement || acknowledged) &&
    (!countsAtRisk || countsLossAcknowledged) &&
    !running;

  const countLine = (label: string, list: { before: number | null; after: number | null }) =>
    t('restoreCountChange', {
      label,
      before: list.before ?? t('restoreUnreadable'),
      after: list.after ?? t('restoreUnreadable'),
    });

  const renderList = (label: string, list: ListDiff) => (
    <div className="space-y-1">
      <p className="font-semibold">
        {countLine(label, list)}
        {list.added.length > 0 && <span className="font-normal text-brand-muted"> · {t('restoreAdded', { count: list.added.length })}</span>}
        {list.changed.length > 0 && <span className="font-normal text-brand-muted"> · {t('restoreChanged', { count: list.changed.length })}</span>}
      </p>
      {list.removed.length > 0 && (
        <div className="p-2 rounded-md bg-red-500/10 text-red-700 dark:text-red-400">
          <p className="font-semibold">{t('restoreRemovedWarning')}</p>
          <ul className="list-disc ms-5">
            {list.removed.slice(0, MAX_LISTED).map(item => <li key={item.id}>{item.name}</li>)}
          </ul>
          {list.removed.length > MAX_LISTED && <p>{t('restoreAndMore', { count: list.removed.length - MAX_LISTED })}</p>}
        </div>
      )}
      {list.changed.length > 0 && (
        <ul className="list-disc ms-5 text-xs text-slate-600 dark:text-slate-300">
          {list.changed.slice(0, MAX_LISTED).map(item => <li key={item.id}>{item.name}: {item.fields.join(', ')}</li>)}
          {list.changed.length > MAX_LISTED && <li>{t('restoreAndMore', { count: list.changed.length - MAX_LISTED })}</li>}
        </ul>
      )}
    </div>
  );

  const nothingChanges =
    diff &&
    diff.products.added.length + diff.products.removed.length + diff.products.changed.length === 0 &&
    diff.suppliers.added.length + diff.suppliers.removed.length + diff.suppliers.changed.length === 0 &&
    diff.orderLines.before === diff.orderLines.after &&
    diff.settings.length === 0 &&
    diff.otherDataKeys.length === 0 &&
    !diff.stockCounts.changed;

  return (
    <motion.section
      className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 p-4 sm:p-6 space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
    >
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{t('restoreTitle')}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('restoreDescription')}</p>
      </div>

      <div className="space-y-3">
        <label className={`${secondary} cursor-pointer w-full sm:w-auto`}>
          <ArrowDownTrayIcon className="h-5 w-5 rotate-180" />
          <span>{t('restoreChooseFile')}</span>
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            data-testid="restore-file"
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </label>
        <label className="block text-xs text-brand-muted">
          {t('restorePasteLabel')}
          <textarea
            value={text}
            onChange={e => {
              setText(e.target.value);
              reset();
            }}
            dir="ltr"
            className="mt-1 w-full h-24 p-3 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 font-mono text-xs"
          />
        </label>
        <button onClick={handleCheck} disabled={!text.trim() || checking || running} className={`${primary} w-full sm:w-auto`}>
          {checking ? t('restoreChecking') : t('restoreCheck')}
        </button>
      </div>

      {analysis && (
        <div className="space-y-3 text-sm" data-testid="restore-analysis">
          {status === 'verified' && (
            <p className="p-3 rounded-md font-semibold flex items-center gap-2 bg-green-500/10 text-green-700 dark:text-green-400">
              <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{t('restoreStatusVerified')}</span>
            </p>
          )}
          {status === 'unverified' && (
            <div role="alert" className="p-3 rounded-md bg-amber-400/10 text-amber-800 dark:text-amber-300">
              <p className="font-semibold flex items-center gap-2">
                <AlertTriangleIcon className="h-5 w-5 flex-shrink-0" />
                <span>{t('restoreStatusUnverified')}</span>
              </p>
              <ul className="list-disc ms-5">{analysis.verification.warnings.map(w => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          {(status === 'invalid' || analysis.problems.length > 0) && (
            <div role="alert" className="p-3 rounded-md bg-red-500/10 text-red-600 dark:text-red-400">
              <p className="font-semibold">{t('restoreStatusInvalid')}</p>
              <ul className="list-disc ms-5">
                {[...analysis.verification.problems, ...analysis.problems].map(p => <li key={p}>{p}</li>)}
              </ul>
            </div>
          )}

          {analysis.exportedAt && (
            <p className="text-xs text-brand-muted break-all">
              {t('restoreFrom', { origin: analysis.sourceOrigin ?? '?', date: formatDate(analysis.exportedAt) })}
            </p>
          )}

          {analysis.skipped.length > 0 && (
            <div className="p-3 rounded-md bg-slate-100 dark:bg-slate-800/60 text-xs">
              <p>{t('restoreSkipped', { count: analysis.skipped.length })}</p>
              <ul className="font-mono mt-1" dir="ltr">{analysis.skipped.map(s => <li key={s.key} className="break-all">{s.key}</li>)}</ul>
            </div>
          )}

          {diff && (
            <div className="space-y-3" data-testid="restore-diff">
              <h3 className="font-bold text-slate-900 dark:text-white">{t('restoreChangesTitle')}</h3>
              {nothingChanges ? (
                <p>{t('restoreNoChanges')}</p>
              ) : (
                <>
                  {renderList(t('products'), diff.products)}
                  {renderList(t('suppliers'), diff.suppliers)}
                  <p className="font-semibold">{countLine(t('restoreOrderLines'), diff.orderLines)}</p>
                  {diff.stockCounts.changed && (
                    <p className="font-semibold" data-testid="restore-counts-line">
                      {t('restoreCountsLine', { before: diff.stockCounts.before ?? '?', after: diff.stockCounts.after ?? '?' })}
                    </p>
                  )}
                  {[...diff.settings, ...diff.otherDataKeys].map(change => (
                    <p key={change.key} className="text-xs break-all">
                      {t('restoreSettingChange', {
                        name: change.key,
                        before: change.before ?? t('restoreEmptyValue'),
                        after: change.after ?? t('restoreEmptyValue'),
                      })}
                    </p>
                  ))}
                </>
              )}
            </div>
          )}

          {analysis.canRestore && countsAtRisk && diff && (
            <div role="alert" data-testid="restore-counts-loss" className="p-4 rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 ring-2 ring-red-500/50 text-sm font-semibold flex gap-3">
              <AlertTriangleIcon className="h-6 w-6 flex-shrink-0" />
              <div className="space-y-1">
                {countsLost > 0 && <p>{t('restoreCountsLoss', { count: countsLost })}</p>}
                {countsLost > 0 && (
                  <ul className="list-disc ms-5 font-normal">
                    {diff.stockCounts.removed > 0 && <li>{t('restoreCountsRemoved', { count: diff.stockCounts.removed })}</li>}
                    {diff.stockCounts.replacedByOlder > 0 && <li>{t('restoreCountsOlder', { count: diff.stockCounts.replacedByOlder })}</li>}
                    {diff.stockCounts.retiredLost > 0 && <li>{t('restoreCountsRetired', { count: diff.stockCounts.retiredLost })}</li>}
                  </ul>
                )}
                {countsUnreadable && <p>{t('restoreCountsUnreadable')}</p>}
                <p className="font-normal">{t('restoreCountsUndo')}</p>
              </div>
            </div>
          )}

          {analysis.canRestore && (
            <div className="space-y-2">
              {countsAtRisk && (
                <label className="flex items-start gap-3 min-h-[44px] cursor-pointer font-semibold text-red-700 dark:text-red-300">
                  <input type="checkbox" className="h-5 w-5 mt-0.5 flex-shrink-0" checked={countsLossAcknowledged} onChange={e => setCountsLossAcknowledged(e.target.checked)} />
                  <span>{countsLost > 0 ? t('restoreAckCountsLoss', { count: countsLost }) : t('restoreAckCountsUnreadable')}</span>
                </label>
              )}
              {analysis.requiresAcknowledgement && (
                <label className="flex items-start gap-3 min-h-[44px] cursor-pointer font-semibold text-amber-800 dark:text-amber-300">
                  <input type="checkbox" className="h-5 w-5 mt-0.5 flex-shrink-0" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
                  <span>{t('restoreAckUnverified')}</span>
                </label>
              )}
              <label className="flex items-start gap-3 min-h-[44px] cursor-pointer font-semibold">
                <input type="checkbox" className="h-5 w-5 mt-0.5 flex-shrink-0" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
                <span>{t('restoreConfirm')}</span>
              </label>
              <button onClick={handleRestore} disabled={!canSubmit} className={`${buttonBase} w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white`}>
                {running ? t('restoreRunning') : t('restoreButton')}
              </button>
            </div>
          )}
        </div>
      )}

      {message && (
        <p
          role="alert"
          className={`p-3 rounded-md text-sm font-semibold ${message.tone === 'error' ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-amber-400/10 text-amber-800 dark:text-amber-300'}`}
        >
          {message.text}
        </p>
      )}

      {lastRestore && (
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <h3 className="font-bold text-slate-900 dark:text-white">{t('restoreUndoTitle')}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('restoreUndoDescription', { date: formatDate(lastRestore.restoredAt) })}</p>
          {confirmingUndo ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={handleUndo} disabled={running} className={`${buttonBase} bg-red-600 hover:bg-red-700 text-white`}>{t('restoreConfirmAction')}</button>
              <button onClick={() => setConfirmingUndo(false)} className={secondary}>{t('cancel')}</button>
            </div>
          ) : (
            <button onClick={() => setConfirmingUndo(true)} disabled={running} className={secondary}>{t('restoreUndoButton')}</button>
          )}
        </div>
      )}

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <h3 className="font-bold text-slate-900 dark:text-white">{t('snapshotsTitle')}</h3>
        <p className="text-xs text-brand-muted">{t('snapshotsDescription')}</p>
        {snapshots.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('snapshotsEmpty')}</p>
        ) : (
          <ul className="space-y-2" data-testid="snapshot-list">
            {snapshots.map(snapshot => (
              <li key={snapshot.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {t(PURPOSE_KEYS[snapshot.purpose])} · {formatDate(snapshot.createdAt)}
                  <span className="text-brand-muted"> · {Math.ceil(snapshot.byteLength / 1024)} KB</span>
                </span>
                <button
                  onClick={() => downloadTextFile(snapshotFileName(snapshot.purpose, snapshot.createdAt), snapshot.exportText)}
                  className={`${secondary} py-2 flex-shrink-0`}
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  <span>{t('snapshotDownload')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.section>
  );
};

export default RestorePanel;
