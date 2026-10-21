// components/counter/ShelfChecks.tsx
//
// Shelf photos: photograph a refrigerator, shelf or backroom during the shift, turn the photos into
// verified counts when there is a moment (utils/shelfCheck.ts). Honest about what it does:
//   - the camera (or the gallery) takes the photos; they stay on this phone (utils/shelfStore.ts);
//   - products are added by the person, or proposed from a barcode read in a photo (offline);
//   - there is no automatic recognition of packaging or counting yet, and the screen says so;
//   - "visible in photos" and "total on shelf" are separate; only a confirmed total is saved, as a
//     verified count, after one confirmation for the whole check, with Undo right after.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useInventory from '../../hooks/useInventory';
import { useDevicePrefs } from '../../hooks/useDevicePrefs';
import { useTranslation } from '../../hooks/useTranslation';
import {
  ShelfCheck, closed, confirmableItems, matchProductByCode, newShelfCheck, withItem, withItemChange, withPhoto, withoutPhoto, MAX_PHOTOS_PER_CHECK,
} from '../../utils/shelfCheck';
import { deleteCheck, deleteShelfImages, getCheck, getShelfImage, listChecks, purgeExpired, putCheck, putShelfImage, resizeShelfPhoto } from '../../utils/shelfStore';
import { readBarcode } from '../../utils/barcodeReader';
import { formatCountDate } from '../StockLabel';
import ProductThumb from '../ProductThumb';
import ConfirmSheet from '../ui/ConfirmSheet';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { useToast } from '../ui/Toast';
import { CameraIcon, ChevronRightIcon, PhotoIcon, PlusIcon, TrashIcon, XIcon } from '../shared/icons';
import ProductPicker from './ProductPicker';

const ShelfImage: React.FC<{ id: string; className: string; alt?: string }> = ({ id, className, alt = '' }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getShelfImage(id).then(data => live && setSrc(data)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id]);
  return src ? <img src={src} alt={alt} className={`${className} object-cover`} decoding="async" /> : <div className={`${className} bg-slate-200 dark:bg-slate-700`} />;
};

const numberValue = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

const ShelfChecks: React.FC = () => {
  const { checkId } = useParams();
  return checkId ? <CheckView id={checkId} /> : <CheckList />;
};

const CheckList: React.FC = () => {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [prefs] = useDevicePrefs();
  const [checks, setChecks] = useState<ShelfCheck[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    purgeExpired()
      .catch(() => 0)
      .then(listChecks)
      .then(setChecks)
      .catch(() => setFailed(true));
  }, []);

  const start = async () => {
    const check = newShelfCheck(prefs.lastSupplier || null);
    try {
      await putCheck(check);
      navigate(`/counter/shelf/${check.id}`);
    } catch {
      setFailed(true);
    }
  };

  const drafts = checks?.filter(c => c.state === 'draft') ?? [];
  return (
    <div className="space-y-3" data-testid="shelf-checks">
      <section className={`${ui.card} space-y-2 p-3`}>
        <h1 className="text-lg font-extrabold leading-tight">{t('shelfCheck')}</h1>
        <p className={ui.muted}>{t('shelfCheckHelp')}</p>
        <button type="button" className={`${ui.primary} w-full`} onClick={start} data-testid="new-shelf-check">
          <CameraIcon className="h-5 w-5" /> {t('newShelfCheck')}
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('shelfRetention')}</p>
      </section>
      {failed && <p role="alert" className={ui.error}>{t('photosUnavailable')}</p>}
      <section className={`${ui.card} p-3`}>
        <h2 className={`${ui.eyebrow} mb-1`}>{t('shelfDrafts')}</h2>
        {checks && drafts.length === 0 && <p className={ui.muted}>{t('shelfNoDrafts')}</p>}
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {drafts.map(check => (
            <li key={check.id}>
              <button type="button" className="flex min-h-14 w-full items-center gap-3 py-1.5 text-start" onClick={() => navigate(`/counter/shelf/${check.id}`)} data-testid="shelf-draft">
                {check.imageIds[0] ? <ShelfImage id={check.imageIds[0]} className="h-12 w-12 rounded-lg" /> : <span className="h-12 w-12 rounded-lg bg-slate-200 dark:bg-slate-700" />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{formatCountDate(check.createdAt, language, true)}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {t('shelfPhotosCount', { count: check.imageIds.length })} · {check.items.length}
                  </span>
                </span>
                <ChevronRightIcon className="h-4 w-4 text-slate-400 rtl:-scale-x-100" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

const CheckView: React.FC<{ id: string }> = ({ id }) => {
  const { products, getProductById, saveStockCount, undoStockCounts, getStock } = useInventory();
  const { t, language } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [check, setCheck] = useState<ShelfCheck | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | 'new' | null>(null);
  const [confirm, setConfirm] = useState<'save' | 'discard' | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCheck(id).then(found => (found ? setCheck(found) : setMissing(true))).catch(() => setMissing(true));
  }, [id]);

  // Every change is saved straight away, so a check survives the phone being put down.
  const update = (next: ShelfCheck) => {
    setCheck(next);
    putCheck(next).catch(() => setMessage(t('photosUnavailable')));
  };

  if (missing) return <p className={ui.error}>{t('photosUnavailable')}</p>;
  if (!check) return null;

  const addPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setMessage(null);
    let next = check;
    for (const file of files) {
      if (next.imageIds.length >= MAX_PHOTOS_PER_CHECK) break;
      try {
        next = withPhoto(next, await putShelfImage(await resizeShelfPhoto(file)));
      } catch {
        setMessage(t('photoFailed'));
      }
    }
    update(next);
    setBusy(false);
  };

  const removePhoto = async (imageId: string) => {
    update(withoutPhoto(check, imageId));
    setViewing(null);
    await deleteShelfImages([imageId]).catch(() => undefined);
  };

  const readCodes = async () => {
    setBusy(true);
    setMessage(null);
    let next = check;
    let found = 0;
    let matched = 0;
    const unknown: string[] = [];
    for (const imageId of check.imageIds) {
      const data = await getShelfImage(imageId).catch(() => null);
      const code = data ? await readBarcode(data).catch(() => null) : null;
      if (!code) continue;
      found++;
      const product = matchProductByCode(code, products);
      if (product) {
        matched++;
        next = withItem(next, { productId: product.id, source: 'barcode', code });
      } else unknown.push(code);
    }
    update(next);
    setBusy(false);
    setMessage(found ? [t('barcodesFound', { found, matched }), ...unknown.map(code => t('barcodeUnknown', { code }))].join(' ') : t('barcodesNone'));
  };

  const ready = confirmableItems(check);
  const save = () => {
    setConfirm(null);
    const saved: { productId: string; units: number; countedAt: string }[] = [];
    for (const item of ready) {
      const result = saveStockCount(item.productId, item.total, 'photo-review');
      if ('count' in result) saved.push({ productId: item.productId, units: result.count.units, countedAt: result.count.countedAt });
    }
    const done = closed(check, 'confirmed', saved);
    update(done);
    toast(t('shelfSaved', { count: saved.length }), {
      label: t('undo'),
      run: () => {
        undoStockCounts(saved);
        update({ ...done, state: 'draft', closedAt: undefined, confirmed: undefined });
      },
    });
    navigate('/counter/shelf');
  };

  const discard = async () => {
    setConfirm(null);
    await deleteCheck(check).catch(() => undefined);
    navigate('/counter/shelf');
  };

  return (
    <div className="space-y-3 pb-24" data-testid="shelf-check">
      <section className={`${ui.card} space-y-2 p-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 flex-1 text-lg font-extrabold leading-tight">{t('shelfCheck')}</h1>
          <span className={ui.muted}>{t('shelfPhotosCount', { count: check.imageIds.length })}</span>
        </div>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" data-testid="shelf-photos">
          {check.imageIds.map(imageId => (
            <button key={imageId} type="button" onClick={() => setViewing(imageId)} className="flex-shrink-0" aria-label={t('viewShort')}>
              <ShelfImage id={imageId} className="h-24 w-24 rounded-xl" />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={ui.primary} disabled={busy || check.imageIds.length >= MAX_PHOTOS_PER_CHECK} onClick={() => camera.current?.click()}>
            <CameraIcon className="h-5 w-5" /> {t('takePhoto')}
          </button>
          <button type="button" className={ui.secondary} disabled={busy || check.imageIds.length >= MAX_PHOTOS_PER_CHECK} onClick={() => gallery.current?.click()}>
            <PhotoIcon className="h-5 w-5" /> {t('choosePhoto')}
          </button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={addPhotos} />
        <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} data-testid="shelf-photo-input" />
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('shelfNoRecognition')}</p>
        {message && <p role="status" className="text-sm text-slate-700 dark:text-slate-200" data-testid="shelf-message">{message}</p>}
      </section>

      <section className={`${ui.card} p-3`}>
        <ul className="divide-y divide-slate-100 dark:divide-white/5" data-testid="shelf-items">
          {check.items.map(item => {
            const product = item.productId ? getProductById(item.productId) : undefined;
            const rejected = item.state === 'rejected';
            const view = product ? getStock(product) : null;
            return (
              <li key={item.id} className={`space-y-2 py-2 ${rejected ? 'opacity-50' : ''}`} data-testid="shelf-item">
                <div className="flex items-center gap-3">
                  {product ? <ProductThumb product={product} alt="" className="h-12 w-12 rounded-lg" /> : <span className="h-12 w-12 rounded-lg bg-slate-200 dark:bg-slate-700" />}
                  <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setPicking(item.id)}>
                    <span dir="auto" className={`block break-words font-semibold leading-snug ${rejected ? 'line-through' : ''}`}>
                      {product ? [product.name, product.flavor].filter(Boolean).join(' ') : t('pickProduct')}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {item.source === 'barcode' ? `${t('provenanceBarcode')} ${item.code ?? ''}` : t('provenanceYou')}
                      {view?.state === 'verified' && ` · ${t('countedInStock', { count: view.units, date: formatCountDate(view.countedAt, language) })}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={ui.iconButton}
                    onClick={() => update(withItemChange(check, item.id, 'state', rejected ? 'proposed' : 'rejected'))}
                    aria-label={rejected ? t('undo') : t('shelfReject')}
                  >
                    {rejected ? <PlusIcon className="h-5 w-5" /> : <XIcon className="h-5 w-5" />}
                  </button>
                </div>
                {!rejected && (
                  <div className="flex flex-wrap items-end gap-2 ps-[3.75rem]">
                    <label className="min-w-0 flex-1 basis-[6.5rem]">
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{t('shelfVisible')}</span>
                      <input
                        inputMode="numeric"
                        value={item.visible ?? ''}
                        onChange={e => update(withItemChange(check, item.id, 'visible', numberValue(e.target.value)))}
                        className={`${ui.input} !min-h-11`}
                        data-testid="shelf-visible"
                      />
                    </label>
                    <label className="min-w-0 flex-1 basis-[6.5rem]">
                      <span className="block text-xs font-semibold">{t('shelfTotal')}</span>
                      <input
                        inputMode="numeric"
                        value={item.total ?? ''}
                        onChange={e => update(withItemChange(check, item.id, 'total', numberValue(e.target.value)))}
                        className={`${ui.input} !min-h-11`}
                        data-testid="shelf-total"
                      />
                    </label>
                    {item.visible !== null && item.total === null && (
                      <button type="button" className={`${ui.ghost} !px-2 text-sm`} onClick={() => update(withItemChange(check, item.id, 'total', item.visible))}>
                        {t('shelfUseVisible')}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-2 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
          <button type="button" className={ui.secondary} onClick={() => setPicking('new')} data-testid="shelf-add-product">
            <PlusIcon className="h-5 w-5" /> {t('shelfAddProduct')}
          </button>
          <button type="button" className={ui.secondary} disabled={busy || check.imageIds.length === 0} onClick={readCodes} data-testid="shelf-read-barcodes">
            {t('readBarcodes')}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-2">
        <button type="button" className={ui.primary} disabled={ready.length === 0} onClick={() => setConfirm('save')} data-testid="shelf-save">
          {t('shelfConfirmCount', { count: ready.length })}
        </button>
        <button type="button" className={ui.dangerQuiet} onClick={() => setConfirm('discard')}>
          <TrashIcon className="h-5 w-5" /> {t('shelfDiscard')}
        </button>
      </div>

      <Sheet open={!!viewing} onClose={() => setViewing(null)} title={t('shelfCheck')} wide testId="shelf-photo-view">
        {viewing && (
          <div className="space-y-2">
            <ShelfImage id={viewing} className="max-h-[60vh] w-full rounded-xl !object-contain" />
            <button type="button" className={`${ui.dangerQuiet} w-full`} onClick={() => removePhoto(viewing)}>
              <TrashIcon className="h-5 w-5" /> {t('removePhotoShort')}
            </button>
          </div>
        )}
      </Sheet>
      <ProductPicker
        open={!!picking}
        supplierId={check.supplierId}
        title={t('pickProduct')}
        onClose={() => setPicking(null)}
        onPick={product => {
          update(picking === 'new' ? withItem(check, { productId: product.id, source: 'owner' }) : withItemChange(check, picking!, 'productId', product.id));
          setPicking(null);
        }}
      />
      <ConfirmSheet
        open={!!confirm}
        title={confirm === 'save' ? t('shelfConfirmTitle') : t('shelfDiscard')}
        message={confirm === 'save' ? t('shelfConfirmMessage', { count: ready.length }) : t('shelfDiscardMessage')}
        confirmLabel={confirm === 'save' ? t('shelfConfirmCount', { count: ready.length }) : t('shelfDiscard')}
        tone={confirm === 'save' ? 'primary' : undefined}
        onCancel={() => setConfirm(null)}
        onConfirm={confirm === 'save' ? save : discard}
      />
    </div>
  );
};

export default ShelfChecks;
