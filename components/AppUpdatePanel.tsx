// components/AppUpdatePanel.tsx
//
// "Check for updates" (Android app only). Checks only when the button is pressed, downloads only
// when "Download & install" is pressed, and installation always goes through Android's own
// installer, which asks the person to confirm. Nothing is ever installed silently.
// Saved data is not touched: an update keeps the app's storage because the application ID,
// signing key and WebView origin stay the same (docs/ANDROID.md).

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { AvailableUpdate, UpdateCheck, checkForUpdate } from '../utils/appUpdate';
import { AppInfo, DeliNative, NativeErrorCode, isAndroidApp } from '../utils/nativeApp';
import { ArrowDownTrayIcon, CheckCircleIcon, AlertTriangleIcon } from './shared/icons';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'result'; check: UpdateCheck }
  | { kind: 'downloading'; update: AvailableUpdate; percent: number | null }
  | { kind: 'needs-permission'; update: AvailableUpdate }
  | { kind: 'ready'; update: AvailableUpdate }
  | { kind: 'failed'; update: AvailableUpdate; code: NativeErrorCode | 'unknown' };

const errorCode = (e: unknown): NativeErrorCode | 'unknown' => {
  const code = (e as { code?: unknown })?.code;
  return typeof code === 'string' ? (code as NativeErrorCode) : 'unknown';
};

const AppUpdatePanel: React.FC = () => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const android = isAndroidApp();

  useEffect(() => {
    if (!android) return;
    DeliNative.getAppInfo().then(setInfo).catch(() => setInfo(null));
  }, [android]);

  if (!android) return null;

  const check = async () => {
    if (!info) return;
    setPhase({ kind: 'checking' });
    setPhase({ kind: 'result', check: await checkForUpdate(info.versionCode) });
  };

  const install = async (update: AvailableUpdate) => {
    try {
      await DeliNative.installUpdate();
      setPhase({ kind: 'ready', update });
    } catch (e) {
      const code = errorCode(e);
      setPhase(code === 'needs-permission' ? { kind: 'needs-permission', update } : { kind: 'failed', update, code });
    }
  };

  const downloadAndInstall = async (update: AvailableUpdate) => {
    setPhase({ kind: 'downloading', update, percent: null });
    const listener = await DeliNative.addListener('updateProgress', ({ received, total }) => {
      setPhase({ kind: 'downloading', update, percent: total > 0 ? Math.floor((received * 100) / total) : null });
    });
    try {
      await DeliNative.downloadUpdate({ url: update.apkUrl, sha256: update.sha256, versionCode: update.versionCode });
    } catch (e) {
      setPhase({ kind: 'failed', update, code: errorCode(e) });
      return;
    } finally {
      await listener.remove();
    }
    const { allowed } = await DeliNative.canInstallUpdates();
    if (!allowed) setPhase({ kind: 'needs-permission', update });
    else await install(update);
  };

  const button = 'inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-lg font-bold transition-colors';
  const primary = `${button} bg-brand-primary hover:bg-brand-primary-hover text-white disabled:opacity-60`;
  const secondary = `${button} bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100`;

  const updateDetails = (update: AvailableUpdate) => (
    <div className="space-y-2">
      <p className="font-semibold text-slate-900 dark:text-white">{t('updateAvailable', { version: update.version })}</p>
      {update.notes && (
        <pre className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg p-3 max-h-48 overflow-y-auto font-sans">
          {update.notes}
        </pre>
      )}
    </div>
  );

  const message = (text: string, tone: 'ok' | 'warn') => (
    <p className={`flex items-start gap-2 text-sm ${tone === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`} role="status">
      {tone === 'ok' ? <CheckCircleIcon className="h-5 w-5 shrink-0" /> : <AlertTriangleIcon className="h-5 w-5 shrink-0" />}
      <span>{text}</span>
    </p>
  );

  const resultView = (result: UpdateCheck) => {
    switch (result.state) {
      case 'up-to-date':
        return message(t('updateUpToDate'), 'ok');
      case 'no-release':
        return message(t('updateNoRelease'), 'ok');
      case 'offline':
        return message(t('updateOffline'), 'warn');
      case 'error':
        return message(t(result.reason === 'rate-limited' ? 'updateRateLimited' : 'updateCheckFailed'), 'warn');
      case 'available':
        return (
          <div className="space-y-3">
            {updateDetails(result.update)}
            <button className={primary} onClick={() => downloadAndInstall(result.update)}>
              <ArrowDownTrayIcon className="h-5 w-5" /> {t('updateDownloadInstall')}
            </button>
          </div>
        );
    }
  };

  return (
    <motion.div
      className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 p-4 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      data-testid="app-update-panel"
    >
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{t('updateTitle')}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        {info ? t('updateInstalledVersion', { version: info.versionName }) : t('updateVersionUnknown')}
      </p>
      <div className="space-y-3">
        {(phase.kind === 'idle' || phase.kind === 'checking' || phase.kind === 'result') && (
          <button className={secondary} onClick={check} disabled={!info || phase.kind === 'checking'}>
            {phase.kind === 'checking' ? t('updateChecking') : t('updateCheck')}
          </button>
        )}
        {phase.kind === 'result' && resultView(phase.check)}
        {phase.kind === 'downloading' && (
          <>
            {updateDetails(phase.update)}
            <p className="text-sm text-slate-700 dark:text-slate-300" role="status">
              {phase.percent === null ? t('updateDownloading') : t('updateDownloadingPercent', { percent: phase.percent })}
            </p>
          </>
        )}
        {phase.kind === 'needs-permission' && (
          <>
            {message(t('updateNeedsPermission'), 'warn')}
            <div className="flex flex-wrap gap-2">
              <button className={secondary} onClick={() => DeliNative.openInstallPermissionSettings()}>{t('updateOpenSettings')}</button>
              <button className={primary} onClick={() => install(phase.update)}>{t('updateInstallNow')}</button>
            </div>
          </>
        )}
        {phase.kind === 'ready' && message(t('updateInstallerOpened'), 'ok')}
        {phase.kind === 'failed' && (
          <>
            {message(t(phase.code === 'signature-mismatch' ? 'updateWrongSignature' : phase.code === 'checksum-mismatch' || phase.code === 'invalid-apk' || phase.code === 'not-approved' ? 'updateRejected' : 'updateDownloadFailed'), 'warn')}
            <button className={secondary} onClick={() => downloadAndInstall(phase.update)}>{t('updateTryAgain')}</button>
          </>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('updateDataSafe')}</p>
      </div>
    </motion.div>
  );
};

export default AppUpdatePanel;
