
import React from 'react';
import { Supplier } from '../types';

interface SupplierChipProps {
  supplier: Supplier;
}

const SupplierChip: React.FC<SupplierChipProps> = ({ supplier }) => {
  return (
    <div className={`text-xs font-semibold px-2.5 py-1 rounded-full text-white ${supplier.color}`}>
      {supplier.name}
    </div>
  );
};

export default SupplierChip;
