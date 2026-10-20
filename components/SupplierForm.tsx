import React, { useState } from 'react';
import { Supplier } from '../types';
import { useTranslation } from '../hooks/useTranslation';

interface SupplierFormProps {
  onSave: (supplier: Omit<Supplier, 'id'>) => void;
  onCancel: () => void;
}

const colorOptions = ['bg-red-600', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-400', 'bg-lime-500', 'bg-green-600', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500', 'bg-blue-600', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-600', 'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500', 'bg-slate-700'];

const SupplierForm: React.FC<SupplierFormProps> = ({ onSave, onCancel }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [color, setColor] = useState(colorOptions[9]);
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (name && color) onSave({ name, color }); };
    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="supplier-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('supplierName')}</label>
              <input id="supplier-name" name="name" value={name} onChange={(e) => setName(e.target.value)} className="min-h-11 px-3 border rounded-lg w-full bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600 focus:ring-brand-primary focus:border-brand-primary" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('supplierColor')}</label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map(c => (<button type="button" key={c} onClick={() => setColor(c)} className={`w-11 h-11 rounded-full transition-transform transform hover:scale-110 ${c} ${color === c ? 'ring-2 ring-offset-2 dark:ring-offset-slate-800 ring-brand-primary' : ''}`} aria-label={t('selectColor', { color: c })} aria-pressed={color === c} />))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={onCancel} className="min-h-11 px-4 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 font-semibold">{t('cancel')}</button>
                <button type="submit" className="min-h-11 px-4 rounded-lg bg-brand-primary text-white hover:bg-brand-primary-hover font-semibold">{t('saveSupplier')}</button>
            </div>
        </form>
    );
};

export default SupplierForm;