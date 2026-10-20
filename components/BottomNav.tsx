import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import useInventory from '../hooks/useInventory';
import { HomeIcon, Cog6ToothIcon, ShoppingCartIcon } from './shared/icons';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';

const BottomNav: React.FC = () => {
    const { currentOrder } = useInventory();
    const { t } = useTranslation();
    const location = useLocation();
    const orderItemCount = currentOrder.items.length;

    const navItems = [
      { to: "/", label: t('products'), Icon: HomeIcon },
      { to: "/manage", label: t('manage'), Icon: Cog6ToothIcon },
      { to: "/order", label: t('order'), Icon: ShoppingCartIcon },
  ];

    return (
        <motion.nav 
            className="md:hidden fixed bottom-0 left-0 right-0 pb-safe px-safe bg-white dark:bg-slate-950 border-t border-slate-200/80 dark:border-slate-800/80 z-40"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.2 }}
        >
            {/* Stays fully above the Android gesture bar (pb-safe); grows with larger text. */}
            <div className="flex justify-around items-stretch min-h-[var(--nav-h)] max-w-7xl mx-auto px-1">
                {navItems.map(({ to, label, Icon }) => {
                    const isActive = location.pathname === to;
                    return (
                        <NavLink 
                            key={to} 
                            to={to} 
                            className="relative flex-1 min-w-0 min-h-11 flex flex-col items-center justify-center gap-0.5 py-1.5 text-xs focus:outline-none transition-colors group"
                            aria-current={isActive ? "page" : undefined}
                        >
                            {/* The moving pill indicator */}
                            {isActive && (
                                <motion.div
                                    layoutId="active-nav-pill"
                                    className="absolute w-16 h-8 bg-brand-primary/10 dark:bg-brand-primary/20"
                                    style={{ borderRadius: 9999 }}
                                    transition={{ type: 'spring', stiffness: 600, damping: 35 }}
                                />
                            )}
                            
                            {/* Icon container for tap effect and notification */}
                            <motion.div className="relative" whileTap={{ scale: 0.9 }}>
                                <Icon className={`h-6 w-6 transition-colors ${isActive ? 'text-brand-primary' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`} />
                                {label === t('order') && orderItemCount > 0 && (
                                    <motion.span 
                                        className="absolute -top-1 -end-2 block min-w-4 h-4 px-0.5 rounded-full bg-brand-secondary text-white text-[10px] flex items-center justify-center font-bold ring-2 ring-white dark:ring-slate-950"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                    >
                                        {orderItemCount}
                                    </motion.span>
                                )}
                            </motion.div>
                            
                            {/* Label */}
                            <span className={`relative max-w-full truncate px-1 leading-tight font-semibold transition-colors ${isActive ? 'text-brand-primary' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>
                                {label}
                            </span>
                        </NavLink>
                    );
                })}
            </div>
        </motion.nav>
    );
};

export default BottomNav;