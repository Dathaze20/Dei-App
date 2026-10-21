// components/BackupStatus.tsx
//
// What the app knows about this phone's last backup (utils/backupLog.ts), in plain words: saved
// (confirmed by Android), download started (not confirmed), sent to the share menu (not
// confirmed), or never. A failure newer than the last success is shown too.
import React from 'react';
import { useBackupLog } from '../hooks/useBackupLog';
import { useTranslation } from '../hooks/useTranslation';
import { daysSince, lastBackupOut } from '../utils/backupLog';

export const useDaysAgo = () => {
  const { t } = useTranslation();
  return (iso: string) => {
    const days = daysSince(iso);
    return days === 0 ? t('daysAgoToday') : days === 1 ? t('daysAgoOne') : t('daysAgoMany', { days });
  };
};

const BackupStatus: React.FC<{ className?: string }> = ({ className = '' }) => {
  const log = useBackupLog();
  const { t } = useTranslation();
  const ago = useDaysAgo();
  const out = lastBackupOut(log);
  const failed = log.last.failed && (!out || Date.parse(log.last.failed) > Date.parse(out.at)) ? log.last.failed : null;
  const generated = log.last.generated && (!out || Date.parse(log.last.generated) > Date.parse(out.at)) && !log.last.copied ? log.last.generated : null;
  const line = !out
    ? t('backupNeverSaved')
    : t(out.event === 'saved' ? 'backupLastSaved' : out.event === 'started' ? 'backupLastStarted' : 'backupLastShared', { when: ago(out.at) });
  return (
    <div className={`space-y-0.5 text-sm ${className}`} data-testid="backup-status">
      <p className={out && out.event === 'saved' ? 'text-slate-700 dark:text-slate-200' : 'text-amber-800 dark:text-amber-300'}>{line}</p>
      {failed && <p className="text-red-700 dark:text-red-300">{t('backupLastFailed', { when: ago(failed) })}</p>}
      {!failed && generated && <p className="text-slate-500 dark:text-slate-400">{t('backupGeneratedNotSaved', { when: ago(generated) })}</p>}
    </div>
  );
};

export default BackupStatus;
