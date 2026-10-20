// components/counter/CounterNav.tsx
//
// Bottom navigation for one-handed use: Counter · Orders · Catalog · Menu. It sits fully above the
// Android gesture bar and grows with larger text.
import React from 'react';
import { NavLink } from 'react-router-dom';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Bars3Icon, ShoppingCartIcon, Squares2X2Icon, StorefrontIcon } from '../shared/icons';

const item = 'relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-semibold';
const tone = (active: boolean) => (active ? 'text-cyan-600 dark:text-cyan-300' : 'text-slate-600 dark:text-slate-300');

const CounterNav: React.FC<{ onMenu: () => void }> = ({ onMenu }) => {
  const { currentOrder } = useInventory();
  const { t } = useTranslation();
  const lines = currentOrder.items.length;
  const links = [
    { to: '/counter', end: true, label: t('navCounter'), Icon: StorefrontIcon },
    { to: '/counter/orders', end: false, label: t('navOrders'), Icon: ShoppingCartIcon, badge: lines },
    { to: '/counter/catalog', end: false, label: t('navCatalog'), Icon: Squares2X2Icon },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white pb-safe px-safe dark:border-white/10 dark:bg-[#0b1120]" data-testid="counter-nav">
      <div className="mx-auto flex min-h-[var(--nav-h)] max-w-3xl items-stretch px-1">
        {links.map(({ to, end, label, Icon, badge }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `${item} ${tone(isActive)}`}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" />}
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  {!!badge && (
                    <span className="absolute -top-1 -end-2.5 min-w-4 h-4 rounded-full bg-teal-500 px-1 text-[10px] font-bold leading-4 text-white">{badge}</span>
                  )}
                </span>
                <span className="max-w-full truncate px-1 leading-tight">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={onMenu} className={`${item} ${tone(false)}`} aria-label={t('openMenu')}>
          <Bars3Icon className="h-6 w-6" />
          <span className="max-w-full truncate px-1 leading-tight">{t('navMenu')}</span>
        </button>
      </div>
    </nav>
  );
};

export default CounterNav;
