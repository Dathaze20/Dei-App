// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_LOG_KEY, REMIND_AFTER_DAYS, daysSince, lastBackupOut, parseBackupLog, readBackupLog, recordBackupEvent, shouldRemind, snoozeBackupReminder } from './backupLog';

const now = new Date('2026-10-21T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

afterEach(() => localStorage.clear());

describe('backup reminder', () => {
  it('reads only valid dates and treats anything unreadable as never', () => {
    expect(parseBackupLog(null)).toEqual({ last: {} });
    expect(parseBackupLog('nope')).toEqual({ last: {} });
    expect(parseBackupLog('{"last":{"saved":"bad","started":"2026-10-01T00:00:00Z","x":"2026-10-01"}}')).toEqual({ last: { started: '2026-10-01T00:00:00Z' } });
  });

  it('only a backup that left the app counts: saved, download started or shared, never just created or copied', () => {
    recordBackupEvent('generated', daysAgo(1));
    recordBackupEvent('copied', daysAgo(1));
    expect(lastBackupOut(readBackupLog())).toBeNull();
    expect(shouldRemind(readBackupLog(), true, now)).toBe(true);
    recordBackupEvent('saved', daysAgo(2));
    recordBackupEvent('shared', daysAgo(1));
    expect(lastBackupOut(readBackupLog())).toEqual({ event: 'shared', at: daysAgo(1).toISOString() });
    expect(shouldRemind(readBackupLog(), true, now)).toBe(false);
  });

  it('reminds after a week, not when there is no data, and Not now hides it for three days', () => {
    recordBackupEvent('saved', daysAgo(REMIND_AFTER_DAYS));
    expect(daysSince(readBackupLog().last.saved!, now)).toBe(REMIND_AFTER_DAYS);
    expect(shouldRemind(readBackupLog(), true, now)).toBe(true);
    expect(shouldRemind(readBackupLog(), false, now)).toBe(false);
    snoozeBackupReminder(now);
    expect(shouldRemind(readBackupLog(), true, now)).toBe(false);
    expect(shouldRemind(readBackupLog(), true, new Date(now.getTime() + 3 * 86_400_000 + 1))).toBe(true);
    expect(localStorage.getItem(BACKUP_LOG_KEY)).toContain('snoozedUntil');
  });
});
