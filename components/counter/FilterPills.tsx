// components/counter/FilterPills.tsx
//
// The supplier's sizes, product lines or sections as one row of pills: All | 11.5 oz | 12 oz | …
// Built from the catalog (utils/productGrouping.ts), never a fixed list. The row scrolls sideways
// when it is longer than the screen (the page itself never does); every pill shows its whole text
// and is at least 44px tall. A small number shows how many of its products are in the order.
import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

export interface PillOption {
  key: string;
  label: string;
  count: number;
  inOrder: number;
}

interface FilterPillsProps {
  options: PillOption[];
  value: string;
  onChange: (key: string) => void;
}

const FilterPills: React.FC<FilterPillsProps> = ({ options, value, onChange }) => {
  const { t } = useTranslation();
  const strip = useRef<HTMLDivElement>(null);
  // Keep the chosen pill in view (also after coming back to this supplier).
  useEffect(() => {
    const active = strip.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value]);
  return (
    <div
      ref={strip}
      role="group"
      aria-label={t('filterProducts')}
      data-testid="filter-pills"
      className="-me-3 flex snap-x gap-1.5 overflow-x-auto pe-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map(option => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.key)}
            data-testid="filter-pill"
            className={`flex min-h-11 flex-shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors ${
              active
                ? 'bg-slate-900 text-white dark:bg-cyan-400 dark:text-slate-950'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-white/10'
            }`}
          >
            <span dir="auto">{option.label}</span>
            {option.inOrder > 0 && (
              <span className="min-w-5 rounded-full bg-teal-500 px-1.5 text-center text-xs font-bold text-white" aria-label={t('inOrderShort', { count: option.inOrder })}>
                {option.inOrder}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default FilterPills;
