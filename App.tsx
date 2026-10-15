import React, { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import OrderPage from './pages/OrderPage';
import ManageProductsPage from './pages/ManageProductsPage';
import BottomNav from './components/BottomNav';
import ProductRedirectPage from './pages/ProductRedirectPage';
import { audioManager } from './utils/audioManager';
import { AnimatePresence } from 'framer-motion';
import { useTranslation } from './hooks/useTranslation';

function App() {
    const location = useLocation();
    const { dir } = useTranslation();

    // Effect to unlock audio on first user interaction
    useEffect(() => {
        const unlockAudio = () => {
            audioManager.unlock();
            // Remove listeners after the first interaction
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchend', unlockAudio);
        };

        window.addEventListener('click', unlockAudio);
        window.addEventListener('keydown', unlockAudio);
        window.addEventListener('touchend', unlockAudio);

        return () => {
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchend', unlockAudio);
        };
    }, []); // Run only once on mount

  return (
    <div dir={dir} className="min-h-screen bg-transparent text-slate-800 dark:text-slate-200 font-sans">
      <Header />
      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto pb-28 md:pb-8">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<HomePage />} />
            <Route path="/order" element={<OrderPage />} />
            <Route path="/manage" element={<ManageProductsPage />} />
            <Route path="/product/:productId" element={<ProductRedirectPage />} />
          </Routes>
        </AnimatePresence>
      </main>
      <BottomNav />
    </div>
  );
}

export default App;