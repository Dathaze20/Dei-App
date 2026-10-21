// components/counter/ImportSheet.tsx
//
// Catalog › Import products (CSV): choose a file, see every row checked (utils/csvImport.ts),
// untick any row, then add only the approved ones. Rows already in the catalog, repeated rows and
// rows that need fixing are listed with the reason and never added. Nothing is saved until
// "Add N products"; existing products, counts and orders are never changed.
import React, { useRef, useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { CSV_TEMPLATE, ImportRow, MAX_IMPORT_ROWS, planImport } from '../../utils/csvImport';
import { saveTextFile } from '../../utils/fileDownload';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { ArrowDownTrayIcon, CheckIcon } from '../shared/icons';

type Key = Parameters<ReturnType<typeof useTranslation>['t']>[0];

interface ImportSheetProps {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

const ImportSheet: React.FC<ImportSheetProps> = ({ open, onClose, onDone }) => {
  const { products, suppliers, getWorkflow, addProducts } = useInventory();
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setRows(null);
    setUnknown([]);
    setApproved(new Set());
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const readFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    reset();
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setError(t('importErrorRead'));
    }
    const plan = planImport(text, products, suppliers, getWorkflow);
    if ('error' in plan) {
      return setError(plan.error === 'empty' ? t('importErrorEmpty') : plan.error === 'no-header' ? t('importErrorHeader') : t('importErrorRows', { max: MAX_IMPORT_ROWS }));
    }
    setRows(plan.rows);
    setUnknown(plan.unknownColumns);
    setApproved(new Set(plan.rows.filter(r => r.status === 'ready').map(r => r.line)));
  };

  const toggle = (line: number) =>
    setApproved(prev => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });

  const confirm = () => {
    if (!rows) return;
    const batch = rows.filter(r => r.status === 'ready' && approved.has(r.line) && r.product).map(r => r.product!);
    const added = addProducts(batch);
    reset();
    onDone(t('importDone', { count: added }));
  };

  const count = (status: ImportRow['status']) => rows?.filter(r => r.status === status).length ?? 0;
  const reason = (row: ImportRow) =>
    row.status === 'exists' ? t('importStatusExists')
    : row.status === 'duplicate' ? t('importStatusDuplicate')
    : row.problems.map(p => t(`problem_${p}` as Key)).join(' · ');

  return (
    <Sheet
      open={open}
      onClose={close}
      wide
      testId="import-sheet"
      title={t('importProducts')}
      subtitle={rows ? undefined : t('importHelp')}
      footer={
        rows ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={ui.secondary} onClick={() => input.current?.click()}>{t('chooseAnotherFile')}</button>
            <button type="button" className={ui.primary} onClick={confirm} disabled={approved.size === 0} data-testid="import-confirm">
              {t('importAddSelected', { count: approved.size })}
            </button>
          </div>
        ) : undefined
      }
    >
      <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={readFile} data-testid="import-input" />
      {!rows && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('importColumns')}</p>
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            <button type="button" className={ui.primary} onClick={() => input.current?.click()}>{t('chooseCsv')}</button>
            <button type="button" className={ui.secondary} onClick={() => saveTextFile('deliordernyc-products-template.csv', CSV_TEMPLATE, 'text/csv')}>
              <ArrowDownTrayIcon className="h-5 w-5" /> {t('downloadTemplate')}
            </button>
          </div>
          {error && <p role="alert" className={ui.error}>{error}</p>}
        </div>
      )}
      {rows && (
        <div className="space-y-3" data-testid="import-preview">
          <ul className="grid grid-cols-1 gap-1 text-sm font-semibold min-[380px]:grid-cols-2">
            <li className="text-emerald-700 dark:text-emerald-300">{t('importReady', { count: count('ready') })}</li>
            <li className="text-slate-600 dark:text-slate-300">{t('importExists', { count: count('exists') })}</li>
            <li className="text-slate-600 dark:text-slate-300">{t('importDuplicate', { count: count('duplicate') })}</li>
            <li className="text-red-700 dark:text-red-300">{t('importInvalid', { count: count('invalid') })}</li>
          </ul>
          {unknown.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{t('importUnknownColumns', { columns: unknown.join(', ') })}</p>}
          {rows.length === 0 && <p className={ui.muted}>{t('importNothing')}</p>}
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {rows.map(row => {
              const ready = row.status === 'ready';
              const name = [row.label.name, row.label.flavor, row.label.size].filter(Boolean).join(' · ') || '—';
              return (
                <li key={row.line} className="flex items-start gap-2 py-2" data-testid="import-row" data-status={row.status}>
                  {ready ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={approved.has(row.line)}
                      aria-label={name}
                      onClick={() => toggle(row.line)}
                      className="-ms-2 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center"
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-md ring-2 ${approved.has(row.line) ? 'bg-teal-500 text-white ring-teal-500' : 'ring-slate-300 dark:ring-white/25'}`}>
                        {approved.has(row.line) && <CheckIcon className="h-4 w-4" />}
                      </span>
                    </button>
                  ) : (
                    <span className="-ms-2 h-11 w-11 flex-shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1 py-1">
                    <p dir="auto" className="break-words font-semibold leading-snug">{name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('importLine', { line: row.line })}
                      {row.label.supplier && ` · ${row.label.supplier}`}
                      {row.product && row.product.costPrice > 0 && ` · $${row.product.costPrice.toFixed(2)}`}
                    </p>
                    {!ready && <p className={`text-xs font-semibold ${row.status === 'invalid' ? 'text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'}`}>{reason(row)}</p>}
                    {row.warnings.map(w => <p key={w} className="text-xs text-amber-700 dark:text-amber-300">{t(`warning_${w}` as Key)}</p>)}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Sheet>
  );
};

export default ImportSheet;
