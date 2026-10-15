# Data safety: Export My Data, and moving data between app copies

## What "Export My Data" does

**Manage → Backup & Export → Export My Data** creates one JSON file containing everything
DeliOrderNYC has saved in the browser at this web address:

| Saved item | Storage key | In the export as |
|---|---|---|
| Products, including stock values, prices, thresholds and UPCs | `inventory_products` | `data.products` + `raw.inventory_products` |
| Suppliers | `inventory_suppliers` | `data.suppliers` + `raw.inventory_suppliers` |
| Current order draft | `inventory_currentOrder` | `data.currentOrder` + `raw.inventory_currentOrder` |
| Deli name | `inventory_deliName` | `data.deliName` + `raw.inventory_deliName` |
| Theme | `theme` | `data.theme` + `raw.theme` |
| Language | `language` | `data.language` + `raw.language` |
| Any other `inventory_…` or `deliordernyc_…` key (app data this version doesn't know by name) | (prefix) | `raw.<key>` |
| Data saved by **other apps** at the same address | (any other key) | **Not included** unless you tick the box (see Privacy) |

The file also records:
- `format` (`"deliordernyc-export"`) and `schemaVersion` (`1`)
- `exportedAt` (UTC timestamp)
- `source.origin`, the web address the data came from (see below)
- `summary` (counts)
- `storageKeys`: which keys were included, and the **names and sizes only** of any keys left out
- `rawChecksumAlgorithm` (`"SHA-256"`) and `rawChecksum` (SHA-256 of the raw section, to detect a
  damaged or cut-off copy; `null` if the browser could not compute it)

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

### Privacy: other apps' data at the same web address
Several apps can share one web address. For example, every project on `dathaze20.github.io`
shares the same browser storage. The export is careful about this:

- **Included automatically:** the six keys the app uses today, plus any key starting with
  `inventory_` (the prefix the app has always used for its data) or `deliordernyc_` (reserved for
  future data). Deli data is never dropped, even if this version doesn't recognize the key.
- **Never included silently:** every other key. Before you export, the panel lists those keys by
  **name and size only**, never their contents.
- **Never dropped silently:** if one of them is actually deli data, tick **"Also include these
  items in the export"**. The file's `storageKeys` section always records what was included and
  what was left out (names and sizes only).

### Integrity: what "Verified" means
After exporting, the app re-reads the file it produced and gives it one of three statuses. A future
**Restore** will use the same check.

| Status | Shown as | Meaning | What a restore may do |
|---|---|---|---|
| **verified** | green "Verified" | The SHA-256 checksum is present and well formed, it was recomputed and matched, and the file matches what is stored | Restore after the normal preview |
| **unverified** | amber "Exported, but NOT cryptographically verified" | The data is there, but its integrity could not be proven: the checksum is missing, or this browser could not compute SHA-256 | Restore only after an explicit "I understand this backup is unverified" confirmation |
| **invalid** | red "Verification failed" | The checksum is malformed or doesn't match, the file is cut off or isn't an export, or it differs from what is stored | Never restore automatically |

Only a recomputed, matching checksum can produce **verified**. If Web Crypto is unavailable (for
example on a non-HTTPS page), you can still export and download your data as a rescue copy. It is
saved with `rawChecksum: null` and is always labelled unverified, never verified.

### Getting the file out of the app
Use any of:
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
Export My Data**. Wait for the status: green "Verified" is what you want. An amber "unverified"
file still contains your data, so keep it. If the panel lists "other saved data", tick the box only
for items you recognize as deli data. Download, share or copy the file. AI Studio previews can
block downloads; if so, use Copy Text or the manual copy box, paste into a note or email, and
save it as a `.json` file.

**Step 3. Check the file.** The summary should show your product, supplier and order-line counts.
`source.origin` in the file records exactly which address it came from.

**Step 4. Restore into the new build.** In the new copy, open **Manage → Restore from Backup**,
choose the file (or paste its text), and check it. The app shows what will change, takes a verified
safety snapshot of the destination, and only then replaces the data. See "Restore from Backup" below.

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

## Restore from Backup

**Manage → Restore from Backup** replaces DeliOrderNYC's data on this device with a backup file.
There is no merge: the device ends up matching the backup, and **Undo Last Restore** puts back
exactly what was there before.

### What is checked before anything changes
1. The file is checked exactly like an export (see "Integrity"):
   - **Invalid** files cannot be restored at all.
   - **Unverified** files need a ticked *"I understand this backup is unverified"*.
2. Every DeliOrderNYC value in the file must pass the same shape checks the app uses when it
   starts (`utils/dataValidation.ts`). A backup with corrupted products, suppliers or order data is
   refused, even if its checksum matches.
3. **Only DeliOrderNYC's own keys are restored.** Other apps' keys found in a backup (early PR #1
   exports included every key) are listed and **never written**. Other apps' data on the device is
   never touched.
4. A preview lists what will change:
   - product, supplier and order-line counts
   - which products would be **removed** (by name, in red)
   - which products change, and which fields (for example `costPrice`, `currentStockUnits`)
   - deli name, theme and language changes
5. You tick *"I understand this replaces DeliOrderNYC's data on this device"*.
6. **The preview must still be true.** The app remembers the exact deli data the comparison was
   made from. If anything changes before the restore writes (a price, a stock count or the order,
   on this page or in another tab), the restore is refused, nothing is changed, and the preview is
   cleared. You have to check the backup again and confirm the new comparison. Changes to other
   apps' data never block a restore.

### How a restore is protected
Browser storage (`localStorage`) cannot change several values in one all-or-nothing step, so a
restore is **not atomic**, and the app does not claim it is. Instead, every step is recorded before
the next one starts (`utils/dataRestore.ts`):

| Step | What happens | If it fails |
|---|---|---|
| 1 | Refuse if an earlier restore is unresolved, the browser can't compute SHA-256, or there isn't room for twice the snapshot and journal plus 1 MB | Nothing changed |
| 2 | Pause all automatic saving in this tab; set a lock other tabs listen for | Nothing changed (if storage is too full for the lock, restore refuses) |
| 3 | Save a **safety snapshot** of the current data to IndexedDB, read it back, and verify it byte-for-byte and by SHA-256. The snapshot must equal the reviewed preview. | Nothing changed |
| 4 | Save a **journal** (the snapshot's id and the exact target data) to IndexedDB and read it back | Nothing changed |
| 4b | **Immediately before the first write**, check the data still equals the snapshot and the reviewed preview. This also runs for Undo and Start Fresh, so a save from another tab after the snapshot is never lost. | Refused: nothing changed; only this restore's own unused snapshot and journal are removed |
| 5 | Write the backup's values, remove deli keys not in the backup, then **read everything back** | → step 6 |
| 6 | Match: clear the journal and reload. Error or mismatch: **write the snapshot back and read it back** | → step 7 |
| 7 | If even that fails: keep the journal, snapshot and lock, keep saving paused, refuse every further restore, and show the **Data Recovery Needed** screen | — |

**If the phone dies or the browser closes at any point**, the journal is still in IndexedDB. On the
next start, before any screen loads:
- if every value was already written, the restore is finished;
- otherwise the snapshot data is put back.

A rollback that still fails shows the recovery screen. From there you can:
- download the pre-restore data,
- download the backup that was being restored (as a normal export file), or
- retry.

Tests cover each of these cases, both in unit tests and in a real browser (`e2e/interrupted.spec.ts`,
`utils/dataRestore.test.ts`).

### Recovery snapshots and storage limits
- Snapshots and the journal live in **IndexedDB**, separate from the app's data. A snapshot only
  contains DeliOrderNYC's data keys, never other snapshots, journals or restore control keys
  (`deliordernyc_sys_…`), so they cannot grow recursively.
- **Up to 3** verified snapshots are kept. Older ones are removed only *after* a newer one has been
  saved and verified, never to make room. If there isn't room for a new snapshot, the restore is
  refused and existing snapshots are left alone.
- Browser storage is not permanent. Each snapshot has a **Download** button: keep important
  snapshots as files.
- If IndexedDB is unavailable (some private modes), restore is disabled and says why. Export still
  works.

### Multiple tabs
- Only one restore can run at a time across tabs. This uses the browser's Web Locks, which are
  released automatically if a tab crashes.
- While a restore runs, other open tabs pause saving and reload when it finishes, so they can't
  write old data over the restored data.

## Protection while the app is running

### Unreadable saved data is never overwritten
If saved products, suppliers or order data can't be read when the app starts, the original text is
**left exactly as it is**, and saving that one item is **blocked**. The app shows sample data in
memory and a red banner. From there you can:
- **Export** (the export includes the original text, so it can be rescued or repaired), or
- **Restore** a backup, or
- **Start Fresh with Sample Data**. This needs confirmation, and saves the original in a downloadable
  safety snapshot first.

Before this PR, the original was replaced by the sample data on startup.

### Changes from another tab or window are never overwritten
Each page remembers the exact value it last loaded or saved. If another tab or window saves a newer
value, this page **refuses to save its older copy over it**. It shows "Changed in another tab or
window" with a Reload button.

Before this PR, the last page to save silently won. With a single tab, nothing changes.

## Remaining known risks

1. **First launch at a new address writes randomly generated stock values.** This is unchanged, and
   is planned in [proposals/0001-stock-count-verification.md](proposals/0001-stock-count-verification.md).
2. **Deleting a product has no confirmation or undo.** Unchanged; planned for the UI redesign.
3. **Restore is not atomic** (see above). The journal makes it recoverable, but the browser could
   in principle fail in ways the app cannot repair itself, for example when IndexedDB itself is
   lost. In that case the recovery screen keeps everything paused and downloadable, and nothing is
   deleted.
4. **Free-space checks are estimates.** `navigator.storage.estimate()` covers IndexedDB, but the
   separate `localStorage` limit (about 5 MB) can't be measured in advance. If it runs out during a
   restore, the restore rolls back.
5. **The last check before writing narrows the window to a few milliseconds but cannot close it.**
   Another tab runs in its own process, so a save from it could in principle land between that
   check and the writes. Other tabs pause their saving as soon as the restore starts, which makes
   this very unlikely, and the journal and snapshot still allow Undo.
6. **Browsers without Web Locks** fall back to the storage-event signal between tabs, which doesn't
   stop two restores started at exactly the same moment. Current Chrome on Android and Safari
   support Web Locks.
