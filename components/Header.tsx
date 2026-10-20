import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ShoppingCartIcon, SunIcon, MoonIcon, GlobeAltIcon, ChevronDownIcon } from './shared/icons';
import { useTheme } from '../contexts/ThemeContext';
import useInventory from '../hooks/useInventory';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';

const Header: React.FC = () => {
  const { currentOrder, deliName } = useInventory();
  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage } = useTranslation();
  const [isLangMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const orderItemCount = currentOrder.items.length;
  
  const linkStyle = "flex items-center justify-center px-4 py-1.5 rounded-full text-sm font-semibold transition-colors duration-200 ease-in-out";
  const activeLinkStyle = "bg-brand-primary text-white shadow-md";
  const inactiveLinkStyle = "text-slate-600 dark:text-slate-300 hover:bg-slate-200/75 dark:hover:bg-slate-800";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compact on phones: one 56px bar (it grows with larger text) under the Android status bar.
  // The name shrinks before the buttons do, so nothing can push the page wider than the screen.
  const iconButton = "inline-flex items-center justify-center min-h-11 min-w-11 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors";

  return (
    <header className="pt-safe bg-slate-100 dark:bg-slate-950 shadow-lg shadow-slate-900/5 dark:shadow-black/20 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 h-[var(--header-h)]">
          <NavLink to="/" className="min-w-0 flex-1 min-h-11 flex flex-col justify-center text-start">
            <span className="truncate text-xl leading-tight font-extrabold text-slate-800 dark:text-slate-100">{deliName}</span>
            <span className="hidden min-[380px]:block truncate text-[0.6875rem] leading-tight text-brand-muted">{t('deliBrainOfStore')}</span>
          </NavLink>
          
          <motion.nav
            className="hidden md:flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800/70 p-1 rounded-full"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
             <NavLink to="/" className={({ isActive }) => `${linkStyle} ${isActive ? activeLinkStyle : inactiveLinkStyle}`}>
              {t('products')}
            </NavLink>
             <NavLink to="/manage" className={({ isActive }) => `${linkStyle} ${isActive ? activeLinkStyle : inactiveLinkStyle}`}>
              {t('manage')}
            </NavLink>
          </motion.nav>

          <div className="flex flex-shrink-0 items-center gap-1">
            <div className="relative" ref={langMenuRef}>
              <motion.button
                onClick={() => setLangMenuOpen(!isLangMenuOpen)}
                className={`${iconButton} gap-1 px-2`}
                aria-label={t('language')}
                aria-expanded={isLangMenuOpen}
                whileTap={{ scale: 0.9 }}
              >
                <GlobeAltIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-bold uppercase text-slate-700 dark:text-slate-200">{language}</span>
                <ChevronDownIcon className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300"/>
              </motion.button>
              <AnimatePresence>
                {isLangMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute end-0 mt-2 w-36 bg-white dark:bg-slate-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50"
                  >
                    <div className="py-1">
                      <button onClick={() => { setLanguage('en'); setLangMenuOpen(false); }} className={`block w-full text-start px-4 min-h-11 text-sm ${language === 'en' ? 'bg-brand-primary/10 text-brand-primary font-semibold' : 'text-slate-700 dark:text-slate-200'} hover:bg-slate-100 dark:hover:bg-slate-700`}>{t('english')}</button>
                      <button onClick={() => { setLanguage('es'); setLangMenuOpen(false); }} className={`block w-full text-start px-4 min-h-11 text-sm ${language === 'es' ? 'bg-brand-primary/10 text-brand-primary font-semibold' : 'text-slate-700 dark:text-slate-200'} hover:bg-slate-100 dark:hover:bg-slate-700`}>{t('spanish')}</button>
                      <button onClick={() => { setLanguage('ar'); setLangMenuOpen(false); }} className={`block w-full text-start px-4 min-h-11 text-sm ${language === 'ar' ? 'bg-brand-primary/10 text-brand-primary font-semibold' : 'text-slate-700 dark:text-slate-200'} hover:bg-slate-100 dark:hover:bg-slate-700`}>{t('arabic')}</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <motion.button
              onClick={toggleTheme}
              className={iconButton}
              aria-label={t('toggleTheme')}
              whileTap={{ scale: 0.9 }}
            >
              {theme === 'light' ? (
                <MoonIcon className="h-6 w-6 text-slate-700" />
              ) : (
                <SunIcon className="h-6 w-6 text-slate-300" />
              )}
            </motion.button>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
              <NavLink to="/order" className="relative p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors hidden md:block">
                <ShoppingCartIcon className="h-7 w-7 text-slate-600 dark:text-slate-300" />
                {orderItemCount > 0 && (
                  <motion.span 
                    className="absolute -top-1 -right-1 block h-5 w-5 rounded-full bg-brand-secondary text-white text-xs flex items-center justify-center font-bold ring-2 ring-slate-100 dark:ring-slate-950"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    {orderItemCount}
                  </motion.span>
                )}
              </NavLink>
            </motion.div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;