# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TiendaMax (tiendamax.org) is a Cuban e-commerce catalog site. It is a **static site with no real backend**: product browsing is plain HTML/CSS/JS served from GitHub Pages, dynamic bits (analytics, reviews, push notifications, price tracking) live in **Firebase Realtime Database**, and the admin panel (`admin.html`) publishes catalog changes by writing files directly to this repo via the **GitHub Contents API** (using a PAT the admin pastes into their own browser's localStorage). Orders are placed via WhatsApp deep links (`wa.me/...`), not a checkout flow — there is no payment processing, no server-side order system.

Because there's no backend, **all "server-side" behavior is one of two things**: rules enforced by `firebase-rules.json` on the RTDB, or scheduled Python scripts run by GitHub Actions cron. There is no traditional app server anywhere in this repo.

## Common commands

There is no `npm install` / `npm run build` workflow — the build steps are individual Python scripts, normally run automatically by GitHub Actions on push to `main`, or manually via:

```bash
scripts/deploy.sh          # runs all four steps below, in order
python3 scripts/build_css.py       # concatenates css/*.css -> css/bundle.css (cascade order matters, see below)
python3 scripts/minify_js.py       # esbuild-minifies each js/src/*.src.js -> js/src/*.js (needs `npx esbuild`)
python3 scripts/build_js_bundle.py # concatenates the minified js/src/*.js -> js/tm-bundle.js
python3 scripts/bump_versions.py   # rewrites every `?v=<hash>` in index.html/admin.html/404.html to match
                                    # the current SHA-256 of each referenced asset (cache-busting)
python3 scripts/bump_versions.py --check   # verify without writing; exits 1 if any hash is stale
```

**After editing any `js/src/*.src.js` file you must run `minify_js.py` then `build_js_bundle.py`** (in that order) — `js/tm-bundle.js` is generated from the *minified* `js/src/*.js` files, not the `.src.js` sources directly, so editing only the `.src.js` and rebuilding the bundle silently ships stale code. Same idea for CSS: edit `css/*.css` (never `css/bundle.css` by hand), then `build_css.py`. Always finish with `bump_versions.py` or the HTML will keep pointing at old cached asset hashes.

Python deps: `pip install -r scripts/requirements.txt` (firebase-admin, requests, beautifulsoup4, Pillow). The Telegram bot has its own separate `bot/requirements.txt`.

### Tests

```bash
python -m pytest tests/ -v                  # unit tests for the Python automation scripts
python -m unittest discover -s tests -v     # what CI actually runs (run-tests.yml)
node tests/smoke-web.mjs                     # Playwright smoke test of the live site (smoke-web.yml)
```

Only a handful of scripts have unit tests today: `test_revertir_ofertas.py`, `test_update_rate_from_eltoque.py`, and `test_build_completeness.py` (which asserts every `css/*.css`/`js/src/*.src.js` file is actually listed in `build_css.py`'s `ORDEN` / `build_js_bundle.py`'s `ORDEN` — add new source files there or they'll silently never ship). There is no test coverage for `admin.html`'s inline `<script>` logic or for `index.html`'s behavior beyond the smoke test.

## Architecture

### The JS module system (js/src/)

`js/src/*.src.js` are **not ES modules** — they're classic scripts sharing one global `window` scope, so a function defined in one file is a bareword global callable from any other, including from `onclick="..."` attributes in the HTML. There are 12 modules, and **concatenation order is load order and matters** when two modules define the same function name (last one in the list wins):

```
tm-config → tm-data → tm-state → tm-admin → tm-product → tm-catalog →
tm-init → tm-ui → tm-toast → tm-iife → tm-patches → tm-agent
```

(exact order lives in `scripts/build_js_bundle.py`'s `ORDEN`). `tm-patches.src.js` and `tm-agent.src.js` load last specifically so they can override/monkey-patch functions defined earlier — check there first if a function's behavior doesn't match what its "definition" in an earlier module suggests.

`js/*.js` at the repo root (`combos.js`, `cart-share.js`, `event-delegation.js`, `tienda-plus.js`, `tm-bot.js`, `revolico_integration.js`, `admin-copilot.js`, `analytics.js`, `banners.js`, `biometric-auth.js`, `error-report.js`, `hero-efectos.js`, `push-fix.js`, `seo-dynamico.js`, `share-patch.js`, `subcategorias.js`, `urgencia-ventas.js`, `web-vitals-snippet.js`) are standalone — **not** part of the `js/src` bundle pipeline. They're loaded as individual `<script>` tags in `index.html`/`admin.html`, always *after* `tm-bundle.js`, so it's normal (not a bug) for them to call bundle globals they don't define themselves. Some of these deliberately override bundle functions post-load (`push-fix.js` replaces the bundle's FCM registration logic entirely — this is intentional, not dead code, even though it leaves the bundle's version unreachable).

### The CSS cascade (css/)

Similarly, `css/*.css` source files get concatenated (not merged/deduped) into `css/bundle.css`. **Load order is the primary way conflicting rules get resolved** — later files win ties in specificity, and several files exist specifically to override earlier ones (see the comments in `build_css.py`'s `ORDEN`). `modal-v4.css` loads last and is treated as "wins everything" by convention. `styles.css` and `premium-theme.css` are historically pre-minified (single-line) with no separate readable source — that's expected, not a build artifact gone wrong.

### admin.html vs js/src

`admin.html` has ~2000+ lines of business logic (product CRUD, GitHub publishing, combos, CSV import/export, sales tracking) inline in `<script>` tags, rather than in `js/src/*.src.js` like everything else. This is a known inconsistency, not an intentional pattern to follow for new code — but it's also large and live in production, so don't casually "fix" it by moving code around without a specific reason tied to the task at hand.

### Firebase Realtime Database and firebase-rules.json

There is **no Firebase Authentication anywhere in this codebase** (confirmed: no `signInAnonymously`/`getAuth` calls exist). Every RTDB read/write from the browser is a plain unauthenticated `fetch`. Because of this:
- `firebase-rules.json` rules that say `"auth != null"` will **reject the site's own legitimate requests**, not just attackers — that pattern is currently broken for `/admin_auth` (admin password sync across devices silently stops working after the first successful change) and must not be copied into new rules without also wiring up real Firebase Auth.
- Write protection instead uses a **knowledge-based proof pattern**: the client sends a `proof` field that must equal a stored hash (e.g. `newData.child('proof').val() === root.child('admin_auth/hash').val()`), checked server-side in the rule. This works without any auth system because Firebase security rules can read `root.child(...)` regardless of that path's own `.read` rule.
- RTDB rules cascade like directory permissions: a `.read`/`.write` grant on an ancestor path applies to all descendants and **cannot be revoked by a stricter rule on a child** — a deeply-nested `.read: false` under a node whose parent is `.read: true` has no effect.
- `firebase-admin` (Python, via `scripts/*.py`) uses a service account and bypasses all of the above rules entirely — the rules only constrain the browser.
- Several GitHub Actions workflows write to the *same* RTDB node from *different* workflows with **different `concurrency.group` values** (e.g. `send-push-notifications.yml` vs `flush-push-queue.yml` both touch `notification_queue`; `admin-alerts.yml` vs `web-health-agent.yml` both touch `admin_meta`, on the same `*/30 * * * *` cron). GitHub Actions only serializes runs *within* a concurrency group, so these can and do race — read-modify-write without a `.transaction()` on these specific nodes is a real bug, not a theoretical one.

### Data files and the "lite" catalog

`productos.json` is the full catalog (admin reads/writes this). `productos-lite.json` is the same data with `descripcion` stripped, generated by `scripts/build-productos-lite.py`, served to the public site to save payload on slow connections — several other scripts (`fill_specs.py`, etc.) also touch `productos-lite.json` directly and must preserve that "lite = no descripcion" contract rather than regenerating it from scratch.

### Python automation (scripts/) and GitHub Actions

Every script in `scripts/` (other than the build/test ones above) is triggered by a cron or `workflow_dispatch` in `.github/workflows/`, not run interactively. Check `.github/workflows/*.yml` for the actual schedule/trigger and `concurrency.group` before assuming two scripts can't interfere with each other. Notable ones: `revertir_ofertas.py` (auto-expires timed discounts), `precio_radar.py` (scrapes Revolico/Porlalivre/lelespc to compare prices), `send_notifications.py` (push queue, Firebase-backed to avoid git conflicts), `update_rate_from_eltoque.py` (USD→CUP exchange rate), `nightly_agent.py`/`admin_alerts.py`/`web_health_agent.py` (health/alerting, report to Telegram and to the admin Copilot panel).

### Other services (not part of the static site's own deploy)

- `bot/` — a separate Telegram bot (python-telegram-bot), its own `requirements.txt` and `Procfile`, deployed independently.
- `mini-services/chat-bot/` — a Cloudflare Worker (TypeScript, own `wrangler.toml`/`package.json`) backing the on-site AI chat widget (`js/tm-bot.js` calls out to it).
- `bot/cloudflare_worker.js` is a *different* Worker, deployed via the root `wrangler.toml` (`name = "tiendamax"`, weekly cron) — don't confuse it with `mini-services/chat-bot`.

### Deploy

Pushing to `main` triggers `build-css.yml` and `minify-js.yml` (both in a shared `repo-autobuild` concurrency group so they never race each other committing bundle files), which rebuild the bundles, bump cache-busting hashes, commit as `github-actions[bot]`, then trigger `pages.yml` to actually publish to GitHub Pages. `pages.yml` excludes `scripts/`, `mini-services/`, and the Firebase config files from what gets deployed. In other words: **you don't need to manually rebuild bundles before pushing** for them to end up correct on the live site — but you do need `scripts/deploy.sh` (or the individual build scripts) if you want to verify/test the built output locally before pushing, or if CI's auto-commit-back loop isn't the flow you want.
