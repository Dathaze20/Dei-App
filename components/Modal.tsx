import React, { ReactNode, useEffect, useRef } from 'react';
import { XIcon } from './shared/icons';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import OverlayPortal from './OverlayPortal';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const backdropVariants: Variants = {
  visible: { opacity: 1, transition: { duration: 0.3 } },
  hidden: { opacity: 0, transition: { duration: 0.3 } },
};

const modalVariants: Variants = {
  hidden: {
    y: "100%",
    opacity: 0,
    transition: { type: 'spring', stiffness: 400, damping: 40 }
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 400, damping: 40 }
  },
  exit: {
    y: "100%",
    opacity: 0,
    transition: { type: 'spring', stiffness: 400, damping: 40 }
  },
};

const desktopModalVariants: Variants = {
    hidden: {
        y: -20,
        opacity: 0,
        scale: 0.98
    },
    visible: {
        y: 0,
        opacity: 1,
        scale: 1,
        transition: { type: 'spring', stiffness: 400, damping: 30 }
    },
    exit: {
        y: 20,
        opacity: 0,
        scale: 0.98,
        transition: { type: 'spring', stiffness: 400, damping: 30 }
    }
}


const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;

  return (
    <OverlayPortal>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-lg z-50 flex flex-col justify-end sm:justify-center sm:items-center"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
        >
          <motion.div
            className="bg-slate-100 dark:bg-slate-900/95 w-full rounded-t-2xl sm:rounded-xl shadow-2xl sm:h-auto sm:max-w-xl ring-1 ring-black/5 dark:ring-white/10"
            variants={isMobile ? modalVariants : desktopModalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            drag={isMobile ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragSnapToOrigin
            onDragEnd={(event, info) => {
              if (isMobile && info.offset.y > 150) {
                onClose();
              }
            }}
          >
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-t-2xl sm:rounded-t-xl z-10">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h3>
              <motion.button
                onClick={onClose}
                className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary dark:focus:ring-offset-slate-800"
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
              >
                <XIcon className="h-6 w-6" />
              </motion.button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[85vh]">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </OverlayPortal>
  );
};

export default Modal;