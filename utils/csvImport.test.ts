import { describe, expect, it } from 'vitest';
import { Product, Supplier } from '../types';
import { resolveSupplierWorkflow } from './supplierWorkflow';
import { CSV_TEMPLATE, parseCsv, planImport } from './csvImport';

const suppliers: Supplier[] = [
  { id: 'sup1', name: "Boar's Head", color: '' },
  { id: 'sup4', name: 'Frito-Lay', color: '' },
  { id: 'sup12', name: 'Fruit Guy', color: '' },
];
const existing = [
  { id: 'fl_doritos', name: 'Doritos', flavor: 'Nacho Cheese', size: '1.75 oz', supplierId: 'sup4', upc: '028400090858' },
] as Product[];
const plan = (text: string) => planImport(text, existing, suppliers, resolveSupplierWorkflow);

describe('CSV bulk import', () => {
  it('parses quotes, commas, doubled quotes and line breaks inside quotes', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"multi\nline",z\n\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['multi\nline', 'z']]);
  });

  it('needs a header with name and supplier', () => {
    expect(plan('')).toEqual({ ok: false, error: 'empty' });
    expect(plan('foo,bar\n1,2')).toEqual({ ok: false, error: 'no-header' });
    expect(plan(CSV_TEMPLATE)).toEqual({ ok: true, rows: [], unknownColumns: [] });
  });

  it('flags missing required fields and never makes up a price', () => {
    const result = plan('Name,Supplier,Units Per Case,Case Cost\nRuffles Original,Frito-Lay,64,\n,Frito-Lay,1,2\nApples,Nobody,1,1');
    if (!result.ok) throw new Error('plan failed');
    expect(result.rows.map(r => [r.status, r.problems])).toEqual([
      ['invalid', ['missing-cost']],
      ['invalid', ['missing-name']],
      ['invalid', ['unknown-supplier']],
    ]);
  });

  it('finds existing products and duplicates in the file; existing products are never changed', () => {
    const result = plan(
      'name,supplier,flavor,size,units_per_case,case_cost,upc\n' +
        'Doritos,Frito-Lay,Nacho Cheese,1.75 oz,64,40,\n' +
        'Other name,Frito-Lay,,,64,40,028400090858\n' +
        'Ruffles,frito-lay,Original,1 oz,64,38.50,028400000001\n' +
        'Ruffles,Frito-Lay,Original,1 oz,64,38.50,\n',
    );
    if (!result.ok) throw new Error('plan failed');
    expect(result.rows.map(r => r.status)).toEqual(['exists', 'exists', 'ready', 'duplicate']);
    expect(result.rows[0].matchId).toBe('fl_doritos');
    expect(result.rows[2].product).toEqual({
      name: 'Ruffles', flavor: 'Original', size: '1 oz', category: '', supplierId: 'sup4',
      unitsPerCase: 64, costPrice: 38.5, retailPrice: 0, reorderThresholdUnits: 0, upc: '028400000001',
    });
  });

  it('item-list suppliers need no price; unsafe picture addresses are dropped with a warning', () => {
    const result = plan('name,supplier,image_url,upc,reorder_at\nPastrami,Boar\'s Head,javascript:alert(1),,\nBananas,Fruit Guy,https://example.com/b.jpg,12AB,x');
    if (!result.ok) throw new Error('plan failed');
    expect(result.rows[0]).toMatchObject({ status: 'ready', warnings: ['image-dropped'] });
    expect(result.rows[0].product).toMatchObject({ unitsPerCase: 1, costPrice: 0 });
    expect(result.rows[0].product).not.toHaveProperty('imageUrl');
    expect(result.rows[1].problems).toEqual(expect.arrayContaining(['missing-units', 'missing-cost', 'bad-upc', 'bad-reorder']));
  });
});
