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
import { ListBulletIcon, PlusIcon, ShareIcon, TrashIcon } from '../shared/icons';
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
  const { removeFromOrder } = useInventory();
  const { t } = useTranslation();
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

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className={`${ui.primary} col-span-2`} onClick={() => onShare(group.supplier.id)}>
          {isList ? <ListBulletIcon className="h-5 w-5" /> : <ShareIcon className="h-5 w-5" />}
          {isList ? t('createList') : t('shareSupplierOrder', { supplier: group.supplier.name })}
        </button>
        {onAddMore && (
          <button type="button" className={ui.secondary} onClick={() => onAddMore(group.supplier.id)}>
            <PlusIcon className="h-5 w-5" /> {t('addMore')}
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
          for (const line of group.lines) removeFromOrder(line.item.productId, line.unit);
          setConfirmClear(false);
        }}
      />
    </section>
  );
};

export default SupplierOrderPanel;
