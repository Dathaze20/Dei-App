# Proposal 0001: Separate verified stock counts from unknown/sample values

**Status:** Proposal for review. **Not implemented.** No stored data is changed by this document or
by the PR that adds it.

## Problem

1. The original app sets `currentStockUnits` to a **random number** (0 to 2 cases' worth of units)
   for every product the first time it runs at a new address (`getRandomStock` in
   `contexts/InventoryContext.tsx`).
2. Any value a person later types in overwrites the random one **with no record that it was typed**.
   There is no timestamp, no "counted" flag and no history.
3. So for existing data, **a sample number and a real count cannot be told apart.** Both are a plain
   integer in `inventory_products`.

Stock warnings, order suggestions and the future assistant all depend on these numbers. Acting on
invented quantities is the failure we most want to avoid.

## Principles

- **Never delete or overwrite an existing value.** Every legacy number is kept exactly as it was.
- **Never guess which values are real.** No heuristic. A random seed can produce any number a
  person could type.
- **"Unknown" is a real state**, distinct from 0.
- A value becomes **verified** only when someone counts and saves it in the new app.

## Proposed model (part of the data-layer milestone)

For each product, stock becomes:

```ts
type StockRecord = {
  onHand: number | null;          // null = not counted yet (≠ 0)
  status: 'unverified' | 'counted';
  countedAt: string | null;       // ISO time of the last real count
  legacyValue: number | null;     // the exact old currentStockUnits, preserved forever
};
```

Plus an append-only **count log**: `{ productId, onHand, unit, countedAt, source: 'manual' }`.
Every Save / Save & Next in the counting screen adds an entry.

Stock is counted in the product's own unit (bottles, cans, bags, lb). Fractions are allowed only
for weighed items. It is never counted in cases. Cases are an ordering concept and live on the
supplier link (`unitsPerCase`).

## Migration rule (one time, when the new data layer first starts)

1. **Automatic backup first.** The app produces the same export as "Export My Data". The migration
   does not continue unless the export verifies.
2. For every existing product:
   `legacyValue = currentStockUnits`, `status = 'unverified'`, `countedAt = null`,
   `onHand = currentStockUnits` (kept for display, but flagged).
3. Products with no stored value get `onHand = null` and `status = 'unverified'`.
4. **The old `localStorage` keys are left exactly as they are.** The new data lives in a new store
   (IndexedDB). Rolling back to the old build still finds everything.
5. A migration record `{ fromSchema: 0, toSchema: 2, at, backupChecksum }` is stored so the step
   never runs twice.

## How unverified values behave in the app

| Situation | Display | Low-stock warning | Order suggestion |
|---|---|---|---|
| `counted` | `4 bottles` | Yes, normal rules | Yes |
| `unverified` with legacy number | `≈5 · not verified`, greyed | **No.** Listed under "Not counted yet" | **No** |
| never counted (`null`) | `—` | No | No |

Counting an item once (keypad → Save) makes it `counted`. A one-tap **"Confirm this number"** on an
unverified row lets you accept the legacy value as a real count when you know it's right. That is
an explicit human decision, logged like any count.

## The same rule for prices

Seed prices get `priceSource: 'example'`. Totals that include any example price show **"est."**.
Prices are left out of order messages by default until confirmed (`priceSource: 'manual'`).
Existing price values are never changed by the migration.

## What this proposal deliberately does not do

- It does not replace or zero existing stock values.
- It does not try to detect random values.
- It does not change order quantities, ordering calculations or sharing.

## Decisions needed

1. Approve treating **all** existing stock values as unverified (recommended: they can't be told apart).
2. Approve showing unverified legacy numbers greyed with "≈", rather than hiding them.
3. Approve the "Confirm this number" shortcut.
