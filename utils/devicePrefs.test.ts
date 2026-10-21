import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, DEVICE_PREFS_KEY, parsePrefs, quickSuppliers, readPrefs, withSupplierChosen, writePrefs } from './devicePrefs';
import { isSystemKey } from './dataExport';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
});
afterEach(() => store.clear());

describe('device preferences', () => {
  it('are a system key: never exported, snapshotted or restored', () => {
    expect(isSystemKey(DEVICE_PREFS_KEY)).toBe(true);
  });

  it('missing, broken or odd values fall back to the defaults, keeping what is valid', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{nope')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('"text"')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(JSON.stringify({ favorites: ['sup6', 7, 'sup6', ''], recent: 'x', mode: 'count', density: 'huge' }))).toEqual({
      ...DEFAULT_PREFS,
      favorites: ['sup6'],
      mode: 'count',
    });
  });

  it('choosing a supplier remembers it and keeps the four most recent, newest first', () => {
    let prefs = DEFAULT_PREFS;
    for (const id of ['sup1', 'sup2', 'sup3', 'sup4', 'sup5', 'sup2']) prefs = withSupplierChosen(prefs, id);
    expect(prefs.lastSupplier).toBe('sup2');
    expect(prefs.recent).toEqual(['sup2', 'sup5', 'sup4', 'sup3']);
  });

  it('quick suppliers are the recent ones, existing only, never the current one; saved pins are kept but unused', () => {
    const prefs = { ...DEFAULT_PREFS, favorites: ['sup9'], recent: ['sup4', 'sup6', 'gone', 'sup1'] };
    expect(quickSuppliers(prefs, 'sup1', new Set(['sup1', 'sup4', 'sup6', 'sup9']))).toEqual(['sup4', 'sup6']);
    expect(quickSuppliers(prefs, 'sup6', new Set(['sup1', 'sup4', 'sup6']), 1)).toEqual(['sup4']);
    expect(parsePrefs(JSON.stringify(prefs)).favorites).toEqual(['sup9']);
  });

  it('read and write round-trip; a phone that refuses to save does not throw', () => {
    expect(writePrefs({ ...DEFAULT_PREFS, density: 'compact' })).toBe(true);
    expect(readPrefs().density).toBe('compact');
    const original = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => { throw new Error('full'); };
    expect(writePrefs(DEFAULT_PREFS)).toBe(false);
    globalThis.localStorage.setItem = original;
  });
});
