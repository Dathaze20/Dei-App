// components/counter/CounterTopBar.tsx
//
// Compact top bar under the Android status bar: menu, the deli's name, and search one tap away.
// While searching, the camera button reads a barcode from a photo (offline) and searches its UPC.
import React, { useEffect, useRef, useState } from 'react';
import { readBarcode } from '../../utils/barcodeReader';
import { useToast } from '../ui/Toast';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Bars3Icon, CameraIcon, MagnifyingGlassIcon, XIcon } from '../shared/icons';

interface CounterTopBarProps {
  onMenu: () => void;
  canSearch: boolean;
  searchOpen: boolean;
  query: string;
  onSearchOpen: (open: boolean) => void;
  onQuery: (query: string) => void;
}

const iconButton =
  'inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-white/10';

const CounterTopBar: React.FC<CounterTopBarProps> = ({ onMenu, canSearch, searchOpen, query, onSearchOpen, onQuery }) => {
  const { deliName } = useInventory();
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const scanInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const scan = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setScanning(true);
    const code = await readBarcode(file).catch(() => null);
    setScanning(false);
    if (code) onQuery(code);
    else toast(t('scanBarcodeNone'));
  };
  useEffect(() => {
    if (searchOpen) input.current?.focus();
  }, [searchOpen]);

  return (
    <header className="pt-safe sticky top-0 z-40 border-b border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-[#0b1120]">
      <div className="mx-auto flex h-[var(--header-h)] max-w-3xl items-center gap-1 px-1.5">
        <button type="button" onClick={onMenu} aria-label={t('openMenu')} className={iconButton} data-testid="counter-menu-button">
          <Bars3Icon className="h-6 w-6" />
        </button>
        {canSearch && searchOpen ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              ref={input}
              type="search"
              value={query}
              onChange={e => onQuery(e.target.value)}
              placeholder={t('searchProducts')}
              aria-label={t('searchProducts')}
              className="min-h-11 min-w-0 flex-1 appearance-none rounded-xl bg-white px-3 [&::-webkit-search-cancel-button]:appearance-none text-base text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-slate-900 dark:text-white dark:ring-white/15"
            />
            <button type="button" onClick={() => scanInput.current?.click()} aria-label={t('scanBarcode')} className={iconButton} disabled={scanning} data-testid="scan-barcode">
              <CameraIcon className="h-6 w-6" />
            </button>
            <input ref={scanInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={scan} data-testid="scan-barcode-input" />
            <button type="button" onClick={() => { onQuery(''); onSearchOpen(false); }} aria-label={t('closeSearch')} className={iconButton}>
              <XIcon className="h-6 w-6" />
            </button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1 px-1">
              <p className="text-lg font-extrabold leading-tight tracking-tight">
                <span className="block truncate bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent dark:from-cyan-300 dark:to-blue-400">{deliName}</span>
              </p>
            </div>
            {canSearch && (
              <button type="button" onClick={() => onSearchOpen(true)} aria-label={t('searchProducts')} className={iconButton}>
                <MagnifyingGlassIcon className="h-6 w-6" />
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
};

export default CounterTopBar;
