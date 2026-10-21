// hooks/useHideOnScroll.ts
//
// The Counter bar (supplier, Order | Count, pills) slides away while the list is scrolled down, so
// the products get the screen, and comes back as soon as the list is scrolled up (or reaches the
// top). It is never gone for good: one small scroll up shows it again.
import { useEffect, useState } from 'react';

const MOVE = 12; // px of scrolling before it reacts, so a shaky thumb does not flicker it

export const useHideOnScroll = (enabled: boolean): boolean => {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 80) setHidden(false);
      else if (y > last + MOVE) setHidden(true);
      else if (y < last - MOVE) setHidden(false);
      else return;
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled]);
  return hidden;
};
