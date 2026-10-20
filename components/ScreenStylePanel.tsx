// components/ScreenStylePanel.tsx
//
// Choose between Classic View and the new Counter screen. Only the screen changes: products,
// orders, counts and backups are the same in both. The choice is remembered on this phone.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { UiMode, saveUiMode } from '../utils/uiMode';

const ScreenStylePanel: React.FC<{ current: UiMode }> = ({ current }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const choose = (mode: UiMode) => {
    saveUiMode(mode);
    navigate(mode === 'counter' ? '/counter' : '/');
  };
  const option = (mode: UiMode, label: string) => (
    <button
      type="button"
      aria-pressed={current === mode}
      onClick={() => choose(mode)}
      className={`min-h-11 flex-1 rounded-xl px-3 font-semibold transition-colors ${
        current === mode
          ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/30'
          : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
      }`}
    >
      {label}
    </button>
  );
  return (
    <motion.section
      className="bg-white/75 dark:bg-slate-900/75 backdrop-blur-xl rounded-2xl shadow-xl shadow-black/5 p-3 sm:p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.11 }}
      data-testid="screen-style-panel"
    >
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{t('screenStyle')}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{t('screenStyleHelp')}</p>
      <div className="flex gap-2">
        {option('classic', t('screenClassic'))}
        {option('counter', t('screenCounter'))}
      </div>
    </motion.section>
  );
};

export default ScreenStylePanel;
