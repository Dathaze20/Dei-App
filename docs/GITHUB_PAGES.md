# Testing on a phone with GitHub Pages

The workflow `.github/workflows/pages.yml` publishes the reviewed `main` branch to
**https://dathaze20.github.io/Dei-App/**. It is for personal testing on the Galaxy A17.

## It never publishes by itself

- It runs **only** when you press **Run workflow** in the Actions tab. Pushes, pull requests and
  merges never publish anything.
- It builds **`main` only**. A run started from any other branch is skipped.
- Before publishing it type-checks, runs the unit tests, scans the build for secrets and checks
  that every file is served under `/Dei-App/`. If any step fails, nothing is published.
- CI also builds the Pages version on every pull request (job "GitHub Pages build check") and
  opens it in a browser with the internet blocked. That job never publishes.

## One-time setup (you do this once)

1. On GitHub, open the repository → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**. Leave everything else.
3. Optional but recommended: **Settings → Environments → github-pages → Deployment branches**
   → allow only `main`.

## Publishing (each time you want to test a new `main`)

1. Open **Actions → Deploy to GitHub Pages (manual)**.
2. Press **Run workflow**, keep the branch on **main**, press the green **Run workflow** button.
3. When both jobs are green (about 2 minutes), open https://dathaze20.github.io/Dei-App/ on the
   phone. A page you already had open may need a refresh; GitHub Pages caches pages for up to
   10 minutes.

To go back to an earlier version, revert the change on `main` and run the workflow again, or
turn Pages off under Settings → Pages. Republishing never touches the data saved on your phone.

## Your data on the Pages address

Browsers keep each web address's data separate. The app's data (products, suppliers, order,
stock counts, settings) is saved **in the phone's browser for that address only**.

- The first time you open the Pages address it is **empty**. The app creates its sample catalog,
  and every product shows "Not counted".
- Nothing at any other address is read, changed or deleted: not the AI Studio version, not a
  local copy, not another app.
- **To bring data over:** open the app where your data is now → **Manage → Backup & Export →
  Export My Data** → save the file. Then open the Pages address → **Manage → Restore from
  Backup** → choose that file → check the preview → confirm. A safety snapshot is made first and
  the restore can be undone.
- The same Export → Restore steps move data the other way, or later into the Android app.

## Things to know

- **Public link.** Anyone who has the address can open the app. Each person's data stays in their
  own browser. The build contains no API keys or secrets (it is scanned on every build).
- **Shared address.** `dathaze20.github.io` is shared by every GitHub Pages site on your account.
  DeliOrderNYC's saved data uses its own names (`inventory_…`, `deliordernyc-…`) and never reads,
  exports or restores another app's data. But "Clear site data" for `dathaze20.github.io` in
  Chrome would clear every app published there, and they share the browser's storage space.
  A custom domain can separate them later if needed.
- **Internet still needed to open it.** The app has no offline install (service worker) yet, and
  sample product pictures load from the internet. Once open, it keeps working if the connection
  drops.
- **Publish `main` only.** Don't publish unreviewed branches to the address you use day to day:
  they would run against your real data on the phone.
