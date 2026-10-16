import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKFLOW, isPricedLine, lineUnit, newLineUnit, resolveSupplierWorkflow } from './supplierWorkflow';

describe('supplier workflows', () => {
  it("Boar's Head (sup1) is an item list that is not stock-counted", () => {
    expect(resolveSupplierWorkflow('sup1')).toEqual({ countStock: false, orderStyle: 'items' });
  });

  it('every other built-in supplier, and new ones, are counted and ordered in cases', () => {
    for (const id of ['sup2', 'sup3', 'sup4', 'sup5', 'sup6', 'sup7', 'sup8', 'sup9', 'sup10', 'sup11', 'sup12', 'sup13', 'sup_1700000000000']) {
      expect(resolveSupplierWorkflow(id)).toEqual(DEFAULT_WORKFLOW);
    }
    expect(resolveSupplierWorkflow(undefined)).toEqual(DEFAULT_WORKFLOW);
    expect(DEFAULT_WORKFLOW).toEqual({ countStock: true, orderStyle: 'cases' });
  });

  it('future per-supplier settings can override the defaults without other changes', () => {
    expect(resolveSupplierWorkflow('sup1', { sup1: { orderStyle: 'cases' } })).toEqual({ countStock: false, orderStyle: 'cases' });
    expect(resolveSupplierWorkflow('sup6', { sup6: { countStock: false } })).toEqual({ countStock: false, orderStyle: 'cases' });
  });
});

describe('order line units', () => {
  it('a line without a unit (every line saved before C1) means cases', () => {
    expect(lineUnit({})).toBe('case');
    expect(lineUnit({ unit: undefined })).toBe('case');
    expect(lineUnit({ unit: 'item' })).toBe('item');
  });

  it('new lines use the supplier’s unit', () => {
    expect(newLineUnit(resolveSupplierWorkflow('sup1'))).toBe('item');
    expect(newLineUnit(resolveSupplierWorkflow('sup6'))).toBe('case');
  });

  it("only case lines of case suppliers are priced; Boar's Head lines never are, old or new", () => {
    const boarsHead = resolveSupplierWorkflow('sup1');
    const arizona = resolveSupplierWorkflow('sup6');
    expect(isPricedLine(arizona, {})).toBe(true);
    expect(isPricedLine(arizona, { unit: 'item' })).toBe(false);
    expect(isPricedLine(boarsHead, {})).toBe(false);
    expect(isPricedLine(boarsHead, { unit: 'item' })).toBe(false);
  });
});
