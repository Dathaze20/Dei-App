// components/counter/CounterShell.tsx
//
// The Counter screen (opt-in; Classic View stays available). Its own top bar, bottom navigation
// and menu around four places:
//   #/counter           Counter: suppliers and products, one-tap ordering
//   #/counter/orders    Orders: each supplier's part of the order (share, QR, copy, clear)
//   #/counter/catalog   Catalog: products and suppliers (add, edit, shelf tags, delete)
//   #/counter/settings  Settings: store profile, appearance, backup, restore, updates, about
// Everything uses the one saved order, the verified counts and the existing data functions;
// nothing is stored twice. Android Back closes what is open, then returns here to Counter.
import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import StorageStatusBanner from '../StorageStatusBanner';
import { useBackHandler } from '../../hooks/useBackHandler';
import { StartupNotice } from '../../utils/safetyBootstrap';
import CounterDrawer from './CounterDrawer';
import CounterCatalog from './CounterCatalog';
import CounterHome, { CounterMode } from './CounterHome';
import CounterOrders from './CounterOrders';
import CounterSettings from './CounterSettings';
import CounterNav from './CounterNav';
import CounterTopBar from './CounterTopBar';

const CounterShell: React.FC<{ startupNotice?: StartupNotice | null }> = ({ startupNotice = null }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Remembered while the app is open, so switching tabs comes back to the same supplier.
  const [supplierId, setSupplierId] = useState('');
  const [mode, setMode] = useState<CounterMode>('order');
  const onHome = location.pathname === '/counter' || location.pathname === '/counter/';

  // Menu entries open Settings at the right panel.
  useEffect(() => {
    const section = (location.state as { section?: string } | null)?.section;
    if (!section) return;
    const timer = setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }), 350);
    return () => clearTimeout(timer);
  }, [location]);

  useEffect(() => {
    if (!onHome) setSearchOpen(false);
  }, [onHome]);

  // The Counter look for shared panels and dialogs (index.css), only while this screen is open.
  useEffect(() => {
    document.documentElement.classList.add('counter-ui');
    return () => document.documentElement.classList.remove('counter-ui');
  }, []);

  // Android Back on a screen (after any open sheet or menu): close search, else go to Counter.
  // On Counter itself it is not handled, so Android leaves the app as usual.
  useBackHandler(
    searchOpen || !onHome,
    () => {
      if (searchOpen) {
        setQuery('');
        setSearchOpen(false);
      } else navigate('/counter', { replace: true });
    },
    'screen',
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-[#0b1120] dark:text-slate-100" data-testid="counter-screen">
        <CounterTopBar
          onMenu={() => setMenuOpen(true)}
          canSearch={onHome}
          searchOpen={searchOpen}
          query={query}
          onSearchOpen={setSearchOpen}
          onQuery={setQuery}
        />
        <main className="mx-auto max-w-3xl px-3 pt-2 pb-bottom-nav">
          <StorageStatusBanner notice={startupNotice} />
          <Routes>
            <Route
              path="/counter"
              element={<CounterHome query={searchOpen ? query : ''} supplierId={supplierId} onSelectSupplier={setSupplierId} mode={mode} onMode={setMode} />}
            />
            <Route path="/counter/orders" element={<CounterOrders onSelectSupplier={setSupplierId} />} />
            <Route path="/counter/catalog" element={<CounterCatalog />} />
            <Route path="/counter/settings" element={<CounterSettings />} />
            <Route path="*" element={<Navigate to="/counter" replace />} />
          </Routes>
        </main>
        <CounterNav onMenu={() => setMenuOpen(true)} />
        <CounterDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      </div>
    </MotionConfig>
  );
};

export default CounterShell;
