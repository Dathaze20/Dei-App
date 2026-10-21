// components/counter/BackupReminder.tsx
//
// A small, dismissible reminder on the Counter screen when no backup has left this phone for a
// week (utils/backupLog.ts). "Back up now" opens Settings › Backup; "Not now" hides it for three
// days. It never runs a backup by itself.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import useInventory from '../../hooks/useInventory';
import { useBackupLog } from '../../hooks/useBackupLog';
import { useTranslation } from '../../hooks/useTranslation';
import { lastBackupOut, shouldRemind, snoozeBackupReminder } from '../../utils/backupLog';
import { useDaysAgo } from '../BackupStatus';
import { ArrowDownTrayIcon } from '../shared/icons';

const BackupReminder: React.FC = () => {
  const log = useBackupLog();
  const { products } = useInventory();
  const { t } = useTranslation();
  const ago = useDaysAgo();
  const navigate = useNavigate();
  if (!shouldRemind(log, products.length > 0)) return null;
  const out = lastBackupOut(log);
  return (
    <section className="rounded-2xl bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10" data-testid="backup-reminder" aria-label={t('backupReminderTitle')}>
      <div className="flex items-start gap-2">
        <ArrowDownTrayIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-600 dark:text-cyan-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{t('backupReminderTitle')}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">{out ? t('backupReminderOld', { when: ago(out.at) }) : t('backupReminderNever')}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button type="button" className="min-h-11 rounded-xl px-3 text-sm font-semibold text-slate-600 dark:text-slate-300" onClick={() => snoozeBackupReminder()}>
          {t('notNow')}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl bg-cyan-600 px-3 text-sm font-bold text-white dark:bg-cyan-400 dark:text-slate-950"
          onClick={() => navigate('/counter/settings', { state: { section: 'settings-backup' } })}
        >
          {t('backupNow')}
        </button>
      </div>
    </section>
  );
};

export default BackupReminder;
