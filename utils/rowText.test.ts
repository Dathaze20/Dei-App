import { describe, expect, it } from 'vitest';
import { rowText, withoutSupplier } from './rowText';

describe('row text', () => {
  it('drops the supplier name from the product line, whole words only', () => {
    expect(withoutSupplier('Arizona RX Energy', 'Arizona')).toBe('RX Energy');
    expect(withoutSupplier('Arizonan Tea', 'Arizona')).toBe('Arizonan Tea');
    expect(withoutSupplier('Arizona', 'Arizona')).toBe('Arizona');
    expect(withoutSupplier("Boar's Head Turkey", "Boar's Head")).toBe('Turkey');
    expect(withoutSupplier('Pepsi', undefined)).toBe('Pepsi');
  });

  it('leads with the flavor and leaves out what the size pill says', () => {
    expect(rowText({ name: 'Arizona RX Energy', flavor: 'Caution Extreme Fruit Punch', size: '11.5 oz. Slim Can' }, 'size', 'Arizona'))
      .toEqual({ primary: 'Caution Extreme Fruit Punch', secondary: 'RX Energy' });
  });

  it("item lists lead with the product, then the kind", () => {
    expect(rowText({ name: 'Deluxe Ham', flavor: 'Sweet', size: 'per lb' }, 'other', "Boar's Head", true)).toEqual({ primary: 'Deluxe Ham', secondary: 'Sweet · per lb' });
  });

  it('leaves out a product line that is only the supplier name', () => {
    expect(rowText({ name: 'Arizona', flavor: 'Green Tea', size: '23 oz. Big Can' }, 'size', 'Arizona')).toEqual({ primary: 'Green Tea', secondary: '' });
  });

  it('in a product-line pill shows the flavor and the size', () => {
    expect(rowText({ name: 'Doritos', flavor: 'Nacho Cheese', size: '1.75 oz' }, 'line', 'Frito-Lay')).toEqual({ primary: 'Nacho Cheese', secondary: '1.75 oz' });
  });

  it('without a flavor shows the name and the size', () => {
    expect(rowText({ name: 'Turkey', flavor: '', size: '' }, 'other', "Boar's Head")).toEqual({ primary: 'Turkey', secondary: '' });
    expect(rowText({ name: 'Mango Drink', flavor: ' ', size: '16 oz' }, 'other')).toEqual({ primary: 'Mango Drink', secondary: '16 oz' });
  });
});
