import React, { useRef } from 'react';
import QRCode from 'react-qr-code';
import { Product } from '../types';
import Modal from './Modal';
import { isAndroidApp } from '../utils/nativeApp';
import { useTranslation } from '../hooks/useTranslation';

interface ShelfTagModalProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

const ShelfTagModal: React.FC<ShelfTagModalProps> = ({ product, isOpen, onClose }) => {
  const { t } = useTranslation();
  const tagRef = useRef<HTMLDivElement>(null);
  // In the Android app the page's own address is https://localhost, which no other phone or camera
  // can open, so the code carries the app's link instead: Android hands deliordernyc://product/<id>
  // to DeliOrderNYC on any phone that has it installed. The web version keeps its web address.
  const android = isAndroidApp();
  const deepLink = android
    ? `deliordernyc://product/${encodeURIComponent(product.id)}`
    : `${window.location.origin}${window.location.pathname}#/product/${product.id}`;

  const handlePrint = () => {
    const printContents = tagRef.current?.innerHTML;
    const originalContents = document.body.innerHTML;
    if (printContents) {
      document.body.innerHTML = printContents;
      window.print();
      document.body.innerHTML = originalContents;
      window.location.reload(); // Reload to re-initialize React app state
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('shelfTagTitle')}>
      <div className="flex flex-col items-center gap-6">
        <div 
          ref={tagRef} 
          className="bg-white p-4 border-2 border-dashed border-slate-400 w-full max-w-sm"
          id="shelf-tag"
        >
          <div className="text-center pb-2 border-b border-slate-300">
            <h3 className="text-xl font-bold text-black">{product.name}</h3>
            <p className="text-md text-slate-700">{product.flavor}</p>
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="text-left">
              <p className="text-4xl font-extrabold text-black">
                ${product.retailPrice.toFixed(2)}
              </p>
              <p className="text-xs text-slate-600">{t('perUnit', { unit: product.size })}</p>
            </div>
            <div className="bg-white p-1 border border-slate-200">
                <QRCode value={deepLink} size={80} level="M" fgColor="#0ea5e9" title={t('qrCodeTitle', { productName: product.name })} />
            </div>
          </div>
        </div>

        {android ? (
          // The Android WebView cannot print: say so instead of offering a Print button that would
          // only reload the app (docs/V0.1.3_NOTES.md).
          <p className="text-center text-sm text-slate-600 dark:text-slate-300" data-testid="shelf-tag-android-note">{t('shelfTagAndroidNote')}</p>
        ) : (
        <button
          onClick={handlePrint}
          className="bg-brand-primary hover:bg-brand-primary-hover text-white font-bold py-2 px-6 rounded-lg transition-colors active:scale-98"
        >
          {t('printTag')}
        </button>
        )}
      </div>
    </Modal>
  );
};

export default ShelfTagModal;