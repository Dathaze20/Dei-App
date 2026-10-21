// components/ui/FitText.tsx
//
// A one-line label that never breaks inside a word ("Orde/r" at Android's largest text sizes).
// When it does not fit its space, its text is made a little smaller (to 70% at most); only if it
// still does not fit does it wrap, and then only between words. Used for the bottom navigation
// and the Order | Count switch, whose space cannot grow with the text.
import React, { useLayoutEffect, useRef } from 'react';

const MIN_SCALE = 0.7;

const FitText: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    // A size set from outside (inline) is the starting point, so refitting never compounds.
    let base = el.style.fontSize;
    let lastSet = base;
    const fit = () => {
      if (el.style.fontSize !== lastSet) base = el.style.fontSize;
      el.style.fontSize = base;
      el.style.whiteSpace = 'nowrap';
      const start = parseFloat(getComputedStyle(el).fontSize);
      // A few rounds: on Android the text zoom may be applied again on top of the size set here.
      for (let round = 0; round < 4; round++) {
        const room = el.clientWidth;
        const needed = el.scrollWidth;
        if (!room || needed <= room + 0.5) return;
        const size = parseFloat(el.style.fontSize || getComputedStyle(el).fontSize);
        const next = Math.max(start * MIN_SCALE, size * (room / needed) - 0.1);
        if (next >= size) break;
        el.style.fontSize = `${next.toFixed(1)}px`;
      }
      // Still too long at the smallest size: wrap between words, never inside one.
      if (el.scrollWidth > el.clientWidth + 0.5) el.style.whiteSpace = 'normal';
    };
    const fitAndRemember = () => {
      fit();
      lastSet = el.style.fontSize;
    };
    fitAndRemember();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitAndRemember);
    });
    // The space (parent) and the text itself (it grows when Android's text size changes).
    observer?.observe(el.parentElement ?? el);
    observer?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  });

  return (
    <span ref={ref} className={`block max-w-full whitespace-nowrap [overflow-wrap:normal] [word-break:keep-all] ${className}`}>
      {children}
    </span>
  );
};

export default FitText;
