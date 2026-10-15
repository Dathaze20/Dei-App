import { afterEach, describe, expect, it } from 'vitest';
import { makeStorage } from '../testing/storage';
import {
  areWritesSuspended,
  getGuardState,
  guardedSetItem,
  isKeyBlocked,
  loadGuarded,
  readTracked,
  resetGuardForTests,
  resumeWrites,
  suspendWrites,
} from './storageGuard';

const jsonOptions = (fallback: unknown) => ({
  parse: (text: string) => JSON.parse(text),
  fallback: () => fallback,
  serialize: (value: unknown) => JSON.stringify(value),
});

const SAMPLE = [{ id: 'sample', name: 'Sample', category: '', supplierId: 's', flavor: '', size: '', unitsPerCase: 1, costPrice: 1, retailPrice: 1, reorderThresholdUnits: 0, currentStockUnits: 0 }];

afterEach(() => resetGuardForTests());

describe('loadGuarded', () => {
  it('missing key → sample data, and saving it is allowed (new install, unchanged behaviour)', () => {
    const { storage, dump } = makeStorage();
    const result = loadGuarded('inventory_products', jsonOptions(SAMPLE), storage);
    expect(result.status).toBe('missing');
    expect(result.value).toEqual(SAMPLE);
    expect(guardedSetItem('inventory_products', JSON.stringify(SAMPLE), storage)).toBe(true);
    expect(dump().inventory_products).toBe(JSON.stringify(SAMPLE));
  });

  it('valid key → loaded as stored', () => {
    const real = JSON.stringify([{ ...SAMPLE[0], id: 'real', currentStockUnits: 4 }]);
    const { storage } = makeStorage({ inventory_products: real });
    const result = loadGuarded('inventory_products', jsonOptions(SAMPLE), storage);
    expect(result.status).toBe('ok');
    expect(result.value).toEqual(JSON.parse(real));
    expect(isKeyBlocked('inventory_products')).toBe(false);
  });

  it.each([
    ['inventory_products', '[{"id":"real","name":"Pepsi"'],
    ['inventory_products', JSON.stringify([{ id: 'real', costPrice: 'abc' }])],
    ['inventory_suppliers', '{"not":"a list"}'],
    ['inventory_currentOrder', '{"items":"broken"}'],
  ])('unreadable %s → original bytes kept, key blocked, sample shown in memory', (key, original) => {
    const { storage, dump } = makeStorage({ [key]: original });
    const result = loadGuarded(key, jsonOptions(SAMPLE), storage);
    expect(result.status).toBe('invalid');
    expect(result.value).toEqual(SAMPLE);
    expect(isKeyBlocked(key)).toBe(true);
    // The automatic save that used to overwrite the original is refused…
    expect(guardedSetItem(key, JSON.stringify(SAMPLE), storage)).toBe(false);
    // …so the original bytes are still there, exactly.
    expect(dump()[key]).toBe(original);
    const blocked = getGuardState().blocked.find(entry => entry.key === key)!;
    expect(blocked.problems.length).toBeGreaterThan(0);
    expect(blocked.fallbackText).toBe(JSON.stringify(SAMPLE));
  });

  it('blocking one key does not block the others', () => {
    const { storage, dump } = makeStorage({ inventory_products: '[broken' });
    loadGuarded('inventory_products', jsonOptions(SAMPLE), storage);
    expect(guardedSetItem('inventory_deliName', 'Joe', storage)).toBe(true);
    expect(dump().inventory_deliName).toBe('Joe');
  });

  it('storage that cannot be read → blocked as unavailable, nothing written', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError: access denied');
      },
      setItem: () => {
        throw new Error('should not be called');
      },
    };
    const result = loadGuarded('inventory_products', jsonOptions(SAMPLE), throwing);
    expect(result.status).toBe('unavailable');
    expect(guardedSetItem('inventory_products', '[]', throwing)).toBe(false);
  });
});

describe('guardedSetItem', () => {
  it('refuses every write while writes are suspended (restore running)', () => {
    const { storage, dump } = makeStorage({ inventory_deliName: 'Before' });
    suspendWrites('restore');
    expect(areWritesSuspended()).toBe(true);
    expect(guardedSetItem('inventory_deliName', 'After', storage)).toBe(false);
    expect(dump().inventory_deliName).toBe('Before');
    resumeWrites();
    expect(guardedSetItem('inventory_deliName', 'After', storage)).toBe(true);
  });

  it('does not rewrite a value that is already stored', () => {
    const { storage, faults } = makeStorage({ theme: 'dark' });
    faults.failAllWrites = true; // any real write would throw
    expect(guardedSetItem('theme', 'dark', storage)).toBe(true);
  });

  it('reports a full storage instead of throwing', () => {
    const { storage, faults } = makeStorage();
    faults.failAllWrites = true;
    expect(guardedSetItem('theme', 'dark', storage)).toBe(false);
  });
});

describe('stale-copy protection (another tab or window changed the data)', () => {
  it('a key that was missing at load is not overwritten if something else saved it first', () => {
    const { storage, dump } = makeStorage();
    loadGuarded('inventory_currentOrder', jsonOptions({ items: [] }), storage);
    storage.setItem('inventory_currentOrder', '{"items":[{"productId":"a","quantity":2}],"createdAt":"x"}'); // other tab
    expect(guardedSetItem('inventory_currentOrder', '{"items":[]}', storage)).toBe(false);
    expect(dump().inventory_currentOrder).toBe('{"items":[{"productId":"a","quantity":2}],"createdAt":"x"}');
    expect(getGuardState().blocked).toEqual([
      expect.objectContaining({ key: 'inventory_currentOrder', status: 'changed-elsewhere' }),
    ]);
  });

  it('a loaded key changed by another tab is not overwritten with this page’s stale copy', () => {
    const { storage, dump } = makeStorage({ inventory_deliName: 'Old' });
    loadGuarded('inventory_deliName', { parse: (t: string) => t, fallback: () => 'x', serialize: (v: string) => v }, storage);
    storage.setItem('inventory_deliName', 'Changed in tab B');
    expect(guardedSetItem('inventory_deliName', 'Edited in tab A', storage)).toBe(false);
    expect(dump().inventory_deliName).toBe('Changed in tab B');
  });

  it('this page’s own successive saves keep working', () => {
    const { storage, dump } = makeStorage({ inventory_deliName: 'One' });
    loadGuarded('inventory_deliName', { parse: (t: string) => t, fallback: () => 'x', serialize: (v: string) => v }, storage);
    expect(guardedSetItem('inventory_deliName', 'Two', storage)).toBe(true);
    expect(guardedSetItem('inventory_deliName', 'Three', storage)).toBe(true);
    expect(dump().inventory_deliName).toBe('Three');
  });

  it('settings read with readTracked are protected too', () => {
    const { storage, dump } = makeStorage({ language: 'es' });
    readTracked('language', storage);
    storage.setItem('language', 'ar');
    expect(guardedSetItem('language', 'en', storage)).toBe(false);
    expect(dump().language).toBe('ar');
  });
});
