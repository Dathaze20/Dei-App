// components/ui/Toast.tsx
//
// Short confirmations ("Saved", "Copied", "Removed · Undo"), shown just under the top bar so they
// never cover the order tray, the bottom navigation or a sheet's buttons. One at a time; a new one
// replaces the old. Announced to screen readers.
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ToastAction {
  label: string;
  run: () => void;
}
interface ToastState {
  id: number;
  message: string;
  action?: ToastAction;
}
type Show = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<Show>(() => undefined);

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const next = useRef(1);
  const show = useCallback<Show>((message, action) => setToast({ id: next.current++, message, action }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.action ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+var(--header-h)+0.5rem)] z-[60] flex justify-center px-3" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              role="status"
              data-testid="toast"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 py-2 pe-2 ps-4 text-sm font-semibold text-white shadow-xl ring-1 ring-white/10 dark:bg-white dark:text-slate-900"
            >
              <span className="min-w-0 flex-1 py-1.5">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.run();
                    setToast(null);
                  }}
                  className="min-h-11 flex-shrink-0 rounded-xl px-3 font-bold text-teal-300 hover:bg-white/10 dark:text-teal-700 dark:hover:bg-slate-900/5"
                >
                  {toast.action.label}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
