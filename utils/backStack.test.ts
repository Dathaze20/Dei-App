import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleBack, handleEscape, pushBackHandler, resetBackHandlers } from './backStack';

afterEach(resetBackHandlers);

describe('Android Back', () => {
  it('closes the newest overlay first, one per press, then the screen goes home, then the app may leave', () => {
    const calls: string[] = [];
    pushBackHandler(() => (calls.push('screen'), true), 'screen');
    const offSheet = pushBackHandler(() => (calls.push('sheet'), true));
    const offKeypad = pushBackHandler(() => (calls.push('keypad'), true));

    expect(handleBack()).toBe(true);
    offKeypad();
    expect(handleBack()).toBe(true);
    offSheet();
    expect(handleBack()).toBe(true);
    expect(calls).toEqual(['keypad', 'sheet', 'screen']);
  });

  it('a screen handler registered later than an overlay never beats the overlay', () => {
    const overlay = vi.fn(() => true);
    const screen = vi.fn(() => true);
    pushBackHandler(overlay);
    pushBackHandler(screen, 'screen');
    handleBack();
    expect(overlay).toHaveBeenCalledOnce();
    expect(screen).not.toHaveBeenCalled();
  });

  it('with nothing to handle, Back is left to Android (false)', () => {
    expect(handleBack()).toBe(false);
    pushBackHandler(() => false, 'screen');
    expect(handleBack()).toBe(false);
  });

  it('a handler that throws never traps the person: the next one is tried', () => {
    pushBackHandler(() => true, 'screen');
    pushBackHandler(() => {
      throw new Error('broken');
    });
    expect(handleBack()).toBe(true);
  });

  it('Escape closes overlays only, never changes the screen', () => {
    const screen = vi.fn(() => true);
    pushBackHandler(screen, 'screen');
    expect(handleEscape()).toBe(false);
    expect(screen).not.toHaveBeenCalled();
  });
});
