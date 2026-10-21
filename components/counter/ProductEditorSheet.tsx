// components/counter/ProductEditorSheet.tsx
//
// Add or edit a product, with a label on every field (not just greyed-out hints) and every
// attribute the product has. Numbers are checked before saving instead of silently becoming 0.
// Editing keeps everything not shown here (such as the old stock number) exactly as it was.
// Delete asks first and uses the same safety as Classic View: a product whose verified counts
// cannot be kept safely is not deleted, and the reason is shown.
// Picture: choose or take a photo (the system picker; the app asks for nothing until the camera is
// actually used). It is made smaller and kept on this phone (utils/photoStore.ts); the product
// then points at it with "photo:<id>".
import React, { useEffect, useRef, useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Product } from '../../types';
import ProductThumb from '../ProductThumb';
import ShelfTagModal from '../ShelfTagModal';
import { PHOTO_PREFIX } from '../../utils/productImage';
import { resizeImageFile, savePhoto } from '../../utils/photoStore';
import ConfirmSheet from '../ui/ConfirmSheet';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { CameraIcon, PhotoIcon, QrCodeIcon, TrashIcon } from '../shared/icons';

type Fields = Record<'name' | 'flavor' | 'category' | 'supplierId' | 'size' | 'unitsPerCase' | 'reorderThresholdUnits' | 'costPrice' | 'retailPrice' | 'upc' | 'imageUrl', string>;

const toFields = (product: Partial<Product>): Fields => ({
  name: product.name ?? '',
  flavor: product.flavor ?? '',
  category: product.category ?? '',
  supplierId: product.supplierId ?? '',
  size: product.size ?? '',
  unitsPerCase: String(product.unitsPerCase ?? 1),
  reorderThresholdUnits: String(product.reorderThresholdUnits ?? 0),
  costPrice: String(product.costPrice ?? 0),
  retailPrice: String(product.retailPrice ?? 0),
  upc: product.upc ?? '',
  imageUrl: product.imageUrl ?? '',
});

const wholeNumber = (text: string, min: number): number | null => (/^\d+$/.test(text.trim()) && Number(text) >= min ? Number(text) : null);
const price = (text: string): number | null => (/^\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : null);

interface ProductEditorSheetProps {
  /** null: closed; {} with a supplier: new product; a product: edit it. */
  product: Partial<Product> | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

const ProductEditorSheet: React.FC<ProductEditorSheetProps> = ({ product, onClose, onDone }) => {
  const { products, suppliers, addProduct, updateProduct, deleteProduct } = useInventory();
  const { t } = useTranslation();
  const [fields, setFields] = useState<Fields>(() => toFields(product ?? {}));
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTag, setShowTag] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const chooseInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const editing = products.find(p => p.id === product?.id);

  useEffect(() => {
    setFields(toFields(product ?? {}));
    setProblem(null);
    setConfirmDelete(false);
  }, [product]);

  const set = (key: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFields(prev => ({ ...prev, [key]: event.target.value }));
    setProblem(null);
  };

  const addPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setProblem(null);
    let data: string;
    try {
      data = await resizeImageFile(file);
    } catch {
      setPhotoBusy(false);
      return setProblem(t('photoFailed'));
    }
    try {
      const id = await savePhoto(data);
      setFields(prev => ({ ...prev, imageUrl: `${PHOTO_PREFIX}${id}` }));
    } catch {
      setProblem(t('photoStorageFailed'));
    } finally {
      setPhotoBusy(false);
    }
  };
  const isPhoto = fields.imageUrl.startsWith(PHOTO_PREFIX);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const unitsPerCase = wholeNumber(fields.unitsPerCase, 1);
    const reorder = wholeNumber(fields.reorderThresholdUnits, 0);
    const cost = price(fields.costPrice);
    const retail = price(fields.retailPrice);
    if (!fields.name.trim()) return setProblem(t('fieldNameRequired'));
    if (!fields.supplierId) return setProblem(t('fieldSupplierRequired'));
    if (unitsPerCase === null) return setProblem(t('fieldUnitsPerCaseInvalid'));
    if (reorder === null) return setProblem(t('fieldReorderInvalid'));
    if (cost === null || retail === null) return setProblem(t('fieldPriceInvalid'));
    const data = {
      name: fields.name.trim(),
      flavor: fields.flavor.trim(),
      category: fields.category.trim(),
      supplierId: fields.supplierId,
      size: fields.size.trim(),
      unitsPerCase,
      reorderThresholdUnits: reorder,
      costPrice: cost,
      retailPrice: retail,
      upc: fields.upc.trim(),
      imageUrl: fields.imageUrl.trim(),
    };
    // Optional fields a product never had are not added as empty text.
    for (const optional of ['upc', 'imageUrl'] as const) {
      if (!data[optional] && editing && !(optional in editing)) delete (data as Partial<typeof data>)[optional];
    }
    if (editing) updateProduct({ ...editing, ...data });
    else addProduct(data);
    onDone(t('productSaved', { name: [data.name, data.flavor].filter(Boolean).join(' ') }));
  };

  const remove = () => {
    if (!editing) return;
    setConfirmDelete(false);
    const name = [editing.name, editing.flavor].filter(Boolean).join(' ');
    const result = deleteProduct(editing.id);
    if ('reason' in result) {
      const reason = result.reason === 'counts-unavailable' ? t('deleteBlockedUnavailable') : t('deleteBlockedWrite');
      setProblem(t('deleteBlocked', { name, reason }));
      return;
    }
    onDone(t('productDeleted', { name }));
  };

  const field = (key: keyof Fields, label: string, options: { inputMode?: 'numeric' | 'decimal' | 'url'; hint?: string; required?: boolean } = {}) => (
    <div>
      <label htmlFor={`product-${key}`} className={ui.label}>{label}{options.required && <span className="text-red-600"> *</span>}</label>
      <input
        id={`product-${key}`}
        value={fields[key]}
        onChange={set(key)}
        inputMode={options.inputMode}
        dir={options.inputMode ? 'ltr' : 'auto'}
        autoComplete="off"
        className={ui.input}
      />
      {options.hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{options.hint}</p>}
    </div>
  );

  return (
    <>
      <Sheet
        open={!!product}
        onClose={onClose}
        wide
        testId="product-editor"
        title={editing ? t('editProduct') : t('newProduct')}
        subtitle={editing ? [editing.name, editing.flavor].filter(Boolean).join(' ') : undefined}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={ui.secondary} onClick={onClose}>{t('cancel')}</button>
            <button type="submit" form="product-form" className={ui.primary}>{t('saveProduct')}</button>
          </div>
        }
      >
        <form id="product-form" onSubmit={save} className="space-y-3" noValidate>
          {problem && <p role="alert" className={ui.error} data-testid="editor-problem">{problem}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field('name', t('productName'), { required: true })}
            {field('flavor', t('flavorVariant'))}
            <div>
              <label htmlFor="product-supplierId" className={ui.label}>{t('supplierLabel')}<span className="text-red-600"> *</span></label>
              <select id="product-supplierId" value={fields.supplierId} onChange={set('supplierId')} className={ui.input}>
                <option value="" disabled>{t('selectSupplier')}</option>
                {[...suppliers].sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {field('category', t('category'))}
            {field('size', t('sizeLabel'), { hint: t('sizeHint') })}
            {field('unitsPerCase', t('unitsPerCaseLabel'), { inputMode: 'numeric' })}
            {field('reorderThresholdUnits', t('reorderAtLabel'), { inputMode: 'numeric', hint: t('reorderHint') })}
            {field('costPrice', t('costPerCaseLabel'), { inputMode: 'decimal' })}
            {field('retailPrice', t('retailPriceLabel'), { inputMode: 'decimal' })}
            {field('upc', t('upcLabel'), { inputMode: 'numeric' })}
          </div>
          <fieldset className="space-y-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10" data-testid="editor-picture">
            <legend className={`${ui.label} float-start mb-1`}>{t('productPicture')}</legend>
            <div className="clear-both flex flex-wrap items-center gap-3">
              <ProductThumb
                product={{ name: fields.name || '?', flavor: fields.flavor, imageUrl: fields.imageUrl }}
                alt=""
                className="h-[84px] w-[84px] rounded-xl"
              />
              <div className="flex min-w-0 flex-1 basis-40 flex-col gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">{photoBusy ? t('photoSaving') : isPhoto ? t('pictureIsPhoto') : !fields.imageUrl ? t('pictureIsTile') : ''}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={ui.secondary} disabled={photoBusy} onClick={() => chooseInput.current?.click()}>
                    <PhotoIcon className="h-5 w-5" /> {t('choosePhoto')}
                  </button>
                  <button type="button" className={ui.secondary} disabled={photoBusy} onClick={() => cameraInput.current?.click()}>
                    <CameraIcon className="h-5 w-5" /> {t('takePhoto')}
                  </button>
                  {isPhoto && (
                    <button type="button" className={ui.ghost} onClick={() => setFields(prev => ({ ...prev, imageUrl: editing?.imageUrl?.startsWith(PHOTO_PREFIX) ? '' : editing?.imageUrl ?? '' }))}>
                      {t('removePhoto')}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <input ref={chooseInput} type="file" accept="image/*" className="hidden" onChange={addPhoto} data-testid="photo-choose-input" />
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={addPhoto} />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('photoHelp')} {t('cameraHelp')}</p>
            {!isPhoto && field('imageUrl', t('imageUrlLabel'), { inputMode: 'url' })}
          </fieldset>
        </form>

        {editing && (
          <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 dark:border-white/5 sm:grid-cols-2">
            <button type="button" className={ui.secondary} onClick={() => setShowTag(true)}>
              <QrCodeIcon className="h-5 w-5" /> {t('printShelfTag')}
            </button>
            <button type="button" className={ui.dangerQuiet} onClick={() => setConfirmDelete(true)}>
              <TrashIcon className="h-5 w-5" /> {t('deleteProduct')}
            </button>
          </div>
        )}
      </Sheet>
      {editing && (
        <ConfirmSheet
          open={confirmDelete}
          title={t('deleteProductTitle')}
          message={t('deleteProductMessage', { name: [editing.name, editing.flavor].filter(Boolean).join(' ') })}
          confirmLabel={t('deleteProduct')}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
      {editing && showTag && <ShelfTagModal product={editing} isOpen={showTag} onClose={() => setShowTag(false)} />}
    </>
  );
};

export default ProductEditorSheet;
