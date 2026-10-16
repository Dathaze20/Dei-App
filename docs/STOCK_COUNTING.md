# Verified stock counting and supplier workflows (C1)

## Rules

- Stock is counted in **individual physical units** (cans, bottles, bags), as whole numbers.
  Orders to suppliers are placed in **cases**. The two are kept separate.
- **Unknown is not zero.** A product nobody has counted shows "Not counted · old: N". The old
  number `N` is the original app's `currentStockUnits`, which was seeded with random numbers, so it
  is never shown as a real count, and an old 0 does not mean out of stock.
- Only **verified counts** can show "Low stock" or "Out of stock".
- A count is saved only when **Save count** is pressed. Blank, decimal or negative input is
  refused (never turned into 0). "Count saved" appears only after the count is in storage.
- An old number can become a count only after ticking "I physically counted this product and
  there are exactly N units".

## Data: `inventory_stockCounts`

The single source of truth for counted stock. Written only when a count is saved; never at
startup. A device that never counts has exactly the same storage as before C1.

```json
{
  "schemaVersion": 1,
  "products": {
    "az_rx_fruitpunch_slim11_5": {
      "counts": [
        { "units": 18, "countedAt": "2026-10-15T13:40:00.000Z", "source": "classic", "unitsPerCaseAtCount": 24 },
        { "units": 20, "countedAt": "2026-10-12T11:05:00.000Z", "source": "classic", "unitsPerCaseAtCount": 24 }
      ]
    }
  },
  "retired": [{ "productId": "…", "retiredAt": "…", "counts": [] }]
}
```

- The two most recent counts per product, newest first.
- `source`: `classic` (Classic View), `confirmed-legacy` (old number confirmed after a physical
  check). `counter` is reserved for The Counter.
- `retired`: counts of deleted products, kept hidden. New products never get an id that has count
  history, so a deleted product's counts can never attach to another product.
- `inventory_products` and every `currentStockUnits` value are never written by counting.
  `updateProductStock` was removed. `saveStockCount` (in `InventoryContext`) is the only way to
  record stock, for Classic View now and The Counter later.

### Protection

Same as all other saved data (see [DATA_SAFETY.md](DATA_SAFETY.md)):

- Validated on load. If it is unreadable, its text is kept untouched and saving is blocked. A
  banner explains, and every product shows "Stock count can't be read". Nothing is shown as
  counted.
- Changed in another tab after this page loaded: this tab's save is refused ("Count NOT saved")
  and the newer counts are kept.
- Included in Export My Data, restore snapshots, Undo and interrupted-restore recovery.
- Restoring a backup that would remove or replace this device's verified counts shows a red
  warning and needs its own checkbox before Restore is allowed. It lists:
  - counted products that have no count in the backup (for example any backup made before C1);
  - products whose latest count here would be replaced by an older or different count from the
    backup (a backup with a newer count is not a loss);
  - hidden count history of deleted products that the backup does not have;
  - or, if this device's counts cannot be read, that they cannot be compared and will be replaced.

  A safety snapshot is saved first, and Undo brings the counts back.
- Deleting a product first moves its counts to `retired`. If that cannot be saved (storage full),
  or the counts are unreadable or were changed in another tab, the product is **not** deleted
  and the Manage page says why. Nothing is changed.

## Supplier workflows

`utils/supplierWorkflow.ts` decides, per supplier, whether its products are stock-counted and
how it is ordered. Defaults are in code; nothing is stored.

| Supplier | Stock counting | Ordering |
| --- | --- | --- |
| Boar's Head (`sup1`) | No | Plain item list: whole numbers, no case wording, no prices |
| Every other supplier, including new ones | Yes | Cases, priced as before |

A future settings screen can pass per-supplier overrides to the same resolver.

### Boar's Head orders

- New lines are saved as `{ "productId": "bh_turkey", "quantity": 1, "unit": "item" }`.
- Case lines keep their pre-C1 shape (no `unit`) for every other supplier.
- A Boar's Head line saved before C1 has no `unit` and **still means cases**. It is shown as
  "2 case(s) · earlier order line, in cases" until someone taps **Change to items** and
  confirms. Nothing is converted automatically.
- Boar's Head lines are never priced. The order page and the shared text (QR code, Copy Text,
  Send as Text) show "Not priced", and when such lines are present the dollar figure is labelled
  **Priced subtotal**, not Total.
- An order with only priced case lines produces exactly the same shared text as before C1
  (tested byte for byte). The Arizona example still totals $77.98.

The dedicated MEATS / CHEESES weekly order screen is planned for The Counter (C2).

## Compatibility

- Old backups restore normally (they simply have no counts).
- New backups opened in an older version of the app: `inventory_stockCounts` is kept as an
  unknown app key. **An older version would read Boar's Head item lines as cases** (it does not
  know the `unit` field). Do not go back to an older version with item lines in the current order.
