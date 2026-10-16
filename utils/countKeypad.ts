// utils/countKeypad.ts
//
// The whole-number counting keypad and "Save & Next", as pure functions. The keypad edits the
// typed text; the value is always read with parseCountInput, so blank means "no count" (never 0)
// and only whole numbers from 0 to MAX_COUNT_UNITS can be saved.

import { MAX_COUNT_UNITS, parseCountInput } from './stockCounts';

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'backspace' | 'clear';

/** The text after a key press. A key that would make the number too large is ignored. */
export const pressKey = (text: string, key: KeypadKey): string => {
  if (key === 'clear') return '';
  if (key === 'backspace') return text.slice(0, -1);
  const next = text === '0' ? key : text + key; // no leading zeros
  return Number(next) <= MAX_COUNT_UNITS ? next : text;
};

/** −1 / +1 buttons. +1 on blank gives 1; −1 on blank or 0 changes nothing (blank never becomes 0). */
export const stepCount = (text: string, delta: 1 | -1): string => {
  const units = parseCountInput(text);
  if (units === null) return delta === 1 && text.trim() === '' ? '1' : text;
  const next = units + delta;
  return next < 0 || next > MAX_COUNT_UNITS ? text : String(next);
};

/** The count to save, or null when nothing valid is typed. */
export const keypadUnits = (text: string): number | null => parseCountInput(text);

/** The product after `currentId` in the visible order, or null at the end of the list. */
export const nextProductId = (orderedIds: readonly string[], currentId: string): string | null => {
  const index = orderedIds.indexOf(currentId);
  return index >= 0 && index < orderedIds.length - 1 ? orderedIds[index + 1] : null;
};

/**
 * The products that Save & Next walks through: counted products in open groups, in screen order.
 * `isCounted` is normally `product => getWorkflow(product.supplierId).countStock`.
 */
export const countingOrder = <P extends { id: string }>(
  groups: readonly { key: string; products: readonly P[] }[],
  collapsedKeys: ReadonlySet<string>,
  isCounted: (product: P) => boolean,
): string[] =>
  groups.filter(group => !collapsedKeys.has(group.key)).flatMap(group => group.products.filter(isCounted).map(p => p.id));

export type SaveAndNextOutcome<R> =
  | { saved: false; result: R | null; nextId: string }
  | { saved: true; result: R; nextId: string | null };

/**
 * Saves the typed count, then moves on. Moves only after a successful save: on blank input or a
 * refused save (blocked, write failed, …) it stays on the same product so nothing is lost.
 */
export const saveAndNext = <R extends { ok: boolean }>(
  text: string,
  currentId: string,
  orderedIds: readonly string[],
  save: (units: number) => R,
): SaveAndNextOutcome<R> => {
  const units = keypadUnits(text);
  if (units === null) return { saved: false, result: null, nextId: currentId };
  const result = save(units);
  if (!result.ok) return { saved: false, result, nextId: currentId };
  return { saved: true, result, nextId: nextProductId(orderedIds, currentId) };
};
