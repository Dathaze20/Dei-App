import React, { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../hooks/useTranslation';

/**
 * Renders full-screen overlays (modals, the share dialog) directly in <body>.
 *
 * Inside the page, a `position: fixed` overlay was positioned against the nearest card with a
 * blur or transform instead of the screen, so on a phone a modal opened from a long list could
 * appear far below the visible area. In <body> it always covers the screen. The wrapper keeps
 * the app's text colour, font and reading direction.
 */
const OverlayPortal: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { dir } = useTranslation();
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(<div dir={dir} className="text-slate-800 dark:text-slate-200 font-sans">{children}</div>, document.body);
};

export default OverlayPortal;
