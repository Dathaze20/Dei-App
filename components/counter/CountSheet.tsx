// components/counter/CountSheet.tsx
//
// Counting stock at the shelf: a big number, a whole-number keypad, −1/+1, Save and Save & Next.
// All of C1's protections stay: whole numbers only; nothing typed is "no count", never 0; an
// unverified old number is never shown as counted; a count is reported saved only after it is
// really stored; a refused save (blocked, phone did not save) says so and does NOT move on, and
// keeps what was typed. Save & Next walks the products in the order they are on screen.
import React, { useEffect, useRef, useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { SaveCountResult } from '../../contexts/InventoryContext';
import { KeypadKey, keypadUnits, pressKey, saveAndNext, stepCount } from '../../utils/countKeypad';
import { countUnitKey } from '../../utils/countUnits';
import { stockWarning } from '../../utils/stockCounts';
import { formatCountDate } from '../StockLabel';
import ProductThumb from '../ProductThumb';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { BackspaceIcon, MinusIcon, PlusIcon } from '../shared/icons';

interface CountSheetProps {
  productId: string | null;
  /** The counted products in screen order (Save & Next follows it). */
  orderedIds: readonly string[];
  onClose: () => void;
  /** Moves the sheet to another product (Save & Next). */
  onMove: (productId: string) => void;
  /** After a successful save that closes the sheet (shown as a short notice on the screen). */
  onSaved: (message: string) => void;
}

const KEYS: readonly KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace'];

const CountSheet: React.FC<CountSheetProps> = ({ productId, orderedIds, onClose, onMove, onSaved }) => {
  const { getProductById, getStock, saveStockCount } = useInventory();
  const { t, language } = useTranslation();
  const product = productId ? getProductById(productId) : undefined;
  const [text, setText] = useState('');
  // A second tap that lands just after a successful Save & Next must not hit the next product.
  const lastAdvance = useRef(0);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmingOld, setConfirmingOld] = useState(false);
  const [checked, setChecked] = useState(false);

  // A new product starts blank. A message carried over from Save & Next stays until something is typed.
  useEffect(() => {
    setText('');
    setConfirmingOld(false);
    setChecked(false);
  }, [productId]);

  const view = product ? getStock(product) : null;
  const unitWord = product ? t(countUnitKey(product)) : '';
  const name = product ? [product.name, product.flavor].filter(Boolean).join(' ') : '';
  const position = productId ? orderedIds.indexOf(productId) : -1;
  const hasNext = position >= 0 && position < orderedIds.length - 1;
  const disabled = !view || view.state !== 'verified' && view.state !== 'unverified';

  const refusal = (result: SaveCountResult | null) => {
    if (!result || ('reason' in result && result.reason === 'invalid')) return t('countNotSaved', { reason: t('countInvalid') });
    const reason = 'reason' in result && result.reason === 'blocked' ? t('countBlockedReason') : t('countWriteReason');
    return t('countNotSaved', { reason });
  };

  const savedText = (units: number) => t('countSavedFor', { name, count: units, unit: unitWord });

  const edit = (next: string) => {
    setText(next);
    setMessage(null);
  };

  const save = () => {
    if (!product) return;
    const units = keypadUnits(text);
    if (units === null) {
      setMessage({ tone: 'error', text: t('countNotSaved', { reason: t('countInvalid') }) });
      return;
    }
    const result = saveStockCount(product.id, units, 'counter');
    if (!result.ok) {
      setMessage({ tone: 'error', text: refusal(result) });
      return;
    }
    onSaved(savedText(units));
    onClose();
  };

  const saveNext = () => {
    if (!product || Date.now() - lastAdvance.current < 500) return;
    const outcome = saveAndNext(text, product.id, orderedIds, units => saveStockCount(product.id, units, 'counter'));
    if (!outcome.saved) {
      setMessage({ tone: 'error', text: refusal(outcome.result) });
      return;
    }
    const done = outcome.result.ok ? savedText(outcome.result.count.units) : '';
    if (outcome.nextId) {
      lastAdvance.current = Date.now();
      setMessage({ tone: 'ok', text: done });
      onMove(outcome.nextId);
    } else {
      onSaved(`${done} ${t('countEndOfList')}`);
      onClose();
    }
  };

  const useOld = () => {
    if (!product || view?.state !== 'unverified') return;
    const result = saveStockCount(product.id, view.legacyUnits, 'confirmed-legacy');
    if (!result.ok) {
      setMessage({ tone: 'error', text: refusal(result) });
      return;
    }
    setConfirmingOld(false);
    setChecked(false);
    setMessage({ tone: 'ok', text: savedText(view.legacyUnits) });
  };

  // A hardware keyboard works too: digits, Backspace, Enter (Save & Next, or Save at the end).
  useEffect(() => {
    if (!productId || disabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (/^[0-9]$/.test(event.key)) edit(pressKey(text, event.key as KeypadKey));
      else if (event.key === 'Backspace') edit(pressKey(text, 'backspace'));
      else if (event.key === 'Enter') {
        event.preventDefault();
        if (hasNext) saveNext();
        else save();
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  let lastCount: React.ReactNode = null;
  if (view?.state === 'verified') {
    const warning = stockWarning(view, product!);
    const tone = warning === 'out' ? 'text-red-600 dark:text-red-400' : warning === 'low' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300';
    lastCount = (
      <div data-testid="count-last">
        <p className={`font-semibold ${tone}`}>
          {t('lastCountLine', { count: view.units, unit: unitWord, date: formatCountDate(view.countedAt, language, true) })}
        </p>
        {view.previous && (
          <p className={ui.muted}>{t('previousCountLine', { count: view.previous.units, date: formatCountDate(view.previous.countedAt, language, true) })}</p>
        )}
      </div>
    );
  } else if (view?.state === 'unverified') {
    lastCount = <p className="font-semibold text-slate-600 dark:text-slate-300" data-testid="count-last">{t('notCountedYet', { count: view.legacyUnits })}</p>;
  } else if (view?.state === 'unavailable') {
    lastCount = <p className={ui.error} role="alert" data-testid="count-last">{t('countsUnavailableHelp')}</p>;
  }

  return (
    <Sheet
      open={!!product && view?.state !== 'not-tracked'}
      onClose={onClose}
      testId="count-sheet"
      leading={product && <ProductThumb product={product} className="h-12 w-12 rounded-xl" alt="" />}
      title={product ? (product.flavor ? `${product.flavor}` : product.name) : ''}
      subtitle={product && [product.flavor ? product.name : '', product.size].filter(Boolean).join(' · ')}
      footer={
        <div className="space-y-2">
          {hasNext && (
            <button type="button" className={`${ui.primary} w-full`} onClick={saveNext} disabled={disabled}>
              {t('saveAndNext')}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={ui.secondary} onClick={onClose}>{t('cancel')}</button>
            <button type="button" className={hasNext ? ui.secondary : ui.primary} onClick={save} disabled={disabled}>{t('save')}</button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
          <p className={ui.eyebrow}>{t('countHowMany', { unit: unitWord })}</p>
          {position >= 0 && <p className={ui.muted}>{t('countPosition', { index: position + 1, total: orderedIds.length })}</p>}
        </div>
        <div className="text-sm">{lastCount}</div>

        <div
          className={`flex min-h-20 items-center justify-center gap-2 rounded-2xl px-3 ring-2 ${
            message?.tone === 'error' ? 'ring-red-400' : 'ring-cyan-400/60'
          } bg-slate-50 dark:bg-slate-950/60`}
          aria-live="polite"
          data-testid="count-display"
        >
          {text === '' ? (
            <span className="text-2xl font-semibold text-slate-400">{t('countNothingTyped')}</span>
          ) : (
            <>
              <span dir="ltr" className="text-5xl font-extrabold tabular-nums tracking-tight">{text}</span>
              <span className="text-lg font-semibold text-slate-500 dark:text-slate-400">{unitWord}</span>
            </>
          )}
        </div>

        {message && (
          <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? ui.error : ui.ok} data-testid="count-message">
            {message.text}
          </p>
        )}

        <div dir="ltr" className="grid grid-cols-3 gap-2" data-testid="count-keypad">
          {KEYS.map(key => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => edit(pressKey(text, key))}
              aria-label={key === 'backspace' ? t('keypadBackspace') : key === 'clear' ? t('keypadClear') : key}
              className={`min-h-12 rounded-xl text-xl font-bold transition-colors disabled:opacity-40 ${
                key === 'clear' || key === 'backspace'
                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-white/10 dark:text-slate-200'
                  : 'bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 active:bg-cyan-50 dark:bg-slate-800 dark:text-white dark:ring-white/10 dark:active:bg-cyan-500/20'
              }`}
            >
              {key === 'backspace' ? <BackspaceIcon className="mx-auto h-6 w-6" /> : key === 'clear' ? 'C' : key}
            </button>
          ))}
          <button type="button" disabled={disabled} onClick={() => edit(stepCount(text, -1))} aria-label={t('countMinusOne')} className={`${ui.secondary} col-span-1`}>
            <MinusIcon className="h-5 w-5" /> 1
          </button>
          <span />
          <button type="button" disabled={disabled} onClick={() => edit(stepCount(text, 1))} aria-label={t('countPlusOne')} className={`${ui.secondary} col-span-1`}>
            <PlusIcon className="h-5 w-5" /> 1
          </button>
        </div>

        {view?.state === 'unverified' && !confirmingOld && (
          <button type="button" className={`${ui.ghost} w-full`} onClick={() => setConfirmingOld(true)}>
            {t('useOldNumber', { count: view.legacyUnits })}
          </button>
        )}
        {view?.state === 'unverified' && confirmingOld && (
          <div className={`${ui.warn} space-y-2`} data-testid="confirm-old-number">
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 flex-shrink-0 accent-cyan-600" checked={checked} onChange={e => setChecked(e.target.checked)} />
              <span>{t('confirmOldNumberCheck', { count: view.legacyUnits })}</span>
            </label>
            <button type="button" className={`${ui.secondary} w-full`} disabled={!checked} onClick={useOld}>
              {t('confirmOldNumber', { count: view.legacyUnits })}
            </button>
          </div>
        )}
        <p className={`${ui.muted} text-xs`}>{t('stockCountHelp')}</p>
      </div>
    </Sheet>
  );
};

export default CountSheet;
