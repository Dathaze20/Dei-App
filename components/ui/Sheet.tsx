// components/ui/Sheet.tsx
//
// The one sheet used across the Counter screen (product details, counting, order review,
// sharing, lists, forms, confirmations). On phones it rises from the bottom, never reaches under
// the status bar, keeps its actions above the gesture bar and scrolls inside itself. Android Back
// and Escape close it; focus moves into it and back out when it closes.
import React, { ReactNode, useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import OverlayPortal from '../OverlayPortal';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useTranslation } from '../../hooks/useTranslation';
import { XIcon } from '../shared/icons';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Small line under the title (supplier, size …). */
  subtitle?: ReactNode;
  /** Shown before the title, e.g. the product picture. */
  leading?: ReactNode;
  children: ReactNode;
  /** Actions that stay visible at the bottom of the sheet. */
  footer?: ReactNode;
  testId?: string;
  /** Wider sheets on tablets (forms). */
  wide?: boolean;
}

const Sheet: React.FC<SheetProps> = ({ open, onClose, title, subtitle, leading, children, footer, testId, wide = false }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useBackHandler(open, onClose);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    // Focus the sheet itself (not the first field), so the phone keyboard does not pop up.
    const timer = setTimeout(() => panel.current?.focus({ preventScroll: true }), 30);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  return (
    <OverlayPortal>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col justify-end px-safe pt-[calc(var(--safe-top)+0.75rem)] sm:items-center sm:justify-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="absolute inset-0 bg-slate-950/55" onClick={onClose} aria-hidden="true" />
            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              data-testid={testId}
              className={`relative flex max-h-full w-full min-w-0 flex-col rounded-t-3xl bg-white text-slate-900 shadow-2xl ring-1 ring-black/5 focus:outline-none dark:bg-[#111a2e] dark:text-slate-100 dark:ring-white/10 sm:rounded-3xl ${
                wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
              }`}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 42 }}
            >
              <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-100 py-2 pe-2 ps-4 dark:border-white/5">
                {leading}
                <div className="min-w-0 flex-1 py-1">
                  <h2 id={titleId} dir="auto" className="break-words text-lg font-bold leading-snug rtl:text-right">
                    {title}
                  </h2>
                  {subtitle && <div dir="auto" className="break-words text-sm text-slate-500 rtl:text-right dark:text-slate-400">{subtitle}</div>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('closeDialog')}
                  className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center self-start rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <XIcon className="h-6 w-6" />
                </button>
              </div>
              <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 ${footer ? 'pb-3' : 'pb-[calc(1rem+var(--safe-bottom))]'}`}>
                {children}
              </div>
              {footer && (
                <div className="flex-shrink-0 border-t border-slate-100 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] dark:border-white/5 sm:pb-3" data-testid="sheet-footer">
                  {footer}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};

export default Sheet;
