// components/counter/CounterDrawer.tsx
//
// The Counter menu: the places in Settings (store profile, appearance, backup, restore and
// recovery, updates, about), quick language and dark mode, and the way back to Classic View.
// Slides in from the start side (left, or right in Arabic). Android Back and Escape close it.
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import OverlayPortal from '../OverlayPortal';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { useTheme } from '../../contexts/ThemeContext';
import { useBackHandler } from '../../hooks/useBackHandler';
import { saveUiMode } from '../../utils/uiMode';
import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  MoonIcon,
  SparklesIcon,
  SwatchIcon,
  UserCircleIcon,
  XIcon,
} from '../shared/icons';

const row =
  'flex w-full min-h-12 items-center gap-3 rounded-xl px-3 text-start font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/5';

const CounterDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { deliName } = useInventory();
  const { t, language, setLanguage, dir } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const closeButton = useRef<HTMLButtonElement>(null);

  useBackHandler(open, onClose);
  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  const goTo = (section: string) => {
    onClose();
    navigate('/counter/settings', { state: { section } });
  };
  const toClassic = () => {
    saveUiMode('classic');
    onClose();
    navigate('/');
  };
  const from = dir === 'rtl' ? '100%' : '-100%';

  return (
    <OverlayPortal>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-slate-950/60" onClick={onClose} />
            <motion.aside
              dir={dir}
              role="dialog"
              aria-modal="true"
              aria-label={t('navMenu')}
              data-testid="counter-drawer"
              className="absolute inset-y-0 start-0 flex w-[min(20rem,86vw)] flex-col bg-white pt-safe pb-safe text-slate-900 shadow-2xl dark:bg-[#0d1426] dark:text-slate-100"
              initial={{ x: from }}
              animate={{ x: 0 }}
              exit={{ x: from }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            >
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-extrabold">{deliName}</p>
                  {deliName.trim() !== 'DeliOrderNYC' && (
                    <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600 dark:text-cyan-300">DeliOrderNYC</p>
                  )}
                </div>
                <button ref={closeButton} type="button" onClick={onClose} aria-label={t('closeMenu')} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10">
                  <XIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 space-y-1 overflow-y-auto p-2">
                {(
                  [
                    ['settings-store', t('storeProfile'), UserCircleIcon],
                    ['settings-display', t('appearance'), SwatchIcon],
                    ['settings-backup', t('menuBackup'), ArrowDownTrayIcon],
                    ['settings-restore', t('menuRestore'), ArrowUturnLeftIcon],
                    ['settings-updates', t('menuUpdates'), SparklesIcon],
                    ['settings-about', t('aboutApp'), InformationCircleIcon],
                  ] as const
                ).map(([section, label, Icon]) => (
                  <button key={section} type="button" className={row} onClick={() => goTo(section)} data-section={section}>
                    <Icon className="h-5 w-5 text-cyan-600 dark:text-cyan-300" /> {label}
                  </button>
                ))}

                <div className="px-3 pb-1 pt-4">
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <GlobeAltIcon className="h-4 w-4" /> {t('menuLanguage')}
                  </p>
                  <div className="flex gap-1.5" role="group" aria-label={t('menuLanguage')}>
                    {(['en', 'es', 'ar'] as const).map(code => (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={language === code}
                        onClick={() => setLanguage(code)}
                        className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${
                          language === code ? 'bg-cyan-600 text-white dark:bg-cyan-500 dark:text-slate-950' : 'bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-200'
                        }`}
                      >
                        {code === 'en' ? 'English' : code === 'es' ? 'Español' : 'العربية'}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="button" role="switch" aria-checked={theme === 'dark'} className={row} onClick={toggleTheme}>
                  <MoonIcon className="h-5 w-5 text-slate-500" />
                  <span className="flex-1">{t('menuTheme')}</span>
                  <span className={`relative h-6 w-11 rounded-full transition-colors ${theme === 'dark' ? 'bg-cyan-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${theme === 'dark' ? 'start-[1.375rem]' : 'start-0.5'}`} />
                  </span>
                </button>
              </div>

              <div className="border-t border-slate-200 p-2 dark:border-white/10">
                <button type="button" className={row} onClick={toClassic} data-testid="switch-to-classic">
                  <ArrowUturnLeftIcon className="h-5 w-5 text-slate-500 rtl:-scale-x-100" /> {t('switchToClassic')}
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};

export default CounterDrawer;
