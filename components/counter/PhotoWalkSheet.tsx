// components/counter/PhotoWalkSheet.tsx
//
// Adding pictures to many products in one go, one-handed: the sheet shows one product of the
// chosen supplier (in the order it has on the Counter screen), with Take photo, Choose photo and
// Skip. A saved photo moves straight on to the next product that still has no photo, so a whole
// shelf can be photographed without opening an editor each time. Photos are made smaller and
// kept on this phone (utils/photoStore.ts), exactly as in the product editor.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { PHOTO_PREFIX } from '../../utils/productImage';
import { resizeImageFile, savePhoto } from '../../utils/photoStore';
import { groupSupplierProducts } from '../../utils/productGrouping';
import ProductThumb from '../ProductThumb';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { CameraIcon, ChevronRightIcon, PhotoIcon } from '../shared/icons';

interface PhotoWalkSheetProps {
  open: boolean;
  supplierId: string;
  /** Start at this product (from a product's details); otherwise at the first without a photo. */
  startId?: string | null;
  onClose: () => void;
}

const hasPhoto = (imageUrl?: string) => !!imageUrl?.startsWith(PHOTO_PREFIX);

const PhotoWalkSheet: React.FC<PhotoWalkSheetProps> = ({ open, supplierId: initialSupplier, startId = null, onClose }) => {
  const { products, suppliers, getProductById, updateProduct } = useInventory();
  const { t } = useTranslation();
  const [supplierId, setSupplierId] = useState(initialSupplier);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const chooser = useRef<HTMLInputElement>(null);

  // The supplier's products in Counter order, fixed while the sheet is open.
  const order = useMemo(
    () => groupSupplierProducts(supplierId, products).flatMap(group => group.products.map(p => p.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supplierId, open],
  );
  const firstWithoutPhoto = (after = -1) => order.slice(after + 1).find(id => !hasPhoto(getProductById(id)?.imageUrl)) ?? null;

  useEffect(() => {
    if (!open) return;
    setSupplierId(initialSupplier);
    setMessage(null);
  }, [open, initialSupplier]);
  useEffect(() => {
    if (!open) return;
    setCurrentId(startId && order.includes(startId) ? startId : firstWithoutPhoto());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order, startId]);

  const product = currentId ? getProductById(currentId) : undefined;
  const remaining = order.filter(id => !hasPhoto(getProductById(id)?.imageUrl)).length;
  const next = () => setCurrentId(firstWithoutPhoto(order.indexOf(currentId ?? '')));

  const addPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !product) return;
    setBusy(true);
    setMessage(null);
    try {
      let data: string;
      try {
        data = await resizeImageFile(file);
      } catch {
        setMessage({ tone: 'error', text: t('photoFailed') });
        return;
      }
      const id = await savePhoto(data);
      updateProduct({ ...product, imageUrl: `${PHOTO_PREFIX}${id}` });
      setMessage({ tone: 'ok', text: t('photoSavedFor', { name: [product.name, product.flavor].filter(Boolean).join(' ') }) });
      next();
    } catch {
      setMessage({ tone: 'error', text: t('photoStorageFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      testId="photo-walk"
      title={t('addPhotos')}
      subtitle={t('photosStillMissing', { count: remaining, total: order.length })}
      footer={
        product ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={ui.secondary} disabled={busy} onClick={() => chooser.current?.click()}>
              <PhotoIcon className="h-5 w-5" /> {t('choosePhoto')}
            </button>
            <button type="button" className={ui.primary} disabled={busy} onClick={() => camera.current?.click()} data-testid="walk-take">
              <CameraIcon className="h-5 w-5" /> {t('takePhoto')}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {suppliers.length > 1 && (
          <div>
            <label htmlFor="walk-supplier" className={ui.label}>{t('supplierLabel')}</label>
            <select id="walk-supplier" value={supplierId} onChange={e => setSupplierId(e.target.value)} className={ui.input}>
              {[...suppliers].sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        {message && <p role="status" className={message.tone === 'ok' ? ui.ok : ui.error}>{message.text}</p>}
        {product ? (
          <div className="flex items-center gap-4" data-testid="walk-product">
            <ProductThumb product={product} alt="" className="h-28 w-28 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <p dir="auto" className="break-words text-lg font-bold leading-snug">{product.flavor || product.name}</p>
              <p dir="auto" className="break-words text-sm text-slate-500 dark:text-slate-400">
                {[product.flavor ? product.name : '', product.size].filter(Boolean).join(' · ')}
              </p>
              <button type="button" className={`${ui.ghost} mt-1 !px-0`} disabled={busy} onClick={next} data-testid="walk-skip">
                {t('skipProduct')} <ChevronRightIcon className="h-4 w-4 rtl:-scale-x-100" />
              </button>
            </div>
          </div>
        ) : (
          <p className={ui.ok} data-testid="walk-done">{order.length ? t('allHavePhotos') : t('noProductsForSupplier')}</p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('cameraHelp')}</p>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={addPhoto} data-testid="walk-camera-input" />
        <input ref={chooser} type="file" accept="image/*" className="hidden" onChange={addPhoto} data-testid="walk-choose-input" />
      </div>
    </Sheet>
  );
};

export default PhotoWalkSheet;
