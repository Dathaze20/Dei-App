// utils/workPlace.ts
//
// Where the person was working, kept on this phone so putting it down (and Android closing the
// app in the background) does not lose the place: the scroll position of each supplier's list and
// which sections are open or closed. A `deliordernyc_sys_` key: never exported, snapshotted or
// restored. Best effort: if it cannot be read or saved, the app starts at the top as before.
import { SYSTEM_KEY_PREFIX } from './dataExport';

export const WORK_PLACE_KEY = `${SYSTEM_KEY_PREFIX}place`;

export interface WorkPlace {
  scroll: Record<string, number>;
  sections: Record<string, boolean>;
}

const MAX_ENTRIES = 200;

const entries = <T>(value: unknown, ok: (v: unknown) => v is T): Record<string, T> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((e): e is [string, T] => e[0].length < 200 && ok(e[1]))
      .slice(-MAX_ENTRIES),
  );
};
const isScroll = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e7;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

export const parseWorkPlace = (text: string | null): WorkPlace => {
  try {
    const raw = text ? JSON.parse(text) : null;
    return { scroll: entries(raw?.scroll, isScroll), sections: entries(raw?.sections, isBool) };
  } catch {
    return { scroll: {}, sections: {} };
  }
};

export const readWorkPlace = (): WorkPlace => {
  try {
    return parseWorkPlace(localStorage.getItem(WORK_PLACE_KEY));
  } catch {
    return { scroll: {}, sections: {} };
  }
};

let pending: WorkPlace | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const flush = () => {
  timer = null;
  if (!pending) return;
  try {
    localStorage.setItem(WORK_PLACE_KEY, JSON.stringify(pending));
  } catch {
    // Not saved: the place is still kept while the app is open.
  }
  pending = null;
};

/** Saves the place a moment later (scrolling saves at most every half second). */
export const saveWorkPlace = (change: (place: WorkPlace) => WorkPlace) => {
  pending = change(pending ?? readWorkPlace());
  if (!timer) timer = setTimeout(flush, 500);
};

if (typeof document !== 'undefined') {
  // Save straight away when the phone is put down or the app goes to the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (timer) clearTimeout(timer);
      flush();
    }
  });
}
