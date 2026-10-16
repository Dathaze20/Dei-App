export interface Supplier {
  id: string;
  name: string;
  color: string;
}

export interface Product {
  id:string;
  name: string;
  category: string;
  supplierId: string;
  flavor: string;
  size: string;
  unitsPerCase: number;
  costPrice: number; // per case
  retailPrice: number; // per unit
  imageUrl?: string;
  reorderThresholdUnits: number;
  currentStockUnits: number;
  upc?: string;
}

export interface OrderItem {
  productId: string;
  /** Whole number. Cases, unless `unit` is 'item'. */
  quantity: number;
  /**
   * Added in C1. 'item' for plain item lines (Boar's Head weekly list). Missing on every line
   * saved before C1 and on all case lines, which keep meaning cases.
   */
  unit?: 'item';
}

export interface Order {
  items: OrderItem[];
  createdAt: string;
}
