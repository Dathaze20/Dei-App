// components/ui/Segmented.tsx
//
// A row of mutually exclusive choices (Order | Count, Light | Dark, languages, screen style).
import React from 'react';

interface SegmentedProps<V extends string> {
  label: string;
  value: V;
  options: readonly { value: V; label: string; testId?: string }[];
  onChange: (value: V) => void;
  className?: string;
}

const Segmented = <V extends string>({ label, value, options, onChange, className = '' }: SegmentedProps<V>) => (
  <div role="group" aria-label={label} className={`flex gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-white/5 ${className}`}>
    {options.map(option => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={active}
          data-testid={option.testId}
          onClick={() => onChange(option.value)}
          className={`min-h-11 min-w-0 flex-1 rounded-xl px-2 text-sm font-semibold transition-colors ${
            active
              ? 'bg-white text-cyan-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-cyan-300 dark:ring-white/10'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
          }`}
        >
          <span className="block break-words leading-tight">{option.label}</span>
        </button>
      );
    })}
  </div>
);

export default Segmented;
