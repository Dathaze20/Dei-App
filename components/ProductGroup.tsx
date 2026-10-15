import React, { useState } from 'react';
import { ChevronDownIcon } from './shared/icons';
import { motion, AnimatePresence } from 'framer-motion';

interface ProductGroupProps {
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}

const ProductGroup: React.FC<ProductGroupProps> = ({ title, count, color, children }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <motion.div 
        className="mb-2 last:mb-0"
        variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
        layout
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-3 bg-slate-100/70 dark:bg-slate-800/70 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors"
        style={{ borderLeft: `4px solid ${color}` }}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">{title}</h3>
          <span className="text-xs font-semibold text-white bg-slate-400 dark:bg-slate-600 px-2 py-0.5 rounded-full">{count}</span>
        </div>
        <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{type: 'spring', stiffness: 300, damping: 30}}>
            <ChevronDownIcon className={`h-6 w-6 text-slate-500`} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
           <motion.div
            key="content"
            initial="collapsed"
            animate="open"
            exit="collapsed"
            variants={{
              open: { opacity: 1, height: 'auto' },
              collapsed: { opacity: 0, height: 0 }
            }}
            transition={{ type: "spring", stiffness: 400, damping: 40, mass: 0.8 }}
            className="overflow-hidden"
          >
            <div className="pt-1 pl-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ProductGroup;