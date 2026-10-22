// components/counter/ShelfChecks.tsx
//
// Shelf photos (the Camera tab): photograph a refrigerator, shelf or backroom during the shift, turn
// the photos into verified counts when there is a moment (utils/shelfCheck.ts). Honest about it:
//   - the camera (or the gallery) takes the photos; they stay on this phone (utils/shelfStore.ts).
//     On Android the camera (and the photo picker) write into a private inbox that survives
//     Android closing the app meanwhile (utils/shelfCamera.ts); the photo then shows in the same check;
//   - products are added by the person, or proposed from a barcode read in a photo (offline);
//   - there is no automatic recognition of packaging or counting yet, and the screen says so;
//   - "visible in photos" and "total on shelf" are separate; only a confirmed total is saved, as a
//     verified count, after one confirmation for the whole check, with Undo right after.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { CameraIcon, ChevronRightIcon, InformationCircleIcon, PhotoIcon, PlusIcon, TrashIcon, XIcon } from '../shared/icons';
import { PICKUP_EVENT, Pickup, captureShelfPhoto } from '../../utils/shelfCamera';
import { cameraErrorKey, nativeShelfCamera, pickupNote, shelfPhotoStore } from './shelfCameraApp';
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

/** The long explanations, behind one button so the photos keep the screen. */
const HelpButton: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={ui.iconButton} onClick={() => setOpen(true)} aria-label={t('shelfHelpButton')} data-testid="shelf-help">
        <InformationCircleIcon className="h-6 w-6" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('shelfHelpButton')} testId="shelf-help-sheet">
        <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
          <p>{t('shelfCheckHelp')}</p>
          <p>{t('shelfNoRecognition')}</p>
          <p>{t('shelfRetention')}</p>
        </div>
      </Sheet>
    </>
  );
};

/** Browser photos (file input): made smaller and stored, then added to the check. */
const addFiles = async (check: ShelfCheck, files: File[]): Promise<{ check: ShelfCheck; failed: boolean }> => {
  let next = check;
  let failed = false;
  for (const file of files) {
    if (next.imageIds.length >= MAX_PHOTOS_PER_CHECK) break;
    try {
      next = withPhoto(next, await putShelfImage(await resizeShelfPhoto(file)));
    } catch {
      failed = true;
    }
  }
  await putCheck(next);
  return { check: next, failed };
};

const numberValue = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null);

const ShelfChecks: React.FC = () => {
  const { checkId } = useParams();
  return checkId ? <CheckView id={checkId} /> : <CheckList />;
};

const CheckList: React.FC = () => {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [prefs] = useDevicePrefs();
  const [checks, setChecks] = useState<ShelfCheck[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const native = nativeShelfCamera();

  const load = useCallback(() => {
    purgeExpired()
      .catch(() => 0)
      .then(listChecks)
      .then(setChecks)
      .catch(() => setFailed(t('photosUnavailable')));
  }, [t]);
  useEffect(load, [load]);
  useEffect(() => {
    window.addEventListener(PICKUP_EVENT, load);
    return () => window.removeEventListener(PICKUP_EVENT, load);
  }, [load]);

  const create = async () => {
    const check = newShelfCheck(prefs.lastSupplier || null);
    await putCheck(check);
    return check;
  };

  // Take photo: on Android a new check opens and the camera starts there; in a browser the camera
  // input opens straight away (it needs this tap) and the check is made when a photo arrives.
  const takePhoto = async (source: 'camera' | 'gallery' = 'camera') => {
    if (!native) return (source === 'gallery' ? gallery : camera).current?.click();
    try {
      const check = await create();
      navigate(`/counter/shelf/${check.id}`, { state: { [source]: true } });
    } catch {
      setFailed(t('photosUnavailable'));
    }
  };

  const fromFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length) return;
    try {
      const { check, failed: some } = await addFiles(await create(), files);
      navigate(`/counter/shelf/${check.id}`, { state: some ? { message: 'photoFailed' } : null });
    } catch {
      setFailed(t('photosUnavailable'));
    }
  };

  // "Count with photos" on the Counter screen starts the camera at once on Android.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !native || !(location.state as { start?: boolean } | null)?.start) return;
    started.current = true;
    navigate(location.pathname, { replace: true, state: null });
    void takePhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const drafts = checks?.filter(c => c.state === 'draft') ?? [];
  return (
    <div className="space-y-3" data-testid="shelf-checks">
      <div className="flex items-center gap-2">
        <h1 className="min-w-0 flex-1 text-lg font-extrabold leading-tight">{t('shelfCheck')}</h1>
        <HelpButton />
      </div>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <button type="button" className={`${ui.primary} min-h-14`} onClick={() => takePhoto('camera')} data-testid="new-shelf-check">
          <CameraIcon className="h-6 w-6" /> {t('shelfNewWithPhoto')}
        </button>
        <button type="button" className={`${ui.secondary} min-h-14`} onClick={() => takePhoto('gallery')} data-testid="new-shelf-gallery">
          <PhotoIcon className="h-6 w-6" /> {t('shelfNewWithGallery')}
        </button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={fromFiles} data-testid="new-shelf-camera-input" />
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={fromFiles} data-testid="new-shelf-gallery-input" />
      {failed && <p role="alert" className={ui.error}>{failed}</p>}
      <section className={`${ui.card} p-3`} data-testid="shelf-unfinished">
        <h2 className={`${ui.eyebrow} mb-1`}>
          {t('shelfDrafts')} {drafts.length > 0 && <span className="ms-1 rounded-full bg-teal-500 px-1.5 text-xs font-bold text-white">{drafts.length}</span>}
        </h2>
        {checks && drafts.length === 0 && <p className={ui.muted}>{t('shelfNoDrafts')}</p>}
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {drafts.map(check => (
            <li key={check.id}>
              <button type="button" className="flex min-h-16 w-full items-center gap-3 py-1.5 text-start" onClick={() => navigate(`/counter/shelf/${check.id}`)} data-testid="shelf-draft">
                {check.imageIds[0] ? <ShelfImage id={check.imageIds[0]} className="h-14 w-14 rounded-lg" /> : <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-200 text-slate-400 dark:bg-slate-700"><CameraIcon className="h-6 w-6" /></span>}
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
  const location = useLocation();
  const native = nativeShelfCamera();

  const reload = useCallback(
    () => getCheck(id).then(found => (found ? setCheck(found) : setMissing(true))).catch(() => setMissing(true)),
    [id],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  // Photos stored from the camera inbox (also after Android reopened the app) show at once.
  useEffect(() => {
    const onPickup = (event: Event) => {
      const pickup = (event as CustomEvent<Pickup>).detail;
      if (pickup.checkId !== id) return;
      void reload();
      setMessage(pickupNote(pickup, t) || null);
    };
    window.addEventListener(PICKUP_EVENT, onPickup);
    return () => window.removeEventListener(PICKUP_EVENT, onPickup);
  }, [id, reload, t]);
  // Opened by "Take photo" from the list, or with a note from the gallery.
  const opened = useRef(false);
  useEffect(() => {
    const state = location.state as { camera?: boolean; gallery?: boolean; message?: 'photoFailed'; note?: string } | null;
    if (opened.current || !check || !state) return;
    opened.current = true;
    navigate(location.pathname, { replace: true, state: null });
    if (state.message) setMessage(t(state.message));
    if (state.note) setMessage(state.note);
    if (state.camera) void takePhoto('camera');
    if (state.gallery) void takePhoto('gallery');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, location.state]);

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
    try {
      const result = await addFiles(check, files);
      setCheck(result.check);
      setMessage(result.failed ? t('photoFailed') : files.length > 1 ? t('shelfPhotosSaved', { count: files.length }) : t('shelfPhotoSaved'));
    } catch {
      setMessage(t('cameraNotStored'));
    }
    setBusy(false);
  };

  // Android: the native camera writes into the inbox; the photo is stored and announced
  // (PICKUP_EVENT), which reloads this check. In a browser: the camera file input.
  const takePhoto = async (source: 'camera' | 'gallery' = 'camera') => {
    if (!native) return (source === 'gallery' ? gallery : camera).current?.click();
    const current = await getCheck(id).catch(() => null);
    if (!current) return;
    setBusy(true);
    setMessage(null);
    try {
      await captureShelfPhoto(native, shelfPhotoStore, current, source);
    } catch (error) {
      setMessage(t(cameraErrorKey(error)));
    }
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
  const full = check.imageIds.length >= MAX_PHOTOS_PER_CHECK;
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
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 font-extrabold leading-tight">
            {t('shelfCheck')} <span className="font-normal text-slate-500 dark:text-slate-400">· {formatCountDate(check.createdAt, language, true)}</span>
          </h1>
          <span className={`${ui.muted} whitespace-nowrap`}>{t('shelfPhotosCount', { count: check.imageIds.length })}</span>
          <HelpButton />
        </div>
        {/* Take and Choose first, then the photos (tap one to see it large). */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" data-testid="shelf-photos">
          <button
            type="button"
            className="flex h-24 w-24 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-cyan-600 px-1 text-center text-xs font-bold leading-tight text-white disabled:opacity-50 dark:bg-cyan-400 dark:text-slate-950"
            disabled={busy || full}
            onClick={() => takePhoto('camera')}
            data-testid="shelf-take-photo"
          >
            <CameraIcon className="h-7 w-7" /> {t('takePhoto')}
          </button>
          <button
            type="button"
            className="flex h-24 w-24 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-white px-1 text-center text-xs font-bold leading-tight text-cyan-700 ring-1 ring-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-cyan-300 dark:ring-white/10"
            disabled={busy || full}
            onClick={() => takePhoto('gallery')}
            data-testid="shelf-choose-photo"
          >
            <PhotoIcon className="h-7 w-7" /> {t('choosePhoto')}
          </button>
          {check.imageIds.map(imageId => (
            <button key={imageId} type="button" onClick={() => setViewing(imageId)} className="flex-shrink-0" aria-label={t('viewShort')} data-testid="shelf-photo">
              <ShelfImage id={imageId} className="h-24 w-24 rounded-xl" />
            </button>
          ))}
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={addPhotos} data-testid="shelf-camera-input" />
        <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} data-testid="shelf-photo-input" />
        {check.imageIds.length === 0 && !message && <p className={ui.muted}>{t('shelfEmptyHint')}</p>}
        {message && <p role="status" className="text-sm font-semibold text-slate-700 dark:text-slate-200" data-testid="shelf-message">{message}</p>}
      </section>

      <section className={`${ui.card} p-3`}>
        {check.items.length === 0 && <p className={`${ui.muted} pb-1`}>{t('shelfNextStep')}</p>}
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
