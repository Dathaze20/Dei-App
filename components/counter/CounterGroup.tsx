// components/counter/CounterGroup.tsx
//
// A group of products (a package size, a product line, MEATS / CHEESES …) that opens and closes
// with one tap. Large groups start closed (utils/productGrouping.ts startsCollapsed).
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon, ShoppingCartIcon } from '../shared/icons';
import { useTranslation } from '../../hooks/useTranslation';

interface CounterGroupProps {
  title: string;
  count: number;
  inOrder: number;
  defaultOpen: boolean;
  /** Translated section words (MEATS, CHEESES) are shown in capitals; product data never is. */
  caps?: boolean;
  children: React.ReactNode;
}

const CounterGroup: React.FC<CounterGroupProps> = ({ title, count, inOrder, defaultOpen, caps = false, children }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900/80 dark:ring-white/10" data-testid="counter-group">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full min-h-11 items-center gap-2 px-3 py-2 text-start"
      >
        <h3 dir="auto" className={`min-w-0 flex-1 truncate rtl:text-right font-bold text-slate-800 dark:text-slate-100 ${caps ? 'text-sm uppercase tracking-wide' : 'text-[0.9375rem]'}`}>{title}</h3>
        {inOrder > 0 && (
          <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-xs font-bold text-teal-700 dark:text-teal-300" aria-label={t('inOrderQuantity', { quantity: inOrder })}>
            <ShoppingCartIcon className="h-3.5 w-3.5" />{inOrder}
          </span>
        )}
        <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">{count}</span>
        <motion.span className="flex-shrink-0 text-slate-400" animate={{ rotate: open ? 0 : -90 }} transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
          <ChevronDownIcon className="h-5 w-5 rtl:-scale-x-100" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="rows"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/5 dark:border-white/5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default CounterGroup;
