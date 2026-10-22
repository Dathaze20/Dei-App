// components/counter/CounterShell.tsx
//
// DeliOrderNYC's one interface. Top bar, bottom navigation and menu around four places:
//   #/counter           Counter: suppliers and products, ordering and counting
//   #/counter/orders    Orders: each supplier's part of the order (share, QR, copy, clear)
//   #/counter/shelf     Camera: shelf photos (new check, unfinished checks, review, confirm)
//   #/counter/catalog   Catalog: products and suppliers (add, edit, shelf tags, delete)
//   #/counter/settings  Settings: store profile, appearance, backup, restore, updates, about
// Older addresses keep working: #/product/<id> (shelf-tag QR codes) opens that product on Counter,
// #/order opens Orders, #/manage opens Settings, and anything else opens Counter.
// Everything uses the one saved order, the verified counts and the existing data functions;
// nothing is stored twice. Android Back closes what is open, then returns here to Counter.
import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import StorageStatusBanner from '../StorageStatusBanner';
import useInventory from '../../hooks/useInventory';
import { useBackHandler } from '../../hooks/useBackHandler';
import { useDevicePrefs } from '../../hooks/useDevicePrefs';
import { useTranslation } from '../../hooks/useTranslation';
import { withSupplierChosen } from '../../utils/devicePrefs';
import { StartupNotice } from '../../utils/safetyBootstrap';
import { DeliNative, isAndroidApp } from '../../utils/nativeApp';
import { PICKUP_EVENT, Pickup, collectShelfPhotos } from '../../utils/shelfCamera';
import { cameraErrorKey, nativeShelfCamera, pickupNote, shelfPhotoStore } from './shelfCameraApp';
import { ToastProvider, useToast } from '../ui/Toast';
import CounterDrawer from './CounterDrawer';
import CounterCatalog from './CounterCatalog';
import CounterHome from './CounterHome';
import CounterOrders from './CounterOrders';
import CounterSettings from './CounterSettings';
import CounterNav from './CounterNav';
import OrderHistory from './OrderHistory';
import ShelfChecks from './ShelfChecks';
import CounterTopBar from './CounterTopBar';
import StoreOrdering from './StoreOrdering';
import AssistantButton from '../assistant/AssistantButton';
import AssistantSheet from '../assistant/AssistantSheet';
import { StoreProfileProvider } from '../../contexts/StoreProfileContext';

/** #/product/<id> from a shelf-tag QR code: open that product on Counter. */
const ProductLink: React.FC = () => {
  const { productId = '' } = useParams();
  return <Navigate to="/counter" replace state={{ openProduct: productId }} />;
};

const Shell: React.FC<{ startupNotice: StartupNotice | null }> = ({ startupNotice }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { getProductById } = useInventory();
  const { t } = useTranslation();
  const toast = useToast();
  const [prefs, setPrefs] = useDevicePrefs();
  const [menuOpen, setMenuOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  // A product to open, from a shelf-tag link.
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const onHome = location.pathname === '/counter' || location.pathname === '/counter/';

  const selectSupplier = (id: string) => setPrefs(p => withSupplierChosen(p, id));

  // Android: a shelf-tag link (deliordernyc://product/<id>) that opened the app, or arrived while
  // it was open, is picked up from the native side and opened like a #/product/<id> address.
  useEffect(() => {
    if (!isAndroidApp()) return;
    const pick = () => {
      DeliNative.consumeProductLink()
        .then(({ productId }) => {
          if (productId) navigate('/counter', { state: { openProduct: productId } });
        })
        .catch(() => undefined);
    };
    const onVisible = () => document.visibilityState === 'visible' && pick();
    (window as Window & { deliProductLink?: () => void }).deliProductLink = pick;
    pick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      delete (window as Window & { deliProductLink?: () => void }).deliProductLink;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shelf photos: whenever the app starts or comes back, store any photo the camera left in the
  // inbox (also when Android closed the app while the camera was open) and show it in its check.
  useEffect(() => {
    const native = nativeShelfCamera();
    if (!native) return;
    const collect = () => {
      collectShelfPhotos(native, shelfPhotoStore, prefs.lastSupplier || null).catch(error => toast(t(cameraErrorKey(error))));
    };
    const onVisible = () => document.visibilityState === 'visible' && collect();
    collect();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onPickup = (event: Event) => {
      const pickup = (event as CustomEvent<Pickup>).detail;
      if (!pickup.checkId) return;
      // Open the check the photo went into; it shows what happened (pickupNote).
      const target = `/counter/shelf/${pickup.checkId}`;
      if (window.location.hash.replace(/^#/, '') !== target) navigate(target, { state: { note: pickupNote(pickup, t) } });
    };
    window.addEventListener(PICKUP_EVENT, onPickup);
    return () => window.removeEventListener(PICKUP_EVENT, onPickup);
  }, [navigate, t]);

  // Shelf-tag links: show the product's supplier and open the product.
  useEffect(() => {
    const id = (location.state as { openProduct?: string } | null)?.openProduct;
    if (!id) return;
    const product = getProductById(id);
    if (product) {
      selectSupplier(product.supplierId);
      setOpenProductId(product.id);
    } else toast(t('productLinkMissing'));
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Menu entries open Settings at the right section.
  useEffect(() => {
    const section = (location.state as { section?: string } | null)?.section;
    if (!section) return;
    const timer = setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }), 350);
    return () => clearTimeout(timer);
  }, [location]);

  useEffect(() => {
    if (!onHome) setSearchOpen(false);
  }, [onHome]);

  // The Counter look for shared panels and dialogs (index.css), and the chosen density.
  useEffect(() => {
    document.documentElement.classList.add('counter-ui');
    return () => document.documentElement.classList.remove('counter-ui');
  }, []);
  useEffect(() => {
    document.documentElement.dataset.density = prefs.density;
  }, [prefs.density]);

  // Android Back on a screen (after any open sheet or menu): close search, else go to Counter.
  // On Counter itself it is not handled, so Android leaves the app as usual.
  useBackHandler(
    searchOpen || !onHome,
    () => {
      if (searchOpen) {
        setQuery('');
        setSearchOpen(false);
        return true;
      }
      // Read the address now, not from the last render: a second quick Back after reaching
      // Counter must leave the app, even before the screen has finished drawing.
      const path = window.location.hash.replace(/^#/, '').replace(/\/$/, '');
      if (path === '/counter') return false;
      const parent = path === '/counter/orders/history' ? '/counter/orders' : path.startsWith('/counter/shelf/') ? '/counter/shelf' : path === '/counter/store' ? '/counter/settings' : '/counter';
      navigate(parent, { replace: true });
      return true;
    },
    'screen',
  );

  return (
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
            element={
              <CounterHome
                query={searchOpen ? query : ''}
                supplierId={prefs.lastSupplier}
                onSelectSupplier={selectSupplier}
                mode={prefs.mode}
                onMode={mode => setPrefs(p => ({ ...p, mode }))}
                openProductId={openProductId}
                onProductOpened={() => setOpenProductId(null)}
              />
            }
          />
          <Route path="/counter/orders" element={<CounterOrders onSelectSupplier={selectSupplier} />} />
          <Route path="/counter/orders/history" element={<OrderHistory onSelectSupplier={selectSupplier} />} />
          <Route path="/counter/shelf" element={<ShelfChecks />} />
          <Route path="/counter/shelf/:checkId" element={<ShelfChecks />} />
          <Route path="/counter/catalog" element={<CounterCatalog />} />
          <Route path="/counter/settings" element={<CounterSettings />} />
          <Route path="/counter/store" element={<StoreOrdering />} />
          {/* Addresses from before C2.3 (Classic View) and shelf-tag QR codes. */}
          <Route path="/product/:productId" element={<ProductLink />} />
          <Route path="/order" element={<Navigate to="/counter/orders" replace />} />
          <Route path="/manage" element={<Navigate to="/counter/settings" replace />} />
          <Route path="*" element={<Navigate to="/counter" replace />} />
        </Routes>
      </main>
      {/* The assistant: everywhere except where it would cover camera controls or a form. */}
      <AssistantButton
        onOpen={() => setAssistantOpen(true)}
        hidden={searchOpen || /^\/counter\/(shelf\/.+|settings|store)/.test(location.pathname)}
      />
      <AssistantSheet open={assistantOpen} onClose={() => setAssistantOpen(false)} currentSupplierId={prefs.lastSupplier || null} />
      <CounterNav />
      <CounterDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
};

const CounterShell: React.FC<{ startupNotice?: StartupNotice | null }> = ({ startupNotice = null }) => (
  <MotionConfig reducedMotion="user">
    <ToastProvider>
      <StoreProfileProvider>
        <Shell startupNotice={startupNotice} />
      </StoreProfileProvider>
    </ToastProvider>
  </MotionConfig>
);

export default CounterShell;
