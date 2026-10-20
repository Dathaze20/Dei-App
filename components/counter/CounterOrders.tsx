// components/counter/CounterOrders.tsx
//
// The Orders tab: an overview, then each supplier's part of the one saved order with its own
// Share (only that supplier's products), Add more (back to that supplier on the Counter tab) and
// Clear. Clearing the whole order asks first.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { buildOrderSummary } from '../../utils/orderSummary';
import ConfirmSheet from '../ui/ConfirmSheet';
import EmptyState from '../ui/EmptyState';
import { ui } from '../ui/styles';
import { ShoppingCartIcon, StorefrontIcon, TrashIcon } from '../shared/icons';
import ShareSheet from './ShareSheet';
import SupplierOrderPanel from './SupplierOrderPanel';
import { money } from './OrderLines';

const CounterOrders: React.FC<{ onSelectSupplier: (id: string) => void }> = ({ onSelectSupplier }) => {
  const { currentOrder, getProductById, getSupplierById, getWorkflow, clearOrder } = useInventory();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sharing, setSharing] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const summary = useMemo(
    () => buildOrderSummary(currentOrder.items, getProductById, getSupplierById, getWorkflow),
    [currentOrder.items, getProductById, getSupplierById, getWorkflow],
  );
  const addMore = (supplierId: string) => {
    onSelectSupplier(supplierId);
    navigate('/counter');
  };

  if (currentOrder.items.length === 0) {
    return (
      <EmptyState
        testId="orders-empty"
        icon={<ShoppingCartIcon className="h-7 w-7" />}
        title={t('orderEmptyTitle')}
        message={t('ordersEmptyHelp')}
        action={
          <button type="button" className={ui.primary} onClick={() => navigate('/counter')}>
            <StorefrontIcon className="h-5 w-5" /> {t('goToCounter')}
          </button>
        }
      />
    );
  }

  const lines = summary.groups.reduce((total, group) => total + group.lines.length, 0);
  return (
    <div className="space-y-3" data-testid="counter-orders">
      <section className={`${ui.card} p-4`} data-testid="orders-overview">
        <h1 className="text-xl font-extrabold">{t('currentOrderTitle')}</h1>
        <p className={ui.muted}>{t('ordersOverview', { suppliers: summary.groups.length, lines })}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.groups.map(group => (
            <a
              key={group.supplier.id}
              href={`#supplier-${group.supplier.id}`}
              onClick={event => {
                event.preventDefault();
                document.getElementById(`supplier-${group.supplier.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-sm font-semibold ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10"
            >
              {group.supplier.name}
              <span className="rounded-full bg-teal-500 px-1.5 text-xs font-bold text-white">{group.lines.length}</span>
            </a>
          ))}
        </div>
        {summary.hasPriced && (
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/5" data-testid="order-total">
            <span className="font-semibold text-slate-600 dark:text-slate-300">{summary.hasUnpriced ? t('pricedSubtotalEstimate') : t('estimatedTotal')}</span>
            <span className="text-2xl font-extrabold tabular-nums">{money(summary.pricedTotal)}</span>
          </div>
        )}
        {summary.hasUnpriced && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('unpricedNote')}</p>}
      </section>

      {summary.groups.map(group => (
        <div key={group.supplier.id} id={`supplier-${group.supplier.id}`} className="scroll-mt-28">
          <SupplierOrderPanel group={group} onShare={setSharing} onAddMore={addMore} />
        </div>
      ))}

      <button type="button" className={`${ui.dangerQuiet} w-full`} onClick={() => setConfirmClear(true)}>
        <TrashIcon className="h-5 w-5" /> {t('clearOrder')}
      </button>

      <ShareSheet supplierId={sharing} onClose={() => setSharing(null)} />
      <ConfirmSheet
        open={confirmClear}
        title={t('clearOrderConfirmationTitle')}
        message={t('clearOrderConfirmationMessage')}
        confirmLabel={t('confirmClear')}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearOrder();
          setConfirmClear(false);
        }}
      />
    </div>
  );
};

export default CounterOrders;
