import { useSyncExternalStore } from 'react';
import { BackupLog, readBackupLog, subscribeBackupLog } from '../utils/backupLog';

// The backup log (utils/backupLog.ts), re-read whenever the app records a backup event.
let current: BackupLog | null = null;
subscribeBackupLog(() => {
  current = null;
});
const snapshot = () => (current ??= readBackupLog());

export const useBackupLog = (): BackupLog => useSyncExternalStore(subscribeBackupLog, snapshot, snapshot);
