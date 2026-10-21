// components/counter/OrderHistory.tsx
//
// Orders › Order history: saved orders, newest first, filtered by supplier. Each shows its date,
// supplier, lines and units, the estimate (case suppliers), and Prepared or Sent (set only by the
// person). Opening one shows its lines as they were saved and its exact text, with Copy, Text,
// Mark as sent, Use as current order (asks first; replaces only that supplier's lines) and
// Remove from history (asks first).
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { HistoryEntry, unitsOf } from '../../utils/orderHistory';
import { copyText, smsHref } from '../../utils/clipboard';
import { formatCountDate } from '../StockLabel';
import ConfirmSheet from '../ui/ConfirmSheet';
import EmptyState from '../ui/EmptyState';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { useToast } from '../ui/Toast';
import { ArchiveBoxIcon, CheckCircleIcon, CheckIcon, ChevronRightIcon, ClipboardListIcon, EnvelopeIcon, TrashIcon } from '../shared/icons';
import { money } from './OrderLines';

const OrderHistory: React.FC<{ onSelectSupplier: (id: string) => void }> = ({ onSelectSupplier }) => {
  const { orderHistory, historyAvailable, setHistoryStatus, removeHistoryEntry, reuseHistoryOrder } = useInventory();
  const { t, language } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from a supplier's order ("Last saved order"): show that supplier's orders.
  const [filter, setFilter] = useState(() => (location.state as { supplier?: string } | null)?.supplier ?? '');
  const [openId, setOpenId] = useState<string | null>(null);
  // Lines chosen for "Use as current order" (all of them when an order is opened).
  const [chosen, setChosen] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<'reuse' | 'remove' | null>(null);

  const suppliers = useMemo(() => {
    const seen = new Map<string, string>();
    orderHistory.forEach(e => seen.has(e.supplierId) || seen.set(e.supplierId, e.supplierName));
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orderHistory]);
  const shown = filter ? orderHistory.filter(e => e.supplierId === filter) : orderHistory;
  const open = orderHistory.find(e => e.id === openId) ?? null;
  const lineKey = (line: { productId: string; unit: string }) => `${line.productId}|${line.unit}`;
  useEffect(() => setChosen(open ? open.lines.map(lineKey) : []), [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const unitWord = (entry: HistoryEntry) => (entry.lines.every(l => l.unit === 'item') ? t('itemsUnit') : t('casesUnit'));
  const when = (iso: string) => formatCountDate(iso, language, true);

  const header = (
    <section className={`${ui.card} p-3`}>
      <h1 className="text-lg font-extrabold leading-tight">{t('orderHistory')}</h1>
      <p className={ui.muted}>{t('orderHistoryHelp')}</p>
      {suppliers.length > 1 && (
        <div className="mt-2">
          <label htmlFor="history-filter" className="sr-only">{t('supplierLabel')}</label>
          <select id="history-filter" value={filter} onChange={e => setFilter(e.target.value)} className={ui.input} data-testid="history-filter">
            <option value="">{t('historyAllSuppliers')}</option>
            {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      )}
    </section>
  );

  if (!historyAvailable) {
    return (
      <div className="space-y-3" data-testid="order-history">
        {header}
        <p role="alert" className={ui.error}>{t('historyUnavailable')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="order-history">
      {header}
      {shown.length === 0 ? (
        <EmptyState icon={<ArchiveBoxIcon className="h-7 w-7" />} title={t('orderHistory')} message={t('historyEmpty')} testId="history-empty" />
      ) : (
        <ul className={`${ui.card} divide-y divide-slate-100 dark:divide-white/5`}>
          {shown.map(entry => (
            <li key={entry.id}>
              <button type="button" onClick={() => setOpenId(entry.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-start" data-testid="history-entry">
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate font-semibold">{entry.supplierName}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {when(entry.savedAt)} · {t('historyLinesUnits', { lines: entry.lines.length, units: unitsOf(entry), unit: unitWord(entry) })}
                    {entry.subtotal !== null && ` · ${money(entry.subtotal)} ${t('estimateShort')}`}
                  </span>
                </span>
                <span
                  className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                    entry.status === 'sent' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200'
                  }`}
                >
                  {entry.status === 'sent' ? t('statusSent') : t('statusPrepared')}
                </span>
                <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-slate-400 rtl:-scale-x-100" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!open}
        onClose={() => setOpenId(null)}
        testId="history-sheet"
        title={open?.supplierName ?? ''}
        subtitle={open ? `${t('savedOn', { date: when(open.savedAt) })}${open.sentAt ? ` · ${t('sentOn', { when: when(open.sentAt) })}` : ''}` : undefined}
        footer={
          open && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={ui.secondary}
                onClick={async () => toast((await copyText(open.text)) ? t('copied') : t('copyFailed'))}
              >
                <ClipboardListIcon className="h-5 w-5" /> {t('copyText')}
              </button>
              <a href={smsHref(open.text)} className={ui.primary}>
                <EnvelopeIcon className="h-5 w-5" /> {t('sendAsText')}
              </a>
            </div>
          )
        }
      >
        {open && (
          <div className="space-y-3">
            <ul className="divide-y divide-slate-100 dark:divide-white/5" data-testid="history-lines">
              {open.lines.map(line => (
                <li key={lineKey(line)} className="flex items-center gap-2 py-1">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={chosen.includes(lineKey(line))}
                    aria-label={[line.name, line.flavor].filter(Boolean).join(' ')}
                    onClick={() => setChosen(prev => (prev.includes(lineKey(line)) ? prev.filter(k => k !== lineKey(line)) : [...prev, lineKey(line)]))}
                    className="-ms-2 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center"
                    data-testid="history-line-check"
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md ring-2 ${chosen.includes(lineKey(line)) ? 'bg-teal-500 text-white ring-teal-500' : 'ring-slate-300 dark:ring-white/25'}`}>
                      {chosen.includes(lineKey(line)) && <CheckIcon className="h-4 w-4" />}
                    </span>
                  </button>
                  <span className="w-8 flex-shrink-0 text-end font-bold tabular-nums">{line.quantity}</span>
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block break-words font-semibold leading-snug">{[line.name, line.flavor].filter(Boolean).join(' ')}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {[line.size, line.unit === 'item' ? t('itemsUnit') : t('casesUnit'), line.unitPrice !== null ? `${money(line.unitPrice)}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {line.lineTotal !== null && <span className="flex-shrink-0 font-semibold tabular-nums">{money(line.lineTotal)}</span>}
                </li>
              ))}
            </ul>
            {open.subtotal !== null && (
              <p className="flex justify-between border-t border-slate-100 pt-2 font-bold dark:border-white/5">
                <span>{t('estimatedTotal')}</span>
                <span className="tabular-nums">{money(open.subtotal)}</span>
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <button
                type="button"
                className={ui.secondary}
                data-testid="history-status"
                onClick={() => {
                  if (!setHistoryStatus(open.id, open.status === 'sent' ? 'prepared' : 'sent')) toast(t('historySaveFailed'));
                }}
              >
                <CheckCircleIcon className="h-5 w-5" /> {open.status === 'sent' ? t('markPrepared') : t('markSent')}
              </button>
              <button type="button" className={ui.secondary} onClick={() => setConfirm('reuse')} disabled={chosen.length === 0} data-testid="history-reuse">
                <ArchiveBoxIcon className="h-5 w-5" /> {chosen.length === open.lines.length ? t('reuseOrder') : t('reuseSelected', { count: chosen.length })}
              </button>
            </div>
            <details className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10">
              <summary className="cursor-pointer text-sm font-semibold">{t('historyText')}</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs">{open.text}</pre>
            </details>
            <button type="button" className={`${ui.dangerQuiet} w-full`} onClick={() => setConfirm('remove')}>
              <TrashIcon className="h-5 w-5" /> {t('removeFromHistory')}
            </button>
          </div>
        )}
      </Sheet>
      {open && (
        <ConfirmSheet
          open={!!confirm}
          title={confirm === 'reuse' ? t('reuseOrderTitle') : t('removeFromHistory')}
          message={confirm === 'reuse' ? t('reuseOrderMessage', { supplier: open.supplierName }) : t('removeFromHistoryMessage')}
          confirmLabel={confirm === 'reuse' ? t('reuseOrder') : t('removeFromHistory')}
          tone={confirm === 'reuse' ? 'primary' : undefined}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === 'reuse') {
              const { added, missing } = reuseHistoryOrder(open.id, chosen);
              toast(missing ? t('reuseMissing', { added, missing }) : t('reuseDone', { added }));
              setConfirm(null);
              setOpenId(null);
              onSelectSupplier(open.supplierId);
              navigate('/counter/orders');
            } else {
              if (!removeHistoryEntry(open.id)) toast(t('historySaveFailed'));
              setConfirm(null);
              setOpenId(null);
            }
          }}
        />
      )}
    </div>
  );
};

export default OrderHistory;
