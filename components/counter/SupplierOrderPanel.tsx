// components/counter/SupplierOrderPanel.tsx
//
// One supplier's part of the order: what is in it, an estimate from catalog costs (case
// suppliers only), and the next steps: Share (or Create List for Boar's Head), Add more, Clear.
import React, { useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { SummaryGroup } from '../../utils/orderSummary';
import ConfirmSheet from '../ui/ConfirmSheet';
import { ui } from '../ui/styles';
import { useToast } from '../ui/Toast';
import { ArchiveBoxIcon, ListBulletIcon, PlusIcon, ShareIcon, TrashIcon } from '../shared/icons';
import { useNavigate } from 'react-router-dom';
import { formatCountDate } from '../StockLabel';
import OrderLines, { groupTotals, money } from './OrderLines';

interface SupplierOrderPanelProps {
  group: SummaryGroup;
  onShare: (supplierId: string) => void;
  /** Back to this supplier on the Counter tab. */
  onAddMore?: (supplierId: string) => void;
  /** Hide the heading when the panel is already inside a sheet titled with the supplier. */
  showHeading?: boolean;
}

const SupplierOrderPanel: React.FC<SupplierOrderPanelProps> = ({ group, onShare, onAddMore, showHeading = true }) => {
  const { addToOrder, removeFromOrder, orderHistory } = useInventory();
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const lastSaved = orderHistory.find(entry => entry.supplierId === group.supplier.id);
  const toast = useToast();
  const [confirmClear, setConfirmClear] = useState(false);
  const { lines, units } = groupTotals(group);
  const isList = group.workflow.orderStyle === 'items';
  const unitWord = isList ? t('itemsUnit') : t('casesUnit');

  return (
    <section className={`${ui.card} p-3`} data-testid="supplier-order" data-supplier={group.supplier.id}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-40">
          {showHeading && <h2 dir="auto" className={`${ui.heading} break-words rtl:text-right`}>{group.supplier.name}</h2>}
          <p className={ui.muted} data-testid="supplier-order-counts">{t('linesAndUnits', { lines, units, unit: unitWord })}</p>
        </div>
        {group.subtotal !== null && (
          <div className="ms-auto text-end">
            <p className="text-lg font-extrabold tabular-nums" data-testid="supplier-order-total">{money(group.subtotal)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{group.hasUnpriced ? t('pricedSubtotalEstimate') : t('estimateLabel')}</p>
          </div>
        )}
        {isList && <p className="w-full text-xs text-slate-500 dark:text-slate-400">{t('listNoPrices')}</p>}
      </div>

      <div className="mt-2 border-t border-slate-100 dark:border-white/5">
        <OrderLines group={group} />
      </div>

      {lastSaved && (
        <button
          type="button"
          onClick={() => navigate('/counter/orders/history', { state: { supplier: group.supplier.id } })}
          className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-xl px-1 text-start text-sm text-slate-600 dark:text-slate-300"
          data-testid="last-saved-order"
        >
          <ArchiveBoxIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1">
            {t('lastSavedOrder', { date: formatCountDate(lastSaved.savedAt, language), status: lastSaved.status === 'sent' ? t('statusSent') : t('statusPrepared') })}
          </span>
          <span className="flex-shrink-0 font-semibold text-cyan-700 dark:text-cyan-300">{t('viewShort')}</span>
        </button>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className={`${ui.primary} col-span-2`} onClick={() => onShare(group.supplier.id)}>
          {isList ? <ListBulletIcon className="h-5 w-5" /> : <ShareIcon className="h-5 w-5" />}
          {isList ? t('createList') : t('shareSupplierOrder', { supplier: group.supplier.name })}
        </button>
        {onAddMore && (
          <button type="button" className={ui.secondary} onClick={() => onAddMore(group.supplier.id)}>
            <PlusIcon className="h-5 w-5" /> <span className="min-w-0 truncate">{t('backToSupplier', { supplier: group.supplier.name })}</span>
          </button>
        )}
        <button type="button" className={`${ui.dangerQuiet} ${onAddMore ? '' : 'col-span-2'}`} onClick={() => setConfirmClear(true)}>
          <TrashIcon className="h-5 w-5" /> {t('clearSupplier')}
        </button>
      </div>

      <ConfirmSheet
        open={confirmClear}
        title={t('clearSupplierTitle', { supplier: group.supplier.name })}
        message={t('clearSupplierMessage', { supplier: group.supplier.name, lines })}
        confirmLabel={t('clearSupplier')}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          const removed = group.lines.map(line => ({ id: line.item.productId, unit: line.unit, quantity: line.item.quantity, older: line.olderCaseLine }));
          for (const line of removed) removeFromOrder(line.id, line.unit);
          setConfirmClear(false);
          // Undo puts the lines back, unless one was an older case line (it cannot be re-created as it was).
          const undoable = removed.every(line => !line.older);
          toast(t('supplierCleared', { supplier: group.supplier.name }), undoable ? { label: t('undo'), run: () => removed.forEach(line => addToOrder(line.id, line.quantity)) } : undefined);
        }}
      />
    </section>
  );
};

export default SupplierOrderPanel;
