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
  quantity: number; // number of cases
}

export interface Order {
  items: OrderItem[];
  createdAt: string;
}
