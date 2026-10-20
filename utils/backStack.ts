// utils/backStack.ts
//
// Android Back, handled by the web app. The Android app (MainActivity.java) asks
// window.deliBack() on every Back press; true means the app handled it, false lets Android do its
// usual thing (leave the app). Handlers are tried newest first:
//   1. open overlays (a sheet, a dialog, the menu) close one at a time;
//   2. then the screen goes back to its home (Counter, or Products in Classic View);
//   3. on the home screen nothing handles it, so Back leaves the app.
// Back never saves, deletes or discards anything by itself, and never moves between tabs in a loop.
// Escape on a keyboard closes the top overlay the same way.

export type BackKind = 'overlay' | 'screen';

interface Entry {
  id: number;
  kind: BackKind;
  handle: () => boolean;
}

let entries: Entry[] = [];
let nextId = 1;

/** Registers a handler; returns the function that removes it. Later handlers are asked first. */
export const pushBackHandler = (handle: () => boolean, kind: BackKind = 'overlay'): (() => void) => {
  const entry = { id: nextId++, kind, handle };
  entries.push(entry);
  return () => {
    entries = entries.filter(e => e.id !== entry.id);
  };
};

const run = (kinds: readonly BackKind[]): boolean => {
  // Overlays first (newest first), then screens (newest first).
  for (const kind of kinds) {
    const candidates = entries.filter(e => e.kind === kind).reverse();
    for (const entry of candidates) {
      try {
        if (entry.handle()) return true;
      } catch {
        // A broken handler must never trap the person in the app.
      }
    }
  }
  return false;
};

/** One Back press. True when something closed or the screen went back to its home. */
export const handleBack = (): boolean => run(['overlay', 'screen']);

/** Escape: closes the top overlay only. */
export const handleEscape = (): boolean => run(['overlay']);

/** For tests. */
export const resetBackHandlers = () => {
  entries = [];
};

declare global {
  interface Window {
    deliBack?: () => boolean;
  }
}

/** Called once at start-up. */
export const installBackHandling = () => {
  if (typeof window === 'undefined') return;
  window.deliBack = handleBack;
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && handleEscape()) event.preventDefault();
  });
};
