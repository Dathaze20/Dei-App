// components/ui/ConfirmSheet.tsx
//
// "Are you sure?" for anything that removes data (clear an order, delete a product). Cancel is
// always the first button, and nothing happens until the confirm button is pressed.
import React, { ReactNode } from 'react';
import Sheet from './Sheet';
import { ui } from './styles';
import { useTranslation } from '../../hooks/useTranslation';
import { AlertTriangleIcon } from '../shared/icons';

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
  /** 'danger' (red) for removing data; 'primary' for a safe change. */
  tone?: 'danger' | 'primary';
}

const ConfirmSheet: React.FC<ConfirmSheetProps> = ({ open, title, message, confirmLabel, onConfirm, onCancel, testId = 'confirm-sheet', tone = 'danger' }) => {
  const { t } = useTranslation();
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      testId={testId}
      leading={<AlertTriangleIcon className={`h-7 w-7 flex-shrink-0 ${tone === 'danger' ? 'text-red-500' : 'text-amber-500'}`} />}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={ui.secondary} onClick={onCancel}>{t('cancel')}</button>
          <button type="button" className={tone === 'danger' ? ui.danger : ui.primary} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      }
    >
      <div className="text-[0.9375rem] text-slate-700 dark:text-slate-200">{message}</div>
    </Sheet>
  );
};

export default ConfirmSheet;
