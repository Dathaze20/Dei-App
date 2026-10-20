// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAppOwnedKey, isDataKey, isSystemKey } from './dataExport';
import { UI_MODE_KEY, readUiMode, saveUiMode } from './uiMode';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('screen style preference (Classic / Counter)', () => {
  it('is a device-only key: app-owned but never deli data, so never exported, snapshotted or restored', () => {
    expect(UI_MODE_KEY).toBe('deliordernyc_sys_uiMode');
    expect(isAppOwnedKey(UI_MODE_KEY)).toBe(true);
    expect(isSystemKey(UI_MODE_KEY)).toBe(true);
    expect(isDataKey(UI_MODE_KEY)).toBe(false);
  });

  it('defaults to Classic View, and anything unexpected reads as Classic', () => {
    expect(readUiMode()).toBe('classic');
    localStorage.setItem(UI_MODE_KEY, 'something-else');
    expect(readUiMode()).toBe('classic');
  });

  it('remembers Counter and Classic', () => {
    expect(saveUiMode('counter')).toBe(true);
    expect(readUiMode()).toBe('counter');
    expect(saveUiMode('classic')).toBe(true);
    expect(readUiMode()).toBe('classic');
  });

  it('a phone that refuses to save or read falls back to Classic without crashing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(saveUiMode('counter')).toBe(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readUiMode()).toBe('classic');
  });
});
