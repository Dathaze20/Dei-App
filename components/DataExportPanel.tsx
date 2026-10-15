import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { ArrowDownTrayIcon, CheckCircleIcon, ClipboardListIcon, ShareIcon, AlertTriangleIcon } from './shared/icons';
import {
  DataExport,
  createExport,
  exportFileName,
  serializeExport,
  verifyExportText,
} from '../utils/dataExport';

const APP_NAME = 'DeliOrderNYC';
const APP_VERSION = '0.0.0';

interface ExportState {
  exported: DataExport;
  text: string;
  fileName: string;
  verified: boolean;
  problems: string[];
}

const buttonBase = 'flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-60';

/**
 * "Export My Data": a user-initiated, read-only JSON export of everything this origin has in
 * localStorage. Offers three ways out (download, share, copy) plus a selectable text box,
 * because sandboxed previews such as Google AI Studio can block downloads or clipboard access.
 */
const DataExportPanel: React.FC = () => {
  const { t } = useTranslation();
  const [isWorking, setIsWorking] = useState(false);
  const [result, setResult] = useState<ExportState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const handleExport = async () => {
    setIsWorking(true);
    setError(null);
    setStatus(null);
    setIsCopied(false);
    try {
      const storage = window.localStorage;
      const now = new Date();
      const exported = await createExport(storage, {
        now,
        origin: window.location.origin,
        href: window.location.href,
        userAgent: navigator.userAgent,
        appName: APP_NAME,
        appVersion: APP_VERSION,
      });
      const text = serializeExport(exported);
      const verification = await verifyExportText(text, storage);
      setResult({ exported, text, fileName: exportFileName(now), verified: verification.ok, problems: verification.problems });
    } catch (e) {
      setResult(null);
      setError(t('exportFailed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setIsWorking(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    try {
      const url = URL.createObjectURL(new Blob([result.text], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus(t('exportDownloadStarted', { fileName: result.fileName }));
    } catch (e) {
      setStatus(t('exportFailed', { message: e instanceof Error ? e.message : String(e) }));
    }
  };

  const shareFile = (): File | null => {
    if (!result || typeof File === 'undefined') return null;
    return new File([result.text], result.fileName, { type: 'application/json' });
  };

  const canShareFile = (() => {
    const file = shareFile();
    try {
      return !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  })();

  const handleShare = async () => {
    const file = shareFile();
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: result!.fileName });
    } catch (e) {
      // Closing the share sheet is not an error worth showing.
      if (e instanceof Error && e.name === 'AbortError') return;
      setStatus(t('exportFailed', { message: e instanceof Error ? e.message : String(e) }));
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. inside a sandboxed iframe): select the text so a manual copy is one step.
      textRef.current?.focus();
      textRef.current?.select();
      setStatus(t('exportManualCopy'));
    }
  };

  const summary = result?.exported.summary;
  const parseErrorCount = result?.exported.parseErrors.length ?? 0;
  const show = (value: number | null | undefined) => (value ?? 0);

  return (
    <motion.div
      className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{t('exportTitle')}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('exportDescription')}</p>
      <p className="text-xs text-brand-muted mt-2 break-all">{t('exportOriginNote', { origin: window.location.origin })}</p>

      <motion.button
        onClick={handleExport}
        disabled={isWorking}
        className={`${buttonBase} mt-4 w-full sm:w-auto bg-brand-primary hover:bg-brand-primary-hover text-white`}
        whileTap={{ scale: 0.95 }}
      >
        <ArrowDownTrayIcon className="h-5 w-5" />
        <span>{isWorking ? t('exportPreparing') : t('exportButton')}</span>
      </motion.button>

      {error && (
        <p role="alert" className="mt-4 p-3 rounded-md text-sm font-semibold bg-red-500/10 text-red-600 dark:text-red-400">{error}</p>
      )}

      {result && summary && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t('exportSummary', {
              products: show(summary.productCount),
              suppliers: show(summary.supplierCount),
              lines: show(summary.orderLineCount),
              keys: summary.storageKeyCount,
            })}
          </p>

          {result.verified ? (
            <p className="p-3 rounded-md text-sm font-semibold flex items-center gap-2 bg-green-500/10 text-green-700 dark:text-green-400">
              <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{t('exportVerified')}</span>
            </p>
          ) : (
            <div role="alert" className="p-3 rounded-md text-sm font-semibold bg-red-500/10 text-red-600 dark:text-red-400">
              <p>{t('exportVerifyFailed')}</p>
              <ul className="list-disc ms-5 font-normal">
                {result.problems.map(problem => <li key={problem}>{problem}</li>)}
              </ul>
            </div>
          )}

          {parseErrorCount > 0 && (
            <p className="p-3 rounded-md text-sm flex items-center gap-2 bg-amber-400/10 text-amber-700 dark:text-amber-400">
              <AlertTriangleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{t('exportParseWarning', { count: parseErrorCount })}</span>
            </p>
          )}

          <p className="text-xs text-brand-muted">{t('exportUnverifiedNote')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <motion.button onClick={handleDownload} className={`${buttonBase} bg-brand-primary hover:bg-brand-primary-hover text-white`} whileTap={{ scale: 0.95 }}>
              <ArrowDownTrayIcon className="h-5 w-5" />
              <span>{t('downloadFile')}</span>
            </motion.button>
            {canShareFile && (
              <motion.button onClick={handleShare} className={`${buttonBase} bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100`} whileTap={{ scale: 0.95 }}>
                <ShareIcon className="h-5 w-5" />
                <span>{t('shareFile')}</span>
              </motion.button>
            )}
            <motion.button onClick={handleCopy} disabled={isCopied} className={`${buttonBase} bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100`} whileTap={{ scale: 0.95 }}>
              {isCopied ? <CheckCircleIcon className="h-5 w-5 text-green-500" /> : <ClipboardListIcon className="h-5 w-5" />}
              <span>{isCopied ? t('copied') : t('copyText')}</span>
            </motion.button>
          </div>

          {status && <p role="status" className="text-sm text-slate-600 dark:text-slate-300 break-all">{status}</p>}

          <p className="text-xs text-brand-muted">{t('exportManualCopy')}</p>
          <textarea
            ref={textRef}
            readOnly
            value={result.text}
            aria-label={t('exportTitle')}
            className="w-full h-40 p-3 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800/50 focus:outline-none font-mono text-xs"
            dir="ltr"
          />
        </div>
      )}
    </motion.div>
  );
};

export default DataExportPanel;
