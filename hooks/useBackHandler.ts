import { useEffect, useRef } from 'react';
import { BackKind, pushBackHandler } from '../utils/backStack';

/**
 * While `active`, Android Back (and Escape, for overlays) calls `onBack`. For overlays `onBack`
 * closes them; the handler then reports it handled the press. For screens `onBack` returns
 * whether it did anything.
 */
export const useBackHandler = (active: boolean, onBack: () => boolean | void, kind: BackKind = 'overlay') => {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => latest.current() !== false, kind);
  }, [active, kind]);
};
