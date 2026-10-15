# Data safety: Export My Data, and moving data between app copies

## What "Export My Data" does

**Manage → Backup & Export → Export My Data** creates one JSON file containing everything this
copy of the app has saved in the browser:

| Saved item | Storage key | In the export as |
|---|---|---|
| Products, including stock values, prices, thresholds and UPCs | `inventory_products` | `data.products` + `raw.inventory_products` |
| Suppliers | `inventory_suppliers` | `data.suppliers` + `raw.inventory_suppliers` |
| Current order draft | `inventory_currentOrder` | `data.currentOrder` + `raw.inventory_currentOrder` |
| Deli name | `inventory_deliName` | `data.deliName` + `raw.inventory_deliName` |
| Theme | `theme` | `data.theme` + `raw.theme` |
| Language | `language` | `data.language` + `raw.language` |
| Anything else saved at this address | (any key) | `raw.<key>` |

The file also records:
- `format` (`"deliordernyc-export"`) and `schemaVersion` (`1`)
- `exportedAt` (UTC timestamp)
- `source.origin`, the web address the data came from (see below)
- `summary` (counts)
- `rawChecksum` (SHA-256 of the raw section, to detect a damaged or cut-off copy)

**Exporting is read-only.** It never writes, deletes, resets or reorders anything that is stored.
Automated tests prove this (`utils/dataExport.test.ts`, "never writes to, removes from or clears
storage"), and so did an end-to-end browser run.

### Two copies of the same data, on purpose
- **`raw`** holds every stored value **exactly as it is saved**, character for character. Any
  future restore will use this section, so nothing is lost even if a value is damaged or in an
  unexpected shape.
- **`data`** is the same information decoded into readable JSON. If a stored value is damaged, it
  appears in `parseErrors` and `data` shows `null` for it, but its exact text is still in `raw`.

### Stock and price values are marked unverified
The original app filled stock with **random numbers** the first time it ran, and it never recorded
which numbers a person later typed in. Its prices are sample values. So every export says
`notes.stockValuesVerified: false` and `notes.pricesVerified: false`. See
[proposals/0001-stock-count-verification.md](proposals/0001-stock-count-verification.md).

### Getting the file out of the app
After exporting, the app checks the result against what is stored. If they match it shows
**"Verified"**. Then use any of:
1. **Download File**: saves `deliordernyc-backup-YYYY-MM-DD-HHMMSS.json`.
2. **Share File**: Android share sheet (Drive, Gmail, WhatsApp…). It only appears where the
   browser supports sharing files.
3. **Copy Text**: copies the whole export to the clipboard.
4. **Manual copy**: the full export is shown in a text box. Select all and copy. This works even
   when a preview window blocks downloads and clipboard access.

Keep at least **two copies in two places** (for example Google Drive and an email to yourself).

---

## Why a new copy of the app cannot see the old data (browser origin isolation)

Browsers store app data **per origin**: the combination of `https://` + domain + port. Data saved
by the app at one address is invisible to the same app at any other address. That is a browser
security rule, and no code can bypass it.

This means each of these is a **separate, empty storage area**:

| Where the app runs | Its storage |
|---|---|
| The Google AI Studio preview | Belongs to AI Studio's preview address |
| A GitHub Pages copy (e.g. `https://dathaze20.github.io/...`) | Belongs to that address |
| `localhost` while developing | Belongs to that port on that computer |
| The future Android APK (Capacitor) | Its own storage inside the app |
| Chrome on your phone vs. Chrome on a computer | Separate devices, separate storage |

**So the new build will not, and cannot, read data saved in the AI Studio preview automatically.**
The safe path is to export at the old address and import at the new one.

### Safe migration procedure

**Step 1. Get "Export My Data" running at the old address.**
The export button has to run *in the same place the data was saved*. If the data you want to keep
is in the AI Studio preview, add this PR's changes to that same AI Studio project:

| File | Change |
|---|---|
| `utils/dataExport.ts` | new file |
| `components/DataExportPanel.tsx` | new file |
| `components/shared/icons.tsx` | one icon added at the end |
| `contexts/LanguageContext.tsx` | new text in English, Spanish and Arabic |
| `pages/ManageProductsPage.tsx` | two lines (import + `<DataExportPanel />`) |

These files only use `react`, `framer-motion` and the app's own code, which the AI Studio import
map already provides. Not verified: I have no access to AI Studio, so whether editing the code keeps
the same preview address (and therefore the same data) is unconfirmed. Treat it as likely but
unverified. **Before pasting, don't clear browser data, don't "reset" the app, and don't open it in
an incognito window**: those use different, empty storage.

**Step 2. Export at the old address.** Open the preview and go to **Manage → Backup & Export →
Export My Data**. Wait for "Verified". Download, share or copy the file. AI Studio previews can
block downloads; if so, use Copy Text or the manual copy box, paste into a note or email, and
save it as a `.json` file.

**Step 3. Check the file.** The summary should show your product, supplier and order-line counts.
`source.origin` in the file records exactly which address it came from.

**Step 4. Import into the new build (future PR, not part of this one).** A later milestone adds
**Restore** with these rules:
- it shows a preview before changing anything
- it takes an automatic backup of the destination first
- it never silently merges into existing data
- it re-checks `rawChecksum` and refuses damaged files

**Step 5. Keep the old copy untouched** until the new one has been in daily use for a while. Nothing
in this procedure deletes the old data.

### Alternative: a computer with Chrome DevTools (no code changes)
If you can open the old app on a computer:
1. Open DevTools (F12) and pick the app's frame in the Console's context dropdown. (In AI Studio
   the app runs inside an embedded frame, not the top page.)
2. Run:
   ```js
   copy(JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])), null, 2))
   ```
3. Paste into a text file and save it.

That gives the same content as the `raw` section of an export. It isn't verified and has no
checksum, so prefer the in-app export when possible.

---

## Known pre-existing risks (not changed by this PR)

These are behaviours of the original app. This PR deliberately leaves them alone so that
existing behaviour is unchanged:

1. **First launch at a new address writes randomly generated stock values.** This affects new
   installs only; existing data is never regenerated.
2. **Damaged stored data is silently replaced.** If a stored products, suppliers or order value
   can't be read, `contexts/InventoryContext.tsx` falls back to the built-in sample data, and its
   save effect then **writes that sample data over the unreadable original**. This is unlikely,
   because it needs damaged storage. The proposed fix for the next safety PR: before falling back,
   copy the unreadable text to a recovery key and show a warning. Exporting **before** that
   happens captures the original text in `raw`.
3. **Deleting a product has no confirmation or undo.**
4. **There is no restore/import yet.** Export is the first half; restore comes with the new data
   layer.
