// components/counter/BackupReminder.tsx
//
// A small, dismissible reminder on the Counter screen when no backup has left this phone for a
// week (utils/backupLog.ts): one short line, so it never pushes the products far down. "Back up"
// opens Settings › Backup; × ("Not now") hides it for three days. It never runs a backup itself.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import useInventory from '../../hooks/useInventory';
import { useBackupLog } from '../../hooks/useBackupLog';
import { useTranslation } from '../../hooks/useTranslation';
import { lastBackupOut, shouldRemind, snoozeBackupReminder } from '../../utils/backupLog';
import { useDaysAgo } from '../BackupStatus';
import { ArrowDownTrayIcon, XIcon } from '../shared/icons';

const BackupReminder: React.FC = () => {
  const log = useBackupLog();
  const { products } = useInventory();
  const { t } = useTranslation();
  const ago = useDaysAgo();
  const navigate = useNavigate();
  if (!shouldRemind(log, products.length > 0)) return null;
  const out = lastBackupOut(log);
  return (
    <section
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-white py-1 ps-3 pe-1 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10"
      data-testid="backup-reminder"
      aria-label={t('backupReminderTitle')}
    >
      <ArrowDownTrayIcon className="h-5 w-5 flex-shrink-0 text-cyan-600 dark:text-cyan-300" />
      <p className="min-w-0 flex-1 basis-[10rem] text-sm font-semibold" title={out ? t('backupReminderOld', { when: ago(out.at) }) : t('backupReminderNever')}>
        {out ? t('backupOldShort', { when: ago(out.at) }) : t('backupNeverShort')}
      </p>
      <div className="ms-auto flex items-center">
        <button
          type="button"
          className="min-h-11 rounded-xl px-3 text-sm font-bold text-cyan-700 dark:text-cyan-300"
          onClick={() => navigate('/counter/settings', { state: { section: 'settings-backup' } })}
        >
          {t('backupShort')}
        </button>
        <button type="button" className="inline-flex h-11 w-11 items-center justify-center text-slate-500 dark:text-slate-400" onClick={() => snoozeBackupReminder()} aria-label={t('notNow')}>
          <XIcon className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
};

export default BackupReminder;
