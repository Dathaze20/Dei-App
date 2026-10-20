// components/counter/CounterStepper.tsx
//
// One-tap ordering: "+" adds one to the saved order straight away; with something in the order it
// becomes [− quantity +]. Every button is at least 44x44.
import React from 'react';
import { motion } from 'framer-motion';
import { MinusIcon, PlusIcon } from '../shared/icons';
import { useTranslation } from '../../hooks/useTranslation';

interface CounterStepperProps {
  quantity: number;
  name: string;
  onAdd: () => void;
  onRemove: () => void;
}

const CounterStepper: React.FC<CounterStepperProps> = ({ quantity, name, onAdd, onRemove }) => {
  const { t } = useTranslation();
  if (quantity <= 0) {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={onAdd}
        aria-label={t('addOne', { name })}
        className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-teal-500 text-white shadow-md shadow-teal-500/25 dark:bg-teal-400 dark:text-slate-950"
      >
        <PlusIcon className="h-5 w-5" />
      </motion.button>
    );
  }
  return (
    <div dir="ltr" className="flex flex-shrink-0 items-center rounded-xl bg-slate-900 text-white ring-1 ring-teal-400/60 dark:bg-slate-800" data-testid="counter-stepper">
      <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={onRemove} aria-label={t('removeOne', { name })} className="inline-flex h-11 w-11 items-center justify-center">
        <MinusIcon className="h-5 w-5" />
      </motion.button>
      <span className="min-w-7 text-center text-base font-bold tabular-nums" aria-label={t('inOrderQuantity', { quantity })}>{quantity}</span>
      <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={onAdd} aria-label={t('addOne', { name })} className="inline-flex h-11 w-11 items-center justify-center text-teal-300">
        <PlusIcon className="h-5 w-5" />
      </motion.button>
    </div>
  );
};

export default CounterStepper;
