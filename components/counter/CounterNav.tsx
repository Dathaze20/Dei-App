// components/counter/CounterNav.tsx
//
// Bottom navigation for one-handed use: Counter · Orders · Catalog · Camera. Camera opens the shelf
// photos (start a check or carry on with an unfinished one; the badge counts unfinished checks).
// Settings, backup and help are in the menu (☰ in the header), so they are not repeated here. It
// sits fully above the Android gesture bar and grows with larger text; labels never break inside
// a word (FitText makes a long one slightly smaller instead).
import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { listChecks } from '../../utils/shelfStore';
import { PICKUP_EVENT } from '../../utils/shelfCamera';
import FitText from '../ui/FitText';
import { CameraIcon, ShoppingCartIcon, Squares2X2Icon, StorefrontIcon } from '../shared/icons';

const item = 'relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-xs font-semibold';
const tone = (active: boolean) => (active ? 'text-cyan-600 dark:text-cyan-300' : 'text-slate-600 dark:text-slate-300');

/** How many shelf checks are unfinished (kept up to date when screens change or photos arrive). */
const useUnfinishedChecks = () => {
  const location = useLocation();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => listChecks().then(checks => live && setCount(checks.filter(c => c.state === 'draft').length)).catch(() => undefined);
    load();
    window.addEventListener(PICKUP_EVENT, load);
    return () => {
      live = false;
      window.removeEventListener(PICKUP_EVENT, load);
    };
  }, [location.pathname]);
  return count;
};

const CounterNav: React.FC = () => {
  const { currentOrder } = useInventory();
  const { t } = useTranslation();
  const unfinished = useUnfinishedChecks();
  const links = [
    { to: '/counter', end: true, label: t('navCounter'), Icon: StorefrontIcon, badge: 0, testId: 'nav-counter' },
    { to: '/counter/orders', end: false, label: t('navOrders'), Icon: ShoppingCartIcon, badge: currentOrder.items.length, testId: 'nav-orders' },
    { to: '/counter/catalog', end: false, label: t('navCatalog'), Icon: Squares2X2Icon, badge: 0, testId: 'nav-catalog' },
    // Last, under the right thumb (v0.1.7, the owner's one-handed placement).
    { to: '/counter/shelf', end: false, label: t('navCamera'), Icon: CameraIcon, badge: unfinished, testId: 'nav-camera' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white pb-safe px-safe dark:border-white/10 dark:bg-[#0b1120]" data-testid="counter-nav">
      <div className="mx-auto flex min-h-[var(--nav-h)] max-w-3xl items-stretch px-1">
        {links.map(({ to, end, label, Icon, badge, testId }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `${item} ${tone(isActive)}`} data-testid={testId}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" />}
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  {!!badge && (
                    <span className="absolute -top-1 -end-2.5 min-w-4 h-4 rounded-full bg-teal-500 px-1 text-[10px] font-bold leading-4 text-white">{badge}</span>
                  )}
                </span>
                <FitText className="text-center leading-tight">{label}</FitText>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default CounterNav;
