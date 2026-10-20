// components/counter/CounterShell.tsx
//
// The Counter screen (opt-in; Classic View stays available). Its own top bar, bottom navigation
// and menu around four places:
//   #/counter           Counter: suppliers and products, one-tap ordering
//   #/counter/orders    Orders: the existing order page (share, QR, copy, clear)
//   #/counter/catalog   Catalog: products and suppliers (add, edit, shelf tags, delete)
//   #/counter/settings  Settings: store name, screen style, updates, backup and restore
// It reuses the existing pages and the one saved order; nothing is stored twice.
import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import OrderPage from '../../pages/OrderPage';
import ManageProductsPage from '../../pages/ManageProductsPage';
import StorageStatusBanner from '../StorageStatusBanner';
import { StartupNotice } from '../../utils/safetyBootstrap';
import CounterDrawer from './CounterDrawer';
import CounterHome from './CounterHome';
import CounterNav from './CounterNav';
import CounterTopBar from './CounterTopBar';

const CounterShell: React.FC<{ startupNotice?: StartupNotice | null }> = ({ startupNotice = null }) => {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Remembered while the app is open, so switching tabs comes back to the same supplier.
  const [supplierId, setSupplierId] = useState('');
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
            <Route path="/counter" element={<CounterHome query={searchOpen ? query : ''} supplierId={supplierId} onSelectSupplier={setSupplierId} />} />
            <Route path="/counter/orders" element={<OrderPage />} />
            <Route path="/counter/catalog" element={<ManageProductsPage sections="catalog" uiMode="counter" />} />
            <Route path="/counter/settings" element={<ManageProductsPage sections="settings" uiMode="counter" />} />
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
