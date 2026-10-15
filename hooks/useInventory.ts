

import { useContext, useMemo } from 'react';
import { InventoryContext, InventoryContextType } from '../contexts/InventoryContext';

const useInventory = (): InventoryContextType => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};

export default useInventory;