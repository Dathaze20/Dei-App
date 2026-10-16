import React, { createContext, useState, useEffect, useCallback, useRef, useSyncExternalStore, ReactNode } from 'react';
import { Product, Supplier, Order, OrderItem } from '../types';
import { audioManager } from '../utils/audioManager';
import { getGuardState, guardedSetItem, isKeyBlocked, loadGuarded, subscribeGuard } from '../utils/storageGuard';
import { OrderUnit, SupplierWorkflow, lineUnit, newLineUnit, resolveSupplierWorkflow } from '../utils/supplierWorkflow';
import {
  STOCK_COUNTS_KEY,
  StockCount,
  StockCountsDoc,
  StockView,
  emptyStockCounts,
  getStockView,
  isValidCountUnits,
  retireProductCounts,
  usedProductIds,
  withCount,
} from '../utils/stockCounts';

const initialSuppliers: Supplier[] = [
  { id: 'sup1', name: "Boar's Head", color: 'bg-red-800' },
  { id: 'sup2', name: 'Snapple', color: 'bg-sky-500' },
  { id: 'sup3', name: 'PepsiCo', color: 'bg-blue-700' },
  { id: 'sup4', name: 'Frito-Lay', color: 'bg-orange-500' },
  { id: 'sup5', name: 'Coca-Cola', color: 'bg-red-600' },
  { id: 'sup6', name: 'Arizona', color: 'bg-teal-400' },
  { id: 'sup7', name: 'Red Bull', color: 'bg-slate-600' },
  { id: 'sup8', name: 'Wise Foods', color: 'bg-yellow-500' },
  { id: 'sup9', name: 'Utz', color: 'bg-blue-900' },
  { id: 'sup10', name: 'Monster Energy', color: 'bg-lime-500' },
  { id: 'sup11', name: "Welch's", color: 'bg-purple-800' },
  { id: 'sup12', name: 'Fruit Guy', color: 'bg-lime-600' },
  { id: 'sup13', name: 'Candy Guy', color: 'bg-pink-600' },
];

const initialProductsRaw: Omit<Product, 'reorderThresholdUnits' | 'currentStockUnits'>[] = [
  // Boar's Head (sup1)
  { id: 'bh_turkey', name: "OvenGold Turkey Breast", flavor: "Roasted", category: "Deli Meat", supplierId: "sup1", size: "per lb", unitsPerCase: 10, costPrice: 70, retailPrice: 14.99, imageUrl: 'https://placehold.co/400x400/d4af37/ffffff?text=Turkey' },
  { id: 'bh_ham', name: "Deluxe Ham", flavor: "Sweet", category: "Deli Meat", supplierId: "sup1", size: "per lb", unitsPerCase: 8, costPrice: 65, retailPrice: 13.99, imageUrl: 'https://placehold.co/400x400/e0a0a0/ffffff?text=Ham' },
  { id: 'bh_roastbeef', name: "Roast Beef", flavor: "Top Round", category: "Deli Meat", supplierId: "sup1", size: "per lb", unitsPerCase: 7, costPrice: 90, retailPrice: 18.99, imageUrl: 'https://placehold.co/400x400/8b4513/ffffff?text=Roast+Beef' },
  { id: 'bh_provolone', name: "Provolone Cheese", flavor: "Mild", category: "Deli Cheese", supplierId: "sup1", size: "per lb", unitsPerCase: 12, costPrice: 60, retailPrice: 12.99, imageUrl: 'https://placehold.co/400x400/f5f5dc/000000?text=Provolone' },
  { id: 'bh_american', name: "American Cheese", flavor: "White", category: "Deli Cheese", supplierId: "sup1", size: "per lb", unitsPerCase: 12, costPrice: 55, retailPrice: 11.99, imageUrl: 'https://placehold.co/400x400/f0e68c/000000?text=American+Cheese' },

  // Snapple (sup2)
  { id: 'prod_snp1', name: 'Snapple', flavor: 'Peach Tea', category: 'Beverage', supplierId: 'sup2', size: '16oz Bottle', unitsPerCase: 12, costPrice: 12.00, retailPrice: 2.50, imageUrl: 'https://placehold.co/400x400/ffb3a7/000000?text=Snapple+Peach', upc: '076183000608' },
  { id: 'prod_snp2', name: 'Snapple', flavor: 'Lemon Tea', category: 'Beverage', supplierId: 'sup2', size: '16oz Bottle', unitsPerCase: 12, costPrice: 12.00, retailPrice: 2.50, imageUrl: 'https://placehold.co/400x400/fff44f/000000?text=Snapple+Lemon', upc: '076183000509' },
  { id: 'prod_snp5', name: 'Snapple', flavor: 'Diet Peach Tea', category: 'Beverage', supplierId: 'sup2', size: '16oz Bottle', unitsPerCase: 12, costPrice: 12.00, retailPrice: 2.50, imageUrl: 'https://placehold.co/400x400/d3d3d3/ffb3a7?text=Diet+Peach', upc: '076183001803' },
  { id: 'prod_snp_apple', name: 'Snapple', flavor: 'Apple', category: 'Beverage', supplierId: 'sup2', size: '16oz Bottle', unitsPerCase: 12, costPrice: 12.00, retailPrice: 2.50, imageUrl: 'https://placehold.co/400x400/f83838/ffffff?text=Snapple+Apple', upc: '076183000400' },
  { id: 'prod_snp_kiwi', name: 'Snapple', flavor: 'Kiwi Strawberry', category: 'Beverage', supplierId: 'sup2', size: '16oz Bottle', unitsPerCase: 12, costPrice: 12.00, retailPrice: 2.50, imageUrl: 'https://placehold.co/400x400/87c863/ffffff?text=Snapple+Kiwi', upc: '076183001209' },
  
  // PepsiCo (sup3)
  { id: 'pep_orig_bot20', name: 'Pepsi', flavor: 'Original', category: 'Beverage', supplierId: 'sup3', size: '20oz Bottle', unitsPerCase: 24, costPrice: 24, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/005cb4/ffffff?text=Pepsi', upc: '012000813312' },
  { id: 'pep_diet_bot20', name: 'Pepsi', flavor: 'Diet Pepsi', category: 'Beverage', supplierId: 'sup3', size: '20oz Bottle', unitsPerCase: 24, costPrice: 24, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/d9d9d9/005cb4?text=Diet+Pepsi', upc: '012000813329'},
  { id: 'pep_zero_bot20', name: 'Pepsi', flavor: 'Zero Sugar', category: 'Beverage', supplierId: 'sup3', size: '20oz Bottle', unitsPerCase: 24, costPrice: 24, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/000000/ffffff?text=Pepsi+Zero', upc: '012000171739' },
  { id: 'pep_cherry_bot20', name: 'Pepsi', flavor: 'Wild Cherry', category: 'Beverage', supplierId: 'sup3', size: '20oz Bottle', unitsPerCase: 24, costPrice: 24, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/701f37/ffffff?text=Pepsi+Cherry', upc: '012000813428' },
  { id: 'mtd_orig_bot20', name: 'Mountain Dew', flavor: 'Original', category: 'Beverage', supplierId: 'sup3', size: '20oz Bottle', unitsPerCase: 24, costPrice: 25, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/95c11f/000000?text=Mtn+Dew', upc: '012000813350' },
  { id: 'mtd_code_red_bot20', name: 'Mountain Dew', flavor: 'Code Red', category: 'Beverage', supplierId: 'sup3', size: '20oz Bottle', unitsPerCase: 24, costPrice: 25, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/e6001a/ffffff?text=Mtn+Dew+Code+Red' },
  { id: 'mtd_baja_splash_bot20', name: 'Mountain Dew', flavor: 'Baja Splash', category: 'Beverage', supplierId: 'sup3', size: '20oz Bottle', unitsPerCase: 24, costPrice: 25, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/00a5a5/ffffff?text=Mtn+Dew+Baja+Splash' },
  { id: 'mtd_voltage_bot20', name: 'Mountain Dew', flavor: 'Voltage', category: 'Beverage', supplierId: 'sup3', size: '20oz Bottle', unitsPerCase: 24, costPrice: 25, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/0078c1/ffffff?text=Mtn+Dew+Voltage' },
  { id: 'schw_selt_orig_can12', name: 'Schweppes Seltzer', flavor: 'Original', category: 'Beverage', supplierId: 'sup3', size: '12oz Can', unitsPerCase: 12, costPrice: 14, retailPrice: 1.50, imageUrl: 'https://placehold.co/400x400/d1d5db/000000?text=Schweppes+Original' },
  { id: 'schw_selt_lemlime_can12', name: 'Schweppes Seltzer', flavor: 'Lemon Lime', category: 'Beverage', supplierId: 'sup3', size: '12oz Can', unitsPerCase: 12, costPrice: 14, retailPrice: 1.50, imageUrl: 'https://placehold.co/400x400/a3d1b0/000000?text=Schweppes+Lemon+Lime' },
  { id: 'schw_selt_cranlime_can12', name: 'Schweppes Seltzer', flavor: 'Cranberry Lime', category: 'Beverage', supplierId: 'sup3', size: '12oz Can', unitsPerCase: 12, costPrice: 14, retailPrice: 1.50, imageUrl: 'https://placehold.co/400x400/d92751/ffffff?text=Schweppes+Cran+Lime' },
  { id: 'schw_selt_blcherry_can12', name: 'Schweppes Seltzer', flavor: 'Black Cherry', category: 'Beverage', supplierId: 'sup3', size: '12oz Can', unitsPerCase: 12, costPrice: 14, retailPrice: 1.50, imageUrl: 'https://placehold.co/400x400/5c000f/ffffff?text=Schweppes+Black+Cherry' },
  { id: 'schw_selt_grape_can12', name: 'Schweppes Seltzer', flavor: 'Grape', category: 'Beverage', supplierId: 'sup3', size: '12oz Can', unitsPerCase: 12, costPrice: 14, retailPrice: 1.50, imageUrl: 'https://placehold.co/400x400/6f2da8/ffffff?text=Schweppes+Grape' },
  { id: 'schw_selt_whpeach_can12', name: 'Schweppes Seltzer', flavor: 'White Peach', category: 'Beverage', supplierId: 'sup3', size: '12oz Can', unitsPerCase: 12, costPrice: 14, retailPrice: 1.50, imageUrl: 'https://placehold.co/400x400/fdd9b5/000000?text=Schweppes+White+Peach' },
  { id: 'schw_selt_orange_can12', name: 'Schweppes Seltzer', flavor: 'Orange', category: 'Beverage', supplierId: 'sup3', size: '12oz Can', unitsPerCase: 12, costPrice: 14, retailPrice: 1.50, imageUrl: 'https://placehold.co/400x400/ffaa33/000000?text=Schweppes+Orange' },

  // Frito-Lay (sup4)
  { id: 'prod_dor1', name: 'Doritos', flavor: 'Nacho Cheese', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/ff4500/ffffff?text=Doritos+Nacho', upc: '028400090896' },
  { id: 'prod_dor2', name: 'Doritos', flavor: 'Cool Ranch', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/0078c1/ffffff?text=Doritos+Cool+Ranch', upc: '028400091145' },
  { id: 'dor_spicy_nacho', name: 'Doritos', flavor: 'Spicy Nacho', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/e63946/ffffff?text=Spicy+Nacho' },
  { id: 'dor_bbq', name: 'Doritos', flavor: 'Barbecue', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/a52a2a/ffffff?text=Doritos+BBQ' },
  { id: 'dor_sriracha', name: 'Doritos', flavor: 'Sriracha', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/a4161a/ffffff?text=Doritos+Sriracha' },
  { id: 'dor_sweet_tangy_bbq', name: 'Doritos', flavor: 'Sweet & Tangy BBQ', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/c1502e/ffffff?text=Sweet+BBQ' },
  { id: 'dor_blazing_buffalo', name: 'Doritos', flavor: 'Blazing Buffalo & Ranch', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/d90429/ffffff?text=Buffalo+Ranch' },
  { id: 'dor_spicy_sweet_chili', name: 'Doritos', flavor: 'Spicy Sweet Chili', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/9e2a2b/ffffff?text=Spicy+Sweet+Chili' },
  { id: 'dor_flamin_hot_cool_ranch', name: 'Doritos', flavor: "Flamin' Hot Cool Ranch", category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/8c0b01/ffffff?text=FH+Cool+Ranch' },
  { id: 'dor_flamin_hot_nacho', name: 'Doritos', flavor: "Flamin' Hot Nacho", category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/dc2f02/ffffff?text=Flamin+Hot' },
  { id: 'dor_late_night_taco', name: 'Doritos', flavor: 'Late Night Loaded Taco', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/4a040d/ffffff?text=Late+Night+Taco' },
  { id: 'dor_dinamita_chile_limon', name: 'Doritos Dinamita', flavor: 'Chile Limón', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/b51722/ffffff?text=Dinamita' },
  { id: 'dor_dinamita_flamin_hot_queso', name: 'Doritos Dinamita', flavor: "Flamin' Hot Queso", category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/e94f37/ffffff?text=Dinamita+Queso' },
  { id: 'dor_limon', name: 'Doritos', flavor: 'Limón', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/80b918/ffffff?text=Doritos+Limón' },
  { id: 'dor_salsa_verde', name: 'Doritos', flavor: 'Salsa Verde', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/40916c/ffffff?text=Salsa+Verde' },
  { id: 'dor_tapatio', name: 'Doritos', flavor: 'Tapatio', category: 'Snack', supplierId: 'sup4', size: '2.75oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/ff0000/ffffff?text=Doritos+Tapatio' },
  { id: 'lays_classic', name: 'Lays', flavor: 'Classic', category: 'Snack', supplierId: 'sup4', size: '2.5oz Bag', unitsPerCase: 32, costPrice: 32, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/ffd700/000000?text=Lays', upc: '028400073516' },
  { id: 'lays_bbq', name: 'Lays', flavor: 'BBQ', category: 'Snack', supplierId: 'sup4', size: '2.5oz Bag', unitsPerCase: 32, costPrice: 32, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/a52a2a/ffffff?text=Lays+BBQ', upc: '028400073547' },
  { id: 'cheetos_crunchy', name: 'Cheetos', flavor: 'Crunchy', category: 'Snack', supplierId: 'sup4', size: '3.25oz Bag', unitsPerCase: 28, costPrice: 30, retailPrice: 2.69, imageUrl: 'https://placehold.co/400x400/f08c00/ffffff?text=Cheetos', upc: '028400090872' },

  // Coca-Cola (sup5)
  { id: 'coke_orig_bot20', name: 'Coca-Cola', flavor: 'Classic', category: 'Beverage', supplierId: 'sup5', size: '20oz Bottle', unitsPerCase: 24, costPrice: 25, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/f40009/ffffff?text=Coke', upc: '049000028904' },
  { id: 'coke_diet_bot20', name: 'Coca-Cola', flavor: 'Diet Coke', category: 'Beverage', supplierId: 'sup5', size: '20oz Bottle', unitsPerCase: 24, costPrice: 25, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/c0c0c0/f40009?text=Diet+Coke', upc: '049000028911' },
  { id: 'coke_zero_bot20', name: 'Coca-Cola', flavor: 'Zero Sugar', category: 'Beverage', supplierId: 'sup5', size: '20oz Bottle', unitsPerCase: 24, costPrice: 25, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/000000/ffffff?text=Coke+Zero', upc: '049000069679' },
  { id: 'sprite_bot20', name: 'Sprite', flavor: 'Lemon-Lime', category: 'Beverage', supplierId: 'sup5', size: '20oz Bottle', unitsPerCase: 24, costPrice: 25, retailPrice: 2.25, imageUrl: 'https://placehold.co/400x400/009e60/ffffff?text=Sprite', upc: '049000028935' },
  
  // Arizona (sup6) - Comprehensive List
  // -- Big Cans (22-23.5 oz) --
  { id: 'az_african_red_tea_can23', name: 'Arizona', flavor: 'African Rooibos Red Tea', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/b91c1c/ffffff?text=AZ+Rooibos' },
  { id: 'az_ap_can22', name: 'Arizona', flavor: 'Arnold Palmer Half & Half', category: 'Tea', supplierId: 'sup6', size: '22 oz. Big Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/d2b48c/000000?text=AZ+AP' },
  { id: 'az_ap_peach_can23', name: 'Arizona', flavor: 'Arnold Palmer Peach Half & Half', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/fecdd3/000000?text=AP+Peach' },
  { id: 'az_ap_strawberry_can22', name: 'Arizona', flavor: 'Arnold Palmer Strawberry', category: 'Tea', supplierId: 'sup6', size: '22 oz. Big Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/fecdd3/000000?text=AP+Strawberry' },
  { id: 'az_blackwhite_can22', name: 'Arizona', flavor: 'Black & White Tea', category: 'Tea', supplierId: 'sup6', size: '22 oz. Big Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/e5e7eb/000000?text=AZ+B%26W' },
  { id: 'az_bwt_can22', name: 'Arizona', flavor: 'Blueberry White Tea', category: 'Tea', supplierId: 'sup6', size: '22 oz. Big Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/dbeafe/ffffff?text=AZ+Blueberry+White' },
  { id: 'az_cherrylime_can23', name: 'Arizona', flavor: 'Cherry Lime Rickey', category: 'Sparkling', supplierId: 'sup6', size: '23.5 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/dc2626/ffffff?text=Cherry+Lime' },
  { id: 'az_cranberry_can23', name: 'Arizona', flavor: 'Cranberry Tea', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/9f1239/ffffff?text=AZ+Cranberry' },
  { id: 'az_diet_ap_can22', name: 'Arizona', flavor: 'Arnold Palmer Lite', category: 'Tea', supplierId: 'sup6', size: '22 oz. Big Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/f3f4f6/000000?text=Diet+AP' },
  { id: 'az_diet_gt_can22', name: 'Arizona', flavor: 'Diet Green Tea', category: 'Tea', supplierId: 'sup6', size: '22 oz. Big Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/d1e7dd/000000?text=AZ+Diet+GT' },
  { id: 'az_fruitpunch_can23', name: 'Arizona', flavor: 'Fruit Punch', category: 'Juice Cocktail', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/ff6347/ffffff?text=AZ+Fruit+Punch' },
  { id: 'az_georgia_peach_gt_can23', name: 'Arizona', flavor: 'Georgia Peach Green Tea', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/fcc299/000000?text=AZ+Peach+GT' },
  { id: 'az_grapeade_can23', name: 'Arizona', flavor: 'Grapeade', category: 'Juice Cocktail', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/6d28d9/ffffff?text=AZ+Grapeade' },
  { id: 'az_gt_can23', name: 'Arizona', flavor: 'Green Tea with Ginseng and Honey', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/a3d1b0/000000?text=AZ+Green+Tea' },
  { id: 'az_gt_cucumber_can23', name: 'Arizona', flavor: 'Green Tea Cucumber & Citrus', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/a3d1b0/000000?text=AZ+Cucumber' },
  { id: 'az_kiwistraw_can23', name: 'Arizona', flavor: 'Kiwi Strawberry', category: 'Juice Cocktail', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/87c863/ffffff?text=Kiwi+Straw' },
  { id: 'az_lemon_tea_can23', name: 'Arizona', flavor: 'Lemon Tea', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/fff44f/000000?text=AZ+Lemon+Tea' },
  { id: 'az_lemonade_can23', name: 'Arizona', flavor: 'Lemonade', category: 'Juice Cocktail', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/fef08a/000000?text=AZ+Lemonade' },
  { id: 'az_lemonlime_can23', name: 'Arizona', flavor: 'Lemon Lime Rickey', category: 'Sparkling', supplierId: 'sup6', size: '23.5 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/bef264/000000?text=Lemon+Lime+Rickey' },
  { id: 'az_mango_can23', name: 'Arizona', flavor: 'Mucho Mango', category: 'Juice Cocktail', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/ffc107/000000?text=AZ+Mango' },
  { id: 'az_orangeade_can23', name: 'Arizona', flavor: 'Orangeade', category: 'Juice Cocktail', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/fb923c/ffffff?text=AZ+Orangeade' },
  { id: 'az_peach_can23', name: 'Arizona', flavor: 'Peach Tea', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/ffb3a7/000000?text=AZ+Peach' },
  { id: 'az_pineapple_can23', name: 'Arizona', flavor: 'Pineapple', category: 'Juice Cocktail', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/fde047/000000?text=AZ+Pineapple' },
  { id: 'az_raspberry_tea_can23', name: 'Arizona', flavor: 'Raspberry Tea', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/e52a55/ffffff?text=AZ+Raspberry' },
  { id: 'az_redapple_gt_can23', name: 'Arizona', flavor: 'Red Apple Green Tea', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/dc2626/ffffff?text=AZ+Red+Apple' },
  { id: 'az_rizzberry_can23', name: 'Arizona', flavor: 'Rizzberry', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/db2777/ffffff?text=Rizzberry' },
  { id: 'az_sweet_tea_can23', name: 'Arizona', flavor: 'Southern Style Sweet Tea', category: 'Tea', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/b45309/ffffff?text=Sweet+Tea' },
  { id: 'az_tropical_chillzicle_can22', name: 'Arizona', flavor: 'Tropical Chillzicle', category: 'Juice Cocktail', supplierId: 'sup6', size: '22 oz. Big Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/0ea5e9/ffffff?text=Tropical+Chill' },
  { id: 'az_watermelon_can23', name: 'Arizona', flavor: 'Watermelon', category: 'Juice Cocktail', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/f08080/ffffff?text=AZ+Watermelon' },
  { id: 'az_whipped_pineapple_can23', name: 'Arizona', flavor: 'Whipped Pineapple Orange', category: 'Juice Cocktail', supplierId: 'sup6', size: '23 oz. Big Can', unitsPerCase: 24, costPrice: 24, retailPrice: 1.25, imageUrl: 'https://placehold.co/400x400/fefce8/000000?text=AZ+Whipped' },
  // -- Tall Boys (20oz) --
  { id: 'az_ap_tb20', name: 'Arizona', flavor: 'Arnold Palmer Half & Half', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 24, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/d2b48c/000000?text=AP+Tall' },
  { id: 'az_ap_goodbrew_tb20', name: 'Arizona', flavor: 'Arnold Palmer Good Brew', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 12, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/d2b48c/000000?text=AP+Good+Brew' },
  { id: 'az_bwt_tb20', name: 'Arizona', flavor: 'Blueberry White Tea', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 12, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/dbeafe/ffffff?text=AZ+BWT+Tall' },
  { id: 'az_diet_gt_tb20', name: 'Arizona', flavor: 'Diet Green Tea', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 24, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/d1e7dd/000000?text=Diet+GT+Tall' },
  { id: 'az_diet_lemon_tea_tb20', name: 'Arizona', flavor: 'Diet Lemon Tea', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 24, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/fef9c3/000000?text=Diet+Lemon+Tall' },
  { id: 'az_diet_peach_tea_tb20', name: 'Arizona', flavor: 'Diet Peach Tea', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 24, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/fee2e2/000000?text=Diet+Peach+Tall' },
  { id: 'az_gt_tb20', name: 'Arizona', flavor: 'Green Tea', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 12, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/a3d1b0/000000?text=AZ+GT+Tall' },
  { id: 'az_hh_rasp_tb20', name: 'Arizona', flavor: 'Half & Half Raspberry', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 12, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/e3256b/ffffff?text=HH+Raspberry' },
  { id: 'az_hh_tropical_tb20', name: 'Arizona', flavor: 'Half & Half Tropical', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 12, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/f97316/ffffff?text=HH+Tropical' },
  { id: 'az_kiwistraw_tb20', name: 'Arizona', flavor: 'Kiwi Strawberry', category: 'Juice Cocktail', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 12, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/87c863/ffffff?text=Kiwi+Straw' },
  { id: 'az_lemon_tea_tb20', name: 'Arizona', flavor: 'Lemon Tea', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 24, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/fff44f/000000?text=Lemon+Tea+Tall' },
  { id: 'az_lite_ap_tb20', name: 'Arizona', flavor: 'Lite Arnold Palmer', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 12, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/f3f4f6/000000?text=Lite+AP+Tall' },
  { id: 'az_mango_tb20', name: 'Arizona', flavor: 'Mucho Mango', category: 'Juice Cocktail', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 24, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/ffc107/000000?text=Mango+Tall' },
  { id: 'az_peach_tb20', name: 'Arizona', flavor: 'Peach Tea', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 12, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/ffb3a7/000000?text=AZ+Peach+Tall' },
  { id: 'az_pineapple_tb20', name: 'Arizona', flavor: 'Pineapple', category: 'Juice Cocktail', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 12, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/fde047/000000?text=Pineapple+Tall' },
  { id: 'az_rx_energy_tb20', name: 'Arizona RX Energy', flavor: 'Herbal Tonic', category: 'Energy Drink', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 12, costPrice: 22.99, retailPrice: 3.29, imageUrl: 'https://placehold.co/400x400/f59e0b/000000?text=RX+Energy+Tall' },
  { id: 'az_sweet_tea_tb20', name: 'Arizona', flavor: 'Southern Style Sweet Tea', category: 'Tea', supplierId: 'sup6', size: '20 oz. Tall Boy', unitsPerCase: 24, costPrice: 22.99, retailPrice: 2.79, imageUrl: 'https://placehold.co/400x400/b45309/ffffff?text=Sweet+Tea+Tall' },
  // -- Bottles (16.9 oz / 500ml) --
  { id: 'az_ap_bot16_9', name: 'Arizona', flavor: 'Arnold Palmer', category: 'Tea', supplierId: 'sup6', size: '16.9 oz. Bottle', unitsPerCase: 20, costPrice: 36.99, retailPrice: 2.49, imageUrl: 'https://placehold.co/400x400/d2b48c/000000?text=AP+Bottle' },
  { id: 'az_diet_gt_bot16_9', name: 'Arizona', flavor: 'Diet Green Tea', category: 'Tea', supplierId: 'sup6', size: '16.9 oz. Bottle', unitsPerCase: 20, costPrice: 36.99, retailPrice: 2.49, imageUrl: 'https://placehold.co/400x400/d1e7dd/000000?text=Diet+GT+Bottle' },
  { id: 'az_gt_bot16_9', name: 'Arizona', flavor: 'Green Tea', category: 'Tea', supplierId: 'sup6', size: '16.9 oz. Bottle', unitsPerCase: 20, costPrice: 36.99, retailPrice: 2.49, imageUrl: 'https://placehold.co/400x400/a3d1b0/000000?text=GT+Bottle' },
  { id: 'az_lemont_bot16_9', name: 'Arizona', flavor: 'Lemon Tea', category: 'Tea', supplierId: 'sup6', size: '16.9 oz. Bottle', unitsPerCase: 20, costPrice: 36.99, retailPrice: 2.49, imageUrl: 'https://placehold.co/400x400/fff44f/000000?text=Lemon+Tea+Bottle' },
  { id: 'az_sweett_bot16_9', name: 'Arizona', flavor: 'Southern Style Sweet Tea', category: 'Tea', supplierId: 'sup6', size: '16.9 oz. Bottle', unitsPerCase: 20, costPrice: 36.99, retailPrice: 2.49, imageUrl: 'https://placehold.co/400x400/b45309/ffffff?text=Sweet+Tea+Bottle' },
  // -- Bottles (16 oz) --
  { id: 'az_ap_bot16', name: 'Arizona', flavor: 'Arnold Palmer Half & Half', category: 'Tea', supplierId: 'sup6', size: '16 oz. Bottle', unitsPerCase: 24, costPrice: 24, retailPrice: 2.29, imageUrl: 'https://placehold.co/400x400/d2b48c/000000?text=AP+16oz' },
  { id: 'az_gt_bot16', name: 'Arizona', flavor: 'Green Tea', category: 'Tea', supplierId: 'sup6', size: '16 oz. Bottle', unitsPerCase: 24, costPrice: 24, retailPrice: 2.29, imageUrl: 'https://placehold.co/400x400/a3d1b0/000000?text=GT+16oz' },
  { id: 'az_lemon_tea_bot16', name: 'Arizona', flavor: 'Lemon Tea', category: 'Tea', supplierId: 'sup6', size: '16 oz. Bottle', unitsPerCase: 24, costPrice: 24, retailPrice: 2.29, imageUrl: 'https://placehold.co/400x400/fff44f/000000?text=Lemon+Tea+16oz' },
  { id: 'az_sweet_tea_bot16', name: 'Arizona', flavor: 'Sweet Tea', category: 'Tea', supplierId: 'sup6', size: '16 oz. Bottle', unitsPerCase: 24, costPrice: 24, retailPrice: 2.29, imageUrl: 'https://placehold.co/400x400/b45309/ffffff?text=Sweet+Tea+16oz' },
  // -- Energy Drinks --
  { id: 'az_energy_gt_peach_can22', name: 'Arizona Energy', flavor: 'Green Tea Peach', category: 'Energy Drink', supplierId: 'sup6', size: '22 oz. Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 3.29, imageUrl: 'https://placehold.co/400x400/fcc299/000000?text=Energy+Peach' },
  { id: 'az_energy_gt_pomegranate_can22', name: 'Arizona Energy', flavor: 'Green Tea Pomegranate', category: 'Energy Drink', supplierId: 'sup6', size: '22 oz. Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 3.29, imageUrl: 'https://placehold.co/400x400/be123c/ffffff?text=Energy+Pom' },
  { id: 'az_energy_gt_red_apple_can22', name: 'Arizona Energy', flavor: 'Green Tea Red Apple', category: 'Energy Drink', supplierId: 'sup6', size: '22 oz. Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 3.29, imageUrl: 'https://placehold.co/400x400/dc2626/ffffff?text=Energy+Apple' },
  { id: 'az_rx_caution_slim11_5', name: 'Arizona RX Energy', flavor: 'Caution Extreme Performance', category: 'Energy Drink', supplierId: 'sup6', size: '11.5 oz. Slim Can', unitsPerCase: 24, costPrice: 38.99, retailPrice: 2.49, imageUrl: 'https://placehold.co/400x400/fde047/000000?text=RX+Caution' },
  { id: 'az_rx_lowcarb_slim11_5', name: 'Arizona RX Energy', flavor: 'Caution Low-Carb', category: 'Energy Drink', supplierId: 'sup6', size: '11.5 oz. Slim Can', unitsPerCase: 24, costPrice: 38.99, retailPrice: 2.49, imageUrl: 'https://placehold.co/400x400/d1d5db/000000?text=RX+Low+Carb' },
  { id: 'az_rx_fruitpunch_slim11_5', name: 'Arizona RX Energy', flavor: 'Caution Extreme Fruit Punch', category: 'Energy Drink', supplierId: 'sup6', size: '11.5 oz. Slim Can', unitsPerCase: 24, costPrice: 38.99, retailPrice: 2.49, imageUrl: 'https://placehold.co/400x400/ff6347/ffffff?text=RX+Fruit+Punch' },
  { id: 'az_rx_watermelon_can22', name: 'Arizona RX Energy', flavor: 'Watermelon Herbal Tonic', category: 'Energy Drink', supplierId: 'sup6', size: '22 oz. Big Can', unitsPerCase: 12, costPrice: 24.99, retailPrice: 3.29, imageUrl: 'https://placehold.co/400x400/fca5a5/ffffff?text=RX+Watermelon' },
  // -- Hard Seltzers (12oz & 22oz Cans) --
  { id: 'az_hard_ap_can12', name: 'Arizona Hard', flavor: 'Arnold Palmer Half & Half', category: 'Hard Seltzer', supplierId: 'sup6', size: '12 oz. Can', unitsPerCase: 12, costPrice: 18.99, retailPrice: 2.99, imageUrl: 'https://placehold.co/400x400/d2b48c/000000?text=Hard+AP' },
  { id: 'az_hard_ap_can22', name: 'Arizona Hard', flavor: 'Arnold Palmer Half & Half', category: 'Hard Seltzer', supplierId: 'sup6', size: '22 oz. Can', unitsPerCase: 12, costPrice: 26.99, retailPrice: 3.49, imageUrl: 'https://placehold.co/400x400/d2b48c/000000?text=Hard+AP+Tall' },
  { id: 'az_hard_ap_peach_can12', name: 'Arizona Hard', flavor: 'Arnold Palmer Peach', category: 'Hard Seltzer', supplierId: 'sup6', size: '12 oz. Can', unitsPerCase: 12, costPrice: 18.99, retailPrice: 2.99, imageUrl: 'https://placehold.co/400x400/fecdd3/000000?text=Hard+AP+Peach' },
  { id: 'az_hard_ap_peach_can22', name: 'Arizona Hard', flavor: 'Arnold Palmer Peach', category: 'Hard Seltzer', supplierId: 'sup6', size: '22 oz. Can', unitsPerCase: 12, costPrice: 26.99, retailPrice: 3.49, imageUrl: 'https://placehold.co/400x400/fecdd3/000000?text=Hard+AP+Peach+Tall' },
  { id: 'az_hard_ap_strawberry_can12', name: 'Arizona Hard', flavor: 'Arnold Palmer Strawberry', category: 'Hard Seltzer', supplierId: 'sup6', size: '12 oz. Can', unitsPerCase: 12, costPrice: 18.99, retailPrice: 2.99, imageUrl: 'https://placehold.co/400x400/fecdd3/000000?text=Hard+AP+Straw' },
  { id: 'az_hard_fp_can12', name: 'Arizona Hard', flavor: 'Fruit Punch', category: 'Hard Seltzer', supplierId: 'sup6', size: '12 oz. Can', unitsPerCase: 12, costPrice: 18.99, retailPrice: 2.99, imageUrl: 'https://placehold.co/400x400/ff6347/ffffff?text=Hard+FP' },
  { id: 'az_hard_gt_can12', name: 'Arizona Hard', flavor: 'Green Tea', category: 'Hard Seltzer', supplierId: 'sup6', size: '12 oz. Can', unitsPerCase: 12, costPrice: 18.99, retailPrice: 2.99, imageUrl: 'https://placehold.co/400x400/a3d1b0/000000?text=Hard+GT' },
  { id: 'az_hard_gt_can22', name: 'Arizona Hard', flavor: 'Green Tea', category: 'Hard Seltzer', supplierId: 'sup6', size: '22 oz. Can', unitsPerCase: 12, costPrice: 26.99, retailPrice: 3.49, imageUrl: 'https://placehold.co/400x400/a3d1b0/000000?text=Hard+GT+Tall' },
  { id: 'az_hard_kiwistraw_can12', name: 'Arizona Hard', flavor: 'Kiwi Strawberry', category: 'Hard Seltzer', supplierId: 'sup6', size: '12 oz. Can', unitsPerCase: 12, costPrice: 18.99, retailPrice: 2.99, imageUrl: 'https://placehold.co/400x400/87c863/ffffff?text=Hard+KiwiStraw' },
  { id: 'az_hard_lemon_can12', name: 'Arizona Hard', flavor: 'Lemon Tea', category: 'Hard Seltzer', supplierId: 'sup6', size: '12 oz. Can', unitsPerCase: 12, costPrice: 18.99, retailPrice: 2.99, imageUrl: 'https://placehold.co/400x400/fff44f/000000?text=Hard+Lemon' },
  { id: 'az_hard_lemon_can22', name: 'Arizona Hard', flavor: 'Lemon Tea', category: 'Hard Seltzer', supplierId: 'sup6', size: '22 oz. Can', unitsPerCase: 12, costPrice: 26.99, retailPrice: 3.49, imageUrl: 'https://placehold.co/400x400/fff44f/000000?text=Hard+Lemon+Tall' },
  { id: 'az_hard_mango_can12', name: 'Arizona Hard', flavor: 'Mucho Mango', category: 'Hard Seltzer', supplierId: 'sup6', size: '12 oz. Can', unitsPerCase: 12, costPrice: 18.99, retailPrice: 2.99, imageUrl: 'https://placehold.co/400x400/ffc107/000000?text=Hard+Mango' },
  { id: 'az_hard_peach_can12', name: 'Arizona Hard', flavor: 'Peach Tea', category: 'Hard Seltzer', supplierId: 'sup6', size: '12 oz. Can', unitsPerCase: 12, costPrice: 18.99, retailPrice: 2.99, imageUrl: 'https://placehold.co/400x400/ffb3a7/000000?text=Hard+Peach' },
  { id: 'az_hard_peach_can22', name: 'Arizona Hard', flavor: 'Peach Tea', category: 'Hard Seltzer', supplierId: 'sup6', size: '22 oz. Can', unitsPerCase: 12, costPrice: 26.99, retailPrice: 3.49, imageUrl: 'https://placehold.co/400x400/ffb3a7/000000?text=Hard+Peach+Tall' },
  { id: 'az_hard_watermelon_can12', name: 'Arizona Hard', flavor: 'Watermelon', category: 'Hard Seltzer', supplierId: 'sup6', size: '12 oz. Can', unitsPerCase: 12, costPrice: 18.99, retailPrice: 2.99, imageUrl: 'https://placehold.co/400x400/f08080/ffffff?text=Hard+Watermelon' },
  // -- Gallons & Other --
  { id: 'az_ap_jug128', name: 'Arizona', flavor: 'Arnold Palmer Half & Half', category: 'Jug', supplierId: 'sup6', size: '128 oz. Jug', unitsPerCase: 4, costPrice: 15.99, retailPrice: 4.99, imageUrl: 'https://placehold.co/400x400/d2b48c/000000?text=AP+Jug' },
  { id: 'az_ap_lite_jug128', name: 'Arizona', flavor: 'Arnold Palmer Lite', category: 'Jug', supplierId: 'sup6', size: '128 oz. Jug', unitsPerCase: 4, costPrice: 15.99, retailPrice: 4.99, imageUrl: 'https://placehold.co/400x400/f3f4f6/000000?text=AP+Lite+Jug' },
  { id: 'az_gt_jug128', name: 'Arizona', flavor: 'Green Tea', category: 'Jug', supplierId: 'sup6', size: '128 oz. Jug', unitsPerCase: 4, costPrice: 15.99, retailPrice: 4.99, imageUrl: 'https://placehold.co/400x400/a3d1b0/000000?text=GT+Jug' },
  { id: 'az_lemon_tea_jug128', name: 'Arizona', flavor: 'Lemon Tea', category: 'Jug', supplierId: 'sup6', size: '128 oz. Jug', unitsPerCase: 4, costPrice: 15.99, retailPrice: 4.99, imageUrl: 'https://placehold.co/400x400/fff44f/000000?text=Lemon+Tea+Jug' },
  { id: 'az_unsweet_tea_jug128', name: 'Arizona', flavor: 'Unsweetened Just Tea', category: 'Jug', supplierId: 'sup6', size: '128 oz. Jug', unitsPerCase: 4, costPrice: 15.99, retailPrice: 4.99, imageUrl: 'https://placehold.co/400x400/e5e7eb/000000?text=Unsweet+Jug' },
  { id: 'az_vapor_water_bot750ml', name: 'Arizona', flavor: 'Vapor Water', category: 'Water', supplierId: 'sup6', size: '750ml Bottle', unitsPerCase: 12, costPrice: 15.00, retailPrice: 2.00, imageUrl: 'https://placehold.co/400x400/e0f2fe/000000?text=Vapor+Water' },
  
  // Red Bull (sup7)
  { id: 'rb_orig_can8', name: 'Red Bull', flavor: 'Original', category: 'Energy Drink', supplierId: 'sup7', size: '8.4oz Can', unitsPerCase: 24, costPrice: 40, retailPrice: 3.29, imageUrl: 'https://placehold.co/400x400/1e3a8a/e5e7eb?text=Red+Bull', upc: '611269121111' },
  { id: 'rb_sf_can8', name: 'Red Bull', flavor: 'Sugarfree', category: 'Energy Drink', supplierId: 'sup7', size: '8.4oz Can', unitsPerCase: 24, costPrice: 40, retailPrice: 3.29, imageUrl: 'https://placehold.co/400x400/9ca3af/1e3a8a?text=RB+Sugarfree', upc: '611269121128' },
  
  // Wise Foods (sup8)
  { id: 'wise_cheez', name: 'Wise', flavor: 'Cheez Doodles', category: 'Snack', supplierId: 'sup8', size: '3oz Bag', unitsPerCase: 24, costPrice: 28, retailPrice: 2.00, imageUrl: 'https://placehold.co/400x400/fb923c/000000?text=Cheez+Doodles' },
  { id: 'wise_chips', name: 'Wise', flavor: 'Original Potato Chips', category: 'Snack', supplierId: 'sup8', size: '2.75oz Bag', unitsPerCase: 24, costPrice: 28, retailPrice: 2.00, imageUrl: 'https://placehold.co/400x400/facc15/000000?text=Wise+Chips' },
  
  // Utz (sup9)
  { id: 'utz_classic', name: 'Utz', flavor: 'Classic', category: 'Snack', supplierId: 'sup9', size: '2.75oz Bag', unitsPerCase: 32, costPrice: 32, retailPrice: 2.19, imageUrl: 'https://placehold.co/400x400/ffcc00/000000?text=Utz+Classic' },
  { id: 'utz_bbq', name: 'Utz', flavor: 'BBQ', category: 'Snack', supplierId: 'sup9', size: '2.75oz Bag', unitsPerCase: 32, costPrice: 32, retailPrice: 2.19, imageUrl: 'https://placehold.co/400x400/b91c1c/ffffff?text=Utz+BBQ' },

  // Monster (sup10)
  { id: 'mon_orig_can16', name: 'Monster Energy', flavor: 'Original', category: 'Energy Drink', supplierId: 'sup10', size: '16oz Can', unitsPerCase: 24, costPrice: 42, retailPrice: 3.49, imageUrl: 'https://placehold.co/400x400/16a34a/000000?text=Monster' },
  { id: 'mon_lo_can16', name: 'Monster Energy', flavor: 'Lo-Carb', category: 'Energy Drink', supplierId: 'sup10', size: '16oz Can', unitsPerCase: 24, costPrice: 42, retailPrice: 3.49, imageUrl: 'https://placehold.co/400x400/3b82f6/ffffff?text=Monster+Lo-Carb' },

  // Welch's (sup11)
  { id: 'wel_grape_bot16', name: "Welch's", flavor: 'Grape Soda', category: 'Beverage', supplierId: 'sup11', size: '16oz Bottle', unitsPerCase: 24, costPrice: 20, retailPrice: 1.99, imageUrl: 'https://placehold.co/400x400/581c87/ffffff?text=Welch%27s+Grape' },
];

// Helper to generate a random stock level
const getRandomStock = (unitsPerCase: number) => {
    // Generate a stock level between 0 and 2 cases worth.
    const baseStock = Math.random() * unitsPerCase * 2;
    return Math.floor(baseStock);
};

const initialProducts: Product[] = initialProductsRaw.map(p => ({
  ...p,
  reorderThresholdUnits: Math.ceil(p.unitsPerCase * 0.25),
  currentStockUnits: getRandomStock(p.unitsPerCase)
}));

// Haptic feedback helper
const vibrate = (pattern: number | number[] = 50) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
};

export interface InventoryContextType {
  products: Product[];
  suppliers: Supplier[];
  currentOrder: Order;
  deliName: string;
  getProductById: (id: string) => Product | undefined;
  getSupplierById: (id: string) => Supplier | undefined;
  /** Adds to the product's line in its supplier's unit (cases, or items for Boar's Head). */
  addToOrder: (productId: string, quantity: number) => void;
  /** Removes the product's line in `unit`; without a unit, every line of the product. */
  removeFromOrder: (productId: string, unit?: OrderUnit) => void;
  /** Without a unit, changes the line in the product's current ordering unit. */
  updateOrderItemQuantity: (productId: string, newQuantity: number, unit?: OrderUnit) => void;
  /** Explicitly turns an older case line of an item-ordered supplier into an item line. */
  convertOrderLineToItems: (productId: string) => void;
  clearOrder: () => void;
  addProduct: (productData: Omit<Product, 'id' | 'currentStockUnits'>) => void;
  updateProduct: (productData: Product) => void;
  deleteProduct: (productId: string) => void;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => void;
  updateDeliName: (newName: string) => void;
  /** How a supplier is ordered from and whether its products are stock-counted. */
  getWorkflow: (supplierId: string) => SupplierWorkflow;
  /** What to show for a product's stock. Never presents old or unreadable numbers as counted. */
  getStock: (product: Product) => StockView;
  /**
   * The only way stock is recorded (Classic View now, The Counter later). Reports success only
   * after the count is saved in storage. Never writes `inventory_products`.
   */
  saveStockCount: (productId: string, units: number, source: 'classic' | 'confirmed-legacy') => SaveCountResult;
}

export type SaveCountResult =
  | { ok: true; count: StockCount }
  | { ok: false; reason: 'invalid' | 'not-tracked' | 'missing-product' | 'blocked' | 'write-failed' };

export const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider = ({ children }: { children: ReactNode }) => {
  // Saved data is loaded through the storage guard: a missing value falls back to the sample
  // data exactly as before, but an unreadable value is left untouched and its key is blocked from
  // being saved over (see utils/storageGuard.ts).
  const [products, setProducts] = useState<Product[]>(() =>
    loadGuarded<Product[]>('inventory_products', { parse: JSON.parse, fallback: () => initialProducts, serialize: JSON.stringify }).value
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(() =>
    loadGuarded<Supplier[]>('inventory_suppliers', { parse: JSON.parse, fallback: () => initialSuppliers, serialize: JSON.stringify }).value
  );
  const [currentOrder, setCurrentOrder] = useState<Order>(() =>
    loadGuarded<Order>('inventory_currentOrder', {
      parse: JSON.parse,
      fallback: () => ({ items: [], createdAt: new Date().toISOString() }),
      serialize: JSON.stringify,
    }).value
  );
  const [deliName, setDeliName] = useState<string>(() =>
    loadGuarded<string>('inventory_deliName', { parse: saved => saved || "DeliOrderNYC", fallback: () => "DeliOrderNYC", serialize: name => name }).value
  );


  // Verified stock counts. Never written at startup: the key is only created by the first count.
  const [stockCounts, setStockCounts] = useState<StockCountsDoc>(() =>
    loadGuarded<StockCountsDoc>(STOCK_COUNTS_KEY, { parse: JSON.parse, fallback: emptyStockCounts, serialize: JSON.stringify }).value
  );
  const stockCountsRef = useRef(stockCounts);
  const guard = useSyncExternalStore(subscribeGuard, getGuardState);
  // Unreadable, unavailable or changed in another tab: nothing is shown as counted, nothing is saved.
  const countsAvailable = !guard.blocked.some(entry => entry.key === STOCK_COUNTS_KEY);

  const commitStockCounts = (next: StockCountsDoc): boolean => {
    if (!guardedSetItem(STOCK_COUNTS_KEY, JSON.stringify(next))) return false;
    stockCountsRef.current = next;
    setStockCounts(next);
    return true;
  };

  useEffect(() => { guardedSetItem('inventory_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { guardedSetItem('inventory_suppliers', JSON.stringify(suppliers)); }, [suppliers]);
  useEffect(() => { guardedSetItem('inventory_currentOrder', JSON.stringify(currentOrder)); }, [currentOrder]);
  useEffect(() => { guardedSetItem('inventory_deliName', deliName); }, [deliName]);


  const getProductById = useCallback((id: string) => products.find(p => p.id === id), [products]);
  const getSupplierById = useCallback((id: string) => suppliers.find(s => s.id === id), [suppliers]);
  const getWorkflow = useCallback((supplierId: string) => resolveSupplierWorkflow(supplierId), []);
  const unitForNewLine = useCallback(
    (productId: string): OrderUnit => {
      const product = products.find(p => p.id === productId);
      return newLineUnit(resolveSupplierWorkflow(product?.supplierId));
    },
    [products],
  );

  const getStock = useCallback(
    (product: Product) => getStockView(product, resolveSupplierWorkflow(product.supplierId), stockCounts, countsAvailable),
    [stockCounts, countsAvailable],
  );

  const saveStockCount = useCallback(
    (productId: string, units: number, source: 'classic' | 'confirmed-legacy'): SaveCountResult => {
      const product = products.find(p => p.id === productId);
      if (!product) return { ok: false, reason: 'missing-product' };
      if (!resolveSupplierWorkflow(product.supplierId).countStock) return { ok: false, reason: 'not-tracked' };
      if (!isValidCountUnits(units)) return { ok: false, reason: 'invalid' };
      if (isKeyBlocked(STOCK_COUNTS_KEY)) return { ok: false, reason: 'blocked' };
      const count: StockCount = { units, countedAt: new Date().toISOString(), source, unitsPerCaseAtCount: product.unitsPerCase };
      if (!commitStockCounts(withCount(stockCountsRef.current, productId, count))) {
        return { ok: false, reason: isKeyBlocked(STOCK_COUNTS_KEY) ? 'blocked' : 'write-failed' };
      }
      return { ok: true, count };
    },
    [products],
  );
  
  const updateDeliName = (newName: string) => {
    setDeliName(newName);
  };

  const addToOrder = useCallback((productId: string, quantity: number) => {
    const unit = unitForNewLine(productId);
    setCurrentOrder(prevOrder => {
      // Only a line in the same unit is added to. An older case line is never counted as items.
      const existingItemIndex = prevOrder.items.findIndex(item => item.productId === productId && lineUnit(item) === unit);
      let newItems: OrderItem[];

      if (existingItemIndex > -1) {
        newItems = [...prevOrder.items];
        newItems[existingItemIndex] = { ...newItems[existingItemIndex], quantity: newItems[existingItemIndex].quantity + quantity };
      } else {
        // Case lines keep the pre-C1 shape (no unit field).
        newItems = [...prevOrder.items, unit === 'item' ? { productId, quantity, unit: 'item' } : { productId, quantity }];
      }
      audioManager.play('add');
      vibrate();
      return { ...prevOrder, items: newItems };
    });
  }, [unitForNewLine]);
  
  const removeFromOrder = useCallback((productId: string, unit?: OrderUnit) => {
    setCurrentOrder(prevOrder => ({
      ...prevOrder,
      items: prevOrder.items.filter(item => item.productId !== productId || (unit !== undefined && lineUnit(item) !== unit)),
    }));
    audioManager.play('remove');
    vibrate();
  }, []);

  const updateOrderItemQuantity = useCallback((productId: string, newQuantity: number, unit?: OrderUnit) => {
    const lineUnitToChange = unit ?? unitForNewLine(productId);
    if (newQuantity <= 0) {
      removeFromOrder(productId, lineUnitToChange);
      return;
    }
    setCurrentOrder(prevOrder => ({
      ...prevOrder,
      items: prevOrder.items.map(item =>
        item.productId === productId && lineUnit(item) === lineUnitToChange ? { ...item, quantity: newQuantity } : item
      ),
    }));
    vibrate(20);
  }, [removeFromOrder, unitForNewLine]);

  const convertOrderLineToItems = useCallback((productId: string) => {
    if (unitForNewLine(productId) !== 'item') return;
    setCurrentOrder(prevOrder => {
      const caseLine = prevOrder.items.find(item => item.productId === productId && lineUnit(item) === 'case');
      if (!caseLine) return prevOrder;
      const hasItemLine = prevOrder.items.some(item => item.productId === productId && lineUnit(item) === 'item');
      const items = hasItemLine
        ? prevOrder.items
            .filter(item => item !== caseLine)
            .map(item =>
              item.productId === productId && lineUnit(item) === 'item' ? { ...item, quantity: item.quantity + caseLine.quantity } : item
            )
        : prevOrder.items.map(item => (item === caseLine ? { ...item, unit: 'item' as const } : item));
      return { ...prevOrder, items };
    });
  }, [unitForNewLine]);
  
  const clearOrder = useCallback(() => {
    setCurrentOrder({ items: [], createdAt: new Date().toISOString() });
    audioManager.play('remove');
    vibrate([100, 50, 100]);
  }, []);

  const addProduct = useCallback((productData: Omit<Product, 'id' | 'currentStockUnits'>) => {
    // Never reuse an id that has count history, so a new product cannot inherit old counts.
    const used = usedProductIds(products, stockCountsRef.current);
    let id = `prod_${new Date().getTime()}`;
    for (let n = 2; used.has(id); n++) id = `prod_${new Date().getTime()}_${n}`;
    const newProduct: Product = {
      ...productData,
      id,
      currentStockUnits: 0, // legacy field; real stock is only ever a verified count
    };
    setProducts(prev => [newProduct, ...prev]);
    audioManager.play('add');
  }, [products]);

  const updateProduct = useCallback((productData: Product) => {
    setProducts(prev => prev.map(p => (p.id === productData.id ? productData : p)));
    audioManager.play('add');
  }, []);

  const deleteProduct = useCallback((productId: string) => {
    // Its verified counts are kept, hidden, and can never attach to another product.
    const retired = retireProductCounts(stockCountsRef.current, productId, new Date().toISOString());
    if (retired !== stockCountsRef.current) commitStockCounts(retired);
    setProducts(prev => prev.filter(p => p.id !== productId));
    // Also remove from current order if it's there
    removeFromOrder(productId);
    audioManager.play('remove');
    vibrate([100, 50, 100]);
  }, [removeFromOrder]);
  
  const addSupplier = useCallback((supplierData: Omit<Supplier, 'id'>) => {
    const newSupplier: Supplier = {
      ...supplierData,
      id: `sup_${new Date().getTime()}`,
    };
    setSuppliers(prev => [...prev, newSupplier]);
    audioManager.play('add');
  }, []);

  const value = {
    products,
    suppliers,
    currentOrder,
    deliName,
    getProductById,
    getSupplierById,
    addToOrder,
    removeFromOrder,
    updateOrderItemQuantity,
    convertOrderLineToItems,
    clearOrder,
    addProduct,
    updateProduct,
    deleteProduct,
    addSupplier,
    updateDeliName,
    getWorkflow,
    getStock,
    saveStockCount,
  };

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
};