// components/counter/CounterDrawer.tsx
//
// The menu, in four short groups: Store, Preferences, Data & recovery, App. Each entry opens its
// Settings section; language and dark mode can also be changed right here. Slides in from the
// start side (left, or right in Arabic). Android Back and Escape close it.
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import OverlayPortal from '../OverlayPortal';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { useTheme } from '../../contexts/ThemeContext';
import { useBackHandler } from '../../hooks/useBackHandler';
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
  ArchiveBoxIcon,
  PhotoIcon,
  CameraIcon,
} from '../shared/icons';

const row =
  'flex w-full min-h-11 items-center gap-3 rounded-xl px-3 py-1.5 text-start text-[0.9375rem] font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/5';

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
    // Entries starting with "/" are screens (Order history); the others are Settings sections.
    if (section.startsWith('/')) navigate(section);
    else navigate('/counter/settings', { state: { section } });
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
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-white/10">
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

              <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label={t('navMenu')}>
                {(
                  [
                    ['menuGroupStore', [['settings-store', t('storeProfile'), UserCircleIcon]]],
                    ['menuGroupPreferences', [['settings-display', t('appearance'), SwatchIcon]]],
                    ['menuGroupData', [['settings-backup', t('menuBackup'), ArrowDownTrayIcon], ['settings-photos', t('productPhotos'), PhotoIcon], ['settings-restore', t('menuRestore'), ArrowUturnLeftIcon], ['/counter/orders/history', t('orderHistory'), ArchiveBoxIcon], ['/counter/shelf', t('shelfCheck'), CameraIcon]]],
                    ['menuGroupApp', [['settings-updates', t('menuUpdates'), SparklesIcon], ['settings-about', t('aboutApp'), InformationCircleIcon]]],
                  ] as const
                ).map(([group, entries]) => (
                  <div key={group} className="pt-1">
                    <p className="px-3 pb-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t(group)}</p>
                    {entries.map(([section, label, Icon]) => (
                      <button key={section} type="button" className={row} onClick={() => goTo(section)} data-section={section}>
                        <Icon className="h-5 w-5 flex-shrink-0 text-cyan-600 dark:text-cyan-300" /> <span className="min-w-0 break-words">{label}</span>
                      </button>
                    ))}
                    {group === 'menuGroupPreferences' && (
                      <>
                        <div className="flex gap-1 px-3 py-1" role="group" aria-label={t('menuLanguage')}>
                          <GlobeAltIcon className="me-1 h-5 w-5 flex-shrink-0 self-center text-slate-400" />
                          {(['en', 'es', 'ar'] as const).map(code => (
                            <button
                              key={code}
                              type="button"
                              aria-pressed={language === code}
                              onClick={() => setLanguage(code)}
                              className={`min-h-11 min-w-0 flex-1 rounded-xl text-sm font-bold ${
                                language === code ? 'bg-cyan-600 text-white dark:bg-cyan-500 dark:text-slate-950' : 'bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-200'
                              }`}
                            >
                              {code === 'en' ? 'EN' : code === 'es' ? 'ES' : 'ع'}
                              <span className="sr-only"> {code === 'en' ? 'English' : code === 'es' ? 'Español' : 'العربية'}</span>
                            </button>
                          ))}
                        </div>
                        <button type="button" role="switch" aria-checked={theme === 'dark'} className={row} onClick={toggleTheme}>
                          <MoonIcon className="h-5 w-5 flex-shrink-0 text-slate-500" />
                          <span className="flex-1">{t('menuTheme')}</span>
                          <span className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${theme === 'dark' ? 'bg-cyan-500' : 'bg-slate-300'}`}>
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${theme === 'dark' ? 'start-[1.375rem]' : 'start-0.5'}`} />
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </nav>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};

export default CounterDrawer;
