import { describe, expect, it } from 'vitest';
import {
  MAX_PHOTOS_PER_CHECK, RETENTION_DAYS, closed, confirmableItems, isExpired, isShelfCheck, matchProductByCode,
  newShelfCheck, withItem, withItemChange, withPhoto, withoutPhoto,
} from './shelfCheck';

const now = new Date('2026-10-21T12:00:00Z');

describe('shelf checks (observations)', () => {
  it('photos are added up to the limit and can be removed', () => {
    let check = newShelfCheck('sup6', now);
    for (let i = 0; i < MAX_PHOTOS_PER_CHECK + 3; i++) check = withPhoto(check, `img${i}`, now);
    expect(check.imageIds).toHaveLength(MAX_PHOTOS_PER_CHECK);
    expect(withoutPhoto(check, 'img0', now).imageIds).not.toContain('img0');
  });

  it('visible (seen in photos) and total (confirmed) are separate; only rows with a product and a total are saved', () => {
    let check = withItem(newShelfCheck('sup6', now), { productId: 'az_fp', source: 'owner', visible: 6 }, now);
    check = withItem(check, { productId: 'az_fp', source: 'barcode' }, now); // same product: not added twice
    check = withItem(check, { productId: null, source: 'owner' }, now);
    expect(check.items).toHaveLength(2);
    const [fp, unknown] = check.items;
    expect(fp).toMatchObject({ visible: 6, total: null });
    expect(confirmableItems(check)).toEqual([]); // a visible estimate is never a count
    check = withItemChange(check, fp.id, 'total', 14, now);
    check = withItemChange(check, unknown.id, 'total', 3, now); // no product chosen yet
    expect(confirmableItems(check).map(i => [i.productId, i.total])).toEqual([['az_fp', 14]]);
  });

  it('every correction is recorded; bad numbers become empty, never 0; rejected rows are never saved', () => {
    let check = withItem(newShelfCheck(null, now), { productId: 'a', source: 'barcode', code: '012345678905' }, now);
    const id = check.items[0].id;
    check = withItemChange(check, id, 'total', 5, now);
    check = withItemChange(check, id, 'total', -1, now);
    check = withItemChange(check, id, 'productId', 'b', now);
    expect(check.items[0]).toMatchObject({ total: null, productId: 'b', source: 'barcode', code: '012345678905' });
    expect(check.items[0].changes.map(c => [c.field, c.from, c.to])).toEqual([['total', null, 5], ['total', 5, null], ['productId', 'a', 'b']]);
    check = withItemChange(withItemChange(check, id, 'total', 5, now), id, 'state', 'rejected', now);
    expect(confirmableItems(check)).toEqual([]);
  });

  it('saved or discarded checks expire after the retention period; drafts never do', () => {
    const draft = newShelfCheck(null, now);
    const done = closed(draft, 'confirmed', [{ productId: 'a', units: 3, countedAt: now.toISOString() }], now);
    const later = new Date(now.getTime() + (RETENTION_DAYS + 1) * 86_400_000);
    expect(isExpired(draft, later)).toBe(false);
    expect(isExpired(done, now)).toBe(false);
    expect(isExpired(done, later)).toBe(true);
    expect(done.confirmed).toHaveLength(1);
    expect(isShelfCheck(done)).toBe(true);
    expect(isShelfCheck({ id: 'x' })).toBe(false);
  });

  it('barcodes match a product UPC, with or without leading zeros (UPC-A in EAN-13 form)', () => {
    const products = [{ id: 'p1', upc: '012345678905' }, { id: 'p2' }];
    expect(matchProductByCode('0012345678905', products)?.id).toBe('p1');
    expect(matchProductByCode('12345678905', products)?.id).toBe('p1');
    expect(matchProductByCode('999', products)).toBeNull();
  });
});
