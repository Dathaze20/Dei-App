// utils/backupLog.ts
//
// When this phone last made a backup, and what actually happened to it, for the "Last backup"
// line and the reminder on the Counter screen. It records only what the app can know:
//   generated  the backup file was created (and checked) in the app;
//   saved      Android's "Save to…" screen reported the file saved (confirmed);
//   started    a browser download started (the browser does not say whether it finished);
//   shared     the file was handed to the share sheet (where it went is not reported);
//   copied     the backup text was copied;
//   failed     saving failed.
// A `deliordernyc_sys_` key: never exported, snapshotted or restored, so restoring a backup never
// makes the phone look backed up. Unreadable values are treated as "never".
import { SYSTEM_KEY_PREFIX } from './dataExport';

export const BACKUP_LOG_KEY = `${SYSTEM_KEY_PREFIX}backupLog`;

export type BackupEvent = 'generated' | 'saved' | 'started' | 'shared' | 'copied' | 'failed';

export interface BackupLog {
  /** The newest time of each event, ISO. */
  last: Partial<Record<BackupEvent, string>>;
  /** The reminder is hidden until this time, ISO. */
  snoozedUntil?: string;
}

const EVENTS: BackupEvent[] = ['generated', 'saved', 'started', 'shared', 'copied', 'failed'];
/** Remind after this many days without a backup that left the app. */
export const REMIND_AFTER_DAYS = 7;
/** "Not now" hides the reminder for this many days. */
export const SNOOZE_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

const isDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

export const parseBackupLog = (text: string | null): BackupLog => {
  try {
    const raw = text ? JSON.parse(text) : null;
    const last: BackupLog['last'] = {};
    for (const event of EVENTS) if (isDate(raw?.last?.[event])) last[event] = raw.last[event];
    return { last, ...(isDate(raw?.snoozedUntil) ? { snoozedUntil: raw.snoozedUntil } : {}) };
  } catch {
    return { last: {} };
  }
};

export const readBackupLog = (): BackupLog => {
  try {
    return parseBackupLog(localStorage.getItem(BACKUP_LOG_KEY));
  } catch {
    return { last: {} };
  }
};

const write = (log: BackupLog) => {
  try {
    localStorage.setItem(BACKUP_LOG_KEY, JSON.stringify(log));
  } catch {
    // Best effort: the reminder may show again, which is the safe direction.
  }
  listeners.forEach(listener => listener());
};

export const recordBackupEvent = (event: BackupEvent, now = new Date()) => {
  const log = readBackupLog();
  write({ ...log, last: { ...log.last, [event]: now.toISOString() } });
};

export const snoozeBackupReminder = (now = new Date()) =>
  write({ ...readBackupLog(), snoozedUntil: new Date(now.getTime() + SNOOZE_DAYS * DAY).toISOString() });

/** The newest backup that left the app: saved, started or shared (copying is not counted). */
export const lastBackupOut = (log: BackupLog): { event: 'saved' | 'started' | 'shared'; at: string } | null => {
  const outs = (['saved', 'started', 'shared'] as const).filter(e => log.last[e]).map(event => ({ event, at: log.last[event]! }));
  return outs.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
};

export const daysSince = (iso: string, now = new Date()) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY));

/** Whether to show the reminder: no backup out for REMIND_AFTER_DAYS, not snoozed, and there is data. */
export const shouldRemind = (log: BackupLog, hasData: boolean, now = new Date()): boolean => {
  if (!hasData) return false;
  if (log.snoozedUntil && Date.parse(log.snoozedUntil) > now.getTime()) return false;
  const out = lastBackupOut(log);
  return !out || daysSince(out.at, now) >= REMIND_AFTER_DAYS;
};

const listeners = new Set<() => void>();
export const subscribeBackupLog = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
