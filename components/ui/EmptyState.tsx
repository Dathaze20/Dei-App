// components/ui/EmptyState.tsx
import React, { ReactNode } from 'react';
import { ui } from './styles';

const EmptyState: React.FC<{ icon: ReactNode; title: string; message?: string; action?: ReactNode; testId?: string }> = ({ icon, title, message, action, testId }) => (
  <div className={`${ui.card} px-4 py-10 text-center`} data-testid={testId}>
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">{icon}</div>
    <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
    {message && <p className={`mx-auto mt-1 max-w-sm ${ui.muted}`}>{message}</p>}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>
);

export default EmptyState;
