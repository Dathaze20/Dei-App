import { describe, expect, it } from 'vitest';
import { parseCommand } from './parseCommand';

describe('local command reader', () => {
  it('add with several products and number words', () => {
    expect(parseCommand('Put two cases of Arizona Green Tea and one Fruit Punch on my list.')).toEqual({
      type: 'add',
      items: [
        { query: 'arizona green tea', quantity: 2, unitWord: 'case' },
        { query: 'fruit punch', quantity: 1, unitWord: null },
      ],
    });
    expect(parseCommand('add 3 cases of pepsi')).toEqual({ type: 'add', items: [{ query: 'pepsi', quantity: 3, unitWord: 'case' }] });
    expect(parseCommand('add diet pepsi')).toEqual({ type: 'add', items: [{ query: 'diet pepsi', quantity: null, unitWord: null }] });
    expect(parseCommand('Add two cases of Arizona Green Tea, one case of Fruit Punch')).toMatchObject({ type: 'add', items: [{ quantity: 2 }, { quantity: 1, query: 'fruit punch' }] });
  });

  it('Spanish basics', () => {
    expect(parseCommand('añade dos cajas de té verde arizona')).toEqual({ type: 'add', items: [{ query: 'te verde arizona', quantity: 2, unitWord: 'case' }] });
    expect(parseCommand('quita fruit punch')).toMatchObject({ type: 'remove', items: [{ query: 'fruit punch' }] });
  });

  it('remove, including "that one" and "take ... back off"', () => {
    expect(parseCommand('Take the Pepsi back off.')).toEqual({ type: 'remove', items: [{ query: 'the pepsi', quantity: null, unitWord: null }] });
    expect(parseCommand('remove that one')).toEqual({ type: 'remove', items: [{ query: null, quantity: null, unitWord: null }] });
    expect(parseCommand('Remove Fruit Punch')).toMatchObject({ type: 'remove', items: [{ query: 'fruit punch' }] });
  });

  it('set: "make green tea three instead", "change it to 4"', () => {
    expect(parseCommand('Make Green Tea three instead')).toEqual({ type: 'set', items: [{ query: 'green tea', quantity: 3, unitWord: null }] });
    expect(parseCommand('change it to 4')).toEqual({ type: 'set', items: [{ query: null, quantity: 4, unitWord: null }] });
    expect(parseCommand('set diet pepsi to 2 cases')).toMatchObject({ type: 'set', items: [{ query: 'diet pepsi', quantity: 2 }] });
  });

  it('bad quantities are refused, never rounded', () => {
    expect(parseCommand('add 0 cases of pepsi')).toEqual({ type: 'bad-quantity', said: '0' });
    expect(parseCommand('add 1.5 cases of pepsi')).toEqual({ type: 'bad-quantity', said: '1.5' });
    expect(parseCommand('add 5000 pepsi')).toEqual({ type: 'bad-quantity', said: '5000' });
    expect(parseCommand('make pepsi 1000 instead')).toEqual({ type: 'bad-quantity', said: '1000' });
  });

  it('questions and teaching', () => {
    expect(parseCommand("What do we need for tomorrow's Arizona delivery?").type).toBe('need');
    expect(parseCommand("Build the order, but don't send it yet.").type).toBe('need');
    expect(parseCommand('what do we usually order from Arizona each week').type).toBe('usual');
    expect(parseCommand('how many fruit punch do we have')).toEqual({ type: 'stock', query: 'fruit punch' });
    expect(parseCommand('Arizona delivers on Tuesday and Friday')).toMatchObject({ type: 'delivery', days: [2, 5] });
    expect(parseCommand('We usually take eight cases of Green Tea every Tuesday')).toEqual({ type: 'weekly', query: 'green tea', quantity: 8, days: [2] });
    expect(parseCommand('show my order').type).toBe('review');
  });

  it('never sends; photos are not analysed; unknown is unknown', () => {
    expect(parseCommand('send the Arizona order').type).toBe('send');
    expect(parseCommand("build the order but don't send it").type).toBe('need');
    expect(parseCommand('Look at the refrigerator photo I just took').type).toBe('photo');
    expect(parseCommand('what is the meaning of life').type).toBe('unknown');
    expect(parseCommand('undo').type).toBe('undo');
    expect(parseCommand('set up my store').type).toBe('setup');
  });
});
