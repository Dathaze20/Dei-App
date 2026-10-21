import { useEffect, useState } from 'react';

/**
 * True when the phone's text size is about 130% or more (the app's root font follows Android's
 * font size). Large text gets fewer sticky bars, so the products keep most of the screen.
 */
const isLarge = () => {
  try {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) >= 20;
  } catch {
    return false;
  }
};

export const useLargeText = (): boolean => {
  const [large, setLarge] = useState(isLarge);
  useEffect(() => {
    const update = () => setLarge(isLarge());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return large;
};
