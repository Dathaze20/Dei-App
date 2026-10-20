// components/counter/ShareSheet.tsx
//
// Sharing ONE supplier's part of the order. Case suppliers: the usual order text (QR code, Copy,
// Text). Item-list suppliers (Boar's Head): a clean list to read aloud to the rep, in MEATS and
// CHEESES, with no prices, cases or counts (Copy, Text). Only that supplier's products are in it.
import React, { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { buildItemListText, supplierDraftSummary, supplierDraftText } from '../../utils/supplierDraft';
import { copyText, smsHref } from '../../utils/clipboard';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { CheckCircleIcon, ClipboardListIcon, EnvelopeIcon } from '../shared/icons';

interface ShareSheetProps {
  supplierId: string | null;
  onClose: () => void;
}

const ShareSheet: React.FC<ShareSheetProps> = ({ supplierId, onClose }) => {
  const { currentOrder, getProductById, getSupplierById, getWorkflow, deliName } = useInventory();
  const { t } = useTranslation();
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');
  const supplier = supplierId ? getSupplierById(supplierId) : undefined;
  const isList = !!supplierId && getWorkflow(supplierId).orderStyle === 'items';

  const text = useMemo(() => {
    if (!supplierId) return '';
    if (isList) {
      const group = supplierDraftSummary(currentOrder.items, supplierId, getProductById, getSupplierById, getWorkflow).groups[0];
      return buildItemListText(group, deliName, t) ?? '';
    }
    return supplierDraftText(currentOrder.items, supplierId, getProductById, getSupplierById, deliName, new Date(), t);
  }, [supplierId, isList, currentOrder.items, getProductById, getSupplierById, getWorkflow, deliName, t]);

  const close = () => {
    setCopy('idle');
    onClose();
  };

  const doCopy = async () => {
    setCopy((await copyText(text)) ? 'done' : 'failed');
    setTimeout(() => setCopy('idle'), 2500);
  };

  // The read-aloud list, shown large: headings in capitals, one product per line.
  const listLines = isList ? text.split('\n').slice(2).filter(line => line.trim() !== '') : [];

  return (
    <Sheet
      open={!!supplier}
      onClose={close}
      testId={isList ? 'list-sheet' : 'share-sheet'}
      title={isList ? t('listFor', { supplier: supplier?.name ?? '' }) : t('shareOrderFor', { supplier: supplier?.name ?? '' })}
      subtitle={isList ? t('listHelp') : t('shareHelp')}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={ui.secondary} onClick={doCopy} disabled={!text}>
            {copy === 'done' ? <CheckCircleIcon className="h-5 w-5 text-emerald-500" /> : <ClipboardListIcon className="h-5 w-5" />}
            {copy === 'done' ? t('copied') : t('copyText')}
          </button>
          <a href={text ? smsHref(text) : undefined} className={ui.primary} aria-disabled={!text}>
            <EnvelopeIcon className="h-5 w-5" /> {t('sendAsText')}
          </a>
        </div>
      }
    >
      <div className="space-y-3">
        {copy === 'failed' && <p role="alert" className={ui.error}>{t('copyFailed')}</p>}
        {!text && <p className={ui.muted}>{t('nothingToShare')}</p>}
        {text && isList && (
          <div className={`${ui.card} p-4`} data-testid="read-aloud-list">
            {listLines.map((line, index) =>
              line.startsWith('- ') ? (
                <p key={index} dir="auto" className="py-1 text-lg font-semibold leading-snug rtl:text-right">{line.slice(2)}</p>
              ) : (
                <p key={index} className={`${index > 0 ? 'mt-3' : ''} text-xs font-bold uppercase tracking-widest text-cyan-700 dark:text-cyan-300`}>{line}</p>
              ),
            )}
          </div>
        )}
        {text && !isList && (
          <div className="flex justify-center rounded-2xl bg-slate-100 p-4 dark:bg-slate-950/60" data-testid="share-qr">
            <div className="rounded-xl bg-white p-2">
              <QRCode value={text} size={184} title={t('shareOrderFor', { supplier: supplier?.name ?? '' })} />
            </div>
          </div>
        )}
        {text && (
          <textarea
            readOnly
            value={text}
            aria-label={t('shareTextLabel')}
            className="h-36 w-full rounded-xl bg-white p-3 font-mono text-xs ring-1 ring-slate-200 dark:bg-slate-950/60 dark:ring-white/10"
          />
        )}
      </div>
    </Sheet>
  );
};

export default ShareSheet;
