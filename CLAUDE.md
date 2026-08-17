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

`tests/` holds ~375 unit tests. `test_build_completeness.py` asserts every `css/*.css`/`js/src/*.src.js` file is actually listed in `build_css.py`'s `ORDEN` / `build_js_bundle.py`'s `ORDEN` — add new source files there or they'll silently never ship. There is still no coverage for `admin.html`'s inline `<script>` logic beyond the smoke test.

Several tests exist because the failure they catch is **silent** — nothing errors, the page renders, and the damage only shows up in the live site or in Google. Read these before "simplifying" them away:

- `test_imagen_en_uso.py` (+ `imagen_en_uso_check.mjs`) — guards the check that decides whether a photo can be deleted from the repo. It got this wrong once and deleted a product's only photo.
- `test_enlazado_interno.py` — asserts no `/c/` or `/p/` page is left without incoming links and no product page is a dead end. Orphan pages serve fine and break nothing; they just rank badly.
- `test_contraste.py` — WCAG ratios for the generated pages, plus a check that the colours it validates are still the ones the generator writes.
- `test_alcance.py` — walks from the roots (HTML `onclick`/`data-action`, plus each file's top-level code) and follows the calls. `test_codigo_muerto.py` only counts *references*, which cannot see a clique: 23 functions in `revolico_integration.js` kept each other "referenced" while the only door into the group rendered into a container that does not exist. Nothing errored; the bundle just shipped them to every phone.
- `test_ids_fantasma.py` — `getElementById('x').algo` where no HTML creates `#x`. A null that gets checked is fine and common on purpose (one bundle serves index/admin/product pages); a null dereferenced immediately throws and silently truncates the rest of the function. That is how `cargarConfiguracionGitHub` filled three fields and then died, invisibly, on every ⚙️ Configuración.
- `test_cola_vigente.py` + `notificaciones_check.mjs` — a push sits in the customer's tray with frozen text until they swipe it away, so "🏷️ 4 productos rebajados" has to be true *at send time* and cannot be corrected afterwards. The queue fills every cron run but only drains in daylight hours, and in between products sell out, discounts get reverted by `revertir_ofertas.py`, and the same product gets `extend`ed in twice.
- `test_llamadas_vs_reglas.py` — crosses every browser→RTDB call with the rule governing its path. Note it only sees literal `fetch('.../x.json')` calls: a URL built in a variable, or a `navigator.sendBeacon`, is invisible to it (that's why `/web_vitals` has its own contract test inside `test_web_vitals.py`).

`node tests/lighthouse-report.mjs` is not part of the unittest suite — it needs network and Chrome, and runs weekly from `lighthouse.yml`.

## Architecture

### The JS module system (js/src/)

`js/src/*.src.js` are **not ES modules** — they're classic scripts sharing one global scope, so a function defined in one file is a bareword global callable from any other, including from `onclick="..."` attributes in the HTML. **Careful: top-level `let`/`const` do NOT become `window` properties** — `productos`, `categorias` and `wishlist` are `let`, so `window.productos` is `undefined` and reading it that way silently yields nothing. Reference them by bareword (guarded with `typeof`) instead.

There are 14 modules in the bundle, and **concatenation order is load order and matters** when two modules define the same function name (last one in the list wins):

```
tm-iconos → tm-config → tm-data → tm-state → tm-admin → tm-crm →
tm-product → tm-catalog → tm-publicar → tm-init → tm-ui → tm-toast →
tm-iife → tm-patches
```

(exact order lives in `scripts/build_js_bundle.py`'s `ORDEN`). `tm-patches.src.js` loads last specifically so it can override/monkey-patch functions defined earlier — check there first if a function's behavior doesn't match what its "definition" in an earlier module suggests.

Two more modules live in `js/src/` but are deliberately **out** of the bundle (`STANDALONE` in `build_js_bundle.py`): `tm-bot.src.js` (the chat bubble/panel) and `tm-bot-cerebro.src.js` (the assistant's whole brain, ~130 KB minified). The shell injects the brain only when a customer actually opens the chat, via the URL in `<meta name="tm-bot-cerebro">` — which lives in the HTML so `bump_versions.py` keeps its cache-busting hash in sync. The bot answers entirely in the browser: there is no chat backend, and **no LLM anywhere** — every answer is deterministic JS matched against the live catalog. `mini-services/chat-bot/` is the retired Cloudflare Worker it used to call (TypeScript, not Python), kept only for reference; its README explains why it was dropped. Anything proposing LangChain / a vector DB / RAG / function calling for this bot is proposing to rebuild that backend, with the per-message cost, the API key and the outage surface that removing it avoided.

When the bot "arma un sistema" (`R.sistemaSolar`/`sistemaSeguridad`/`sistemaInternet`), `_armarSistema()` walks the catalog **once** and returns the role→products structure; the three builders only render it. That structure is what feeds `cotizacionHTML()`, the printable technical proposal behind the "📄 Descargar cotización" button — a standalone HTML document opened in a new tab and printed with the browser's own "Save as PDF". Deliberately **no jsPDF/html2canvas**: the brain is downloaded whole the first time anyone opens the chat, on 3G. Note `_capacidadBateria()` returns `null` when a battery doesn't declare Ah *and* V, unlike `R.autonomia` which assumes 100Ah×12V so the chat can still answer — the quote is a paper the customer shows an installer, where a supposed number reads as a measured one. `tests/cotizacion_check.mjs` guards exactly that.

`R.diagnostico` (fault triage) follows the same rule and it is the whole point of the module: the `DIAGNOSTICO` table holds only **symptom** patterns that hold for a whole device family, while manufacturer-specific numeric codes live in `codigos-error.json` (ships with `marcas: {}` — it gets filled by copying manuals). When a code isn't there, Max says so and asks for make and model instead of translating it; when it can still infer from symptoms, the "I don't have this code" notice is printed **before** the inference and the inference is labelled as one. Don't "improve" that into a confident answer. `tests/test_diagnostico.py` also validates the shape of any code the admin adds — a malformed entry fails no differently from a missing one at runtime.

`js/*.js` at the repo root (`combos.js`, `cart-share.js`, `event-delegation.js`, `tienda-plus.js`, `revolico_integration.js`, `admin-copilot.js`, `analytics.js`, `banners.js`, `biometric-auth.js`, `error-report.js`, `hero-efectos.js`, `push-fix.js`, `seo-dynamico.js`, `share-patch.js`, `subcategorias.js`, `urgencia-ventas.js`, `web-vitals-snippet.js`) are standalone — **not** part of the `js/src` bundle pipeline. They're loaded as individual `<script>` tags in `index.html`/`admin.html`, always *after* `tm-bundle.js`, so it's normal (not a bug) for them to call bundle globals they don't define themselves. Some of these deliberately override bundle functions post-load (`push-fix.js` replaces the bundle's FCM registration logic entirely — this is intentional, not dead code, even though it leaves the bundle's version unreachable). `tienda-plus.js` also post-processes whatever the bundle rendered: it walks `.producto-card`/`.rel-card` and makes them keyboard-operable, so a change to how cards are built in `tm-ui.src.js` can be silently undone there.

### The poster generator (`js/admin-copilot.js`)

Four templates share one entry point (`window.tmCartelHTML` → `_cartelHTMLPorVariante`), chosen once in the admin and reused by the WhatsApp Status button, the Facebook/groups modal and `revolico_integration.js`: `clasico`, `pro2`, `horizontal` (1200×675, the only landscape one) and `tecno` (routers/energy/audio). Adding a fifth means touching **two** selectors — the Copiloto's Marketing panel and `pubSetCartelVariante` in `admin.html` — plus `tmCartelCardSize()` if it isn't 760×1140. All four take their accent from `_cartelColorPara()`, which prefers the per-category colour over the manual picker.

The templates return an HTML string that gets `innerHTML`'d and later captured by html2canvas, so **nothing in them can depend on a `<script>` running**. `tecno` needs a generated circuit background; it builds it once on an offscreen canvas and caches the data URI rather than shipping hundreds of lines of SVG path.

Product data going into a poster comes from `_cFeatures()`, which returns *sentences* from the "Ficha Técnica" block, not tidy values. `tecno` has its own extractors (`_tcpTValorCorto`, `_tcpTSpec`, `_tcpTDato`) because clipping those sentences by character count produced labels like "VELOCIDADES DE HASTA…". Watch out for two shapes in real data: specs written as `Etiqueta: valor`, and specs that are only a value (`12.8V`, `100AH`) with no label at all.

### The CSS cascade (css/)

Similarly, `css/*.css` source files get concatenated (not merged/deduped) into `css/bundle.css`. **Load order is the primary way conflicting rules get resolved** — later files win ties in specificity, and several files exist specifically to override earlier ones (see the comments in `build_css.py`'s `ORDEN`). `modal-v4.css` loads last and is treated as "wins everything" by convention. `styles.css` and `premium-theme.css` are historically pre-minified (single-line) with no separate readable source — that's expected, not a build artifact gone wrong.

### admin.html vs js/src

`admin.html` has ~2000+ lines of business logic (product CRUD, GitHub publishing, combos, CSV import/export, sales tracking) inline in `<script>` tags, rather than in `js/src/*.src.js` like everything else. This is a known inconsistency, not an intentional pattern to follow for new code — but it's also large and live in production, so don't casually "fix" it by moving code around without a specific reason tied to the task at hand.

### Firebase Realtime Database and firebase-rules.json

The **owner signs in with a Firebase Authentication account** (`js/auth.js`, `TMAuth`); the storefront is still anonymous, and every RTDB call from a customer is a plain unauthenticated `fetch`. That split is where this file's rules get dangerous in both directions:
- `firebase-rules.json` rules that say `"auth != null"` on a path the **public site** uses will reject the site's own customers, not just attackers. `/admin_auth` had one and it silently broke password sync across devices. `tests/test_auth.py` keeps the list of paths the storefront touches without an account; check it before adding `auth` anywhere.
- `auth != null` **on its own protects nothing here.** The Firebase Web API key is public — it ships inside `firebase-messaging-sw.js` — so anyone can create an account against this project and be authenticated. Private paths pin the owner's uid instead: `auth != null && auth.uid === root.child('admin_uid').val()`, claimed once via `/admin_uid` (`.write` requires `!data.exists()` and `newData.val() === auth.uid`).
- **Read rules cannot see anything the client sends.** The `proof` trick below only works for writes, because the client *sends* the hash in the payload. A read is just a GET — there is nothing to check against. So a read rule can only ask *who* is asking, never *what* they are asking for: there is no way to say "you may read your own row". Closing a path for reading therefore means the public site must stop reading it at all, not read less of it.
- That is exactly what happened to `/tokens`, `/avisos_stock` and `/wishlist_avisos`, which each store a customer's push token and were `".read": true` — anyone could type the URL and get the list of who follows the shop. They are now owner-only. The storefront still **writes and deletes its own entry without an account**, which is what keeps push registration working; it just never lists. The push registration used to read the whole `/tokens` list to clean up its old rows, and that single read was what forced the node open — unnecessary, because the write key *is* the device id, so a PUT overwrites the device's own row.
- **Closing a read without signing the panel's calls leaves the admin staring at zeros**, indistinguishable from having no data. The signing helpers are `TMAuth.fetchPrivado` (js/auth.js), `jget` (admin.html), `_fbAuthQS` (tm-ui.src.js), `_tmFirmar` (analytics.js) and `_firma`/`_PRIVADAS` (admin-copilot.js) — each with its own list of which paths get `?auth=`. Add a newly-closed path to all of them, not just the one you are looking at.
- Write protection instead uses a **knowledge-based proof pattern**: the client sends a `proof` field that must equal a stored hash (e.g. `newData.child('proof').val() === root.child('admin_auth/hash').val()`), checked server-side in the rule. This works without any auth system because Firebase security rules can read `root.child(...)` regardless of that path's own `.read` rule.
- RTDB rules cascade like directory permissions: a `.read`/`.write` grant on an ancestor path applies to all descendants and **cannot be revoked by a stricter rule on a child** — a deeply-nested `.read: false` under a node whose parent is `.read: true` has no effect.
- `firebase-admin` (Python, via `scripts/*.py`) uses a service account and bypasses all of the above rules entirely — the rules only constrain the browser.
- GitHub Actions only serializes runs *within* a concurrency group, so two workflows touching the same RTDB node from different groups can and do race — read-modify-write without a `.transaction()` on a shared node is a real bug, not a theoretical one. The two known cases are already handled and are worth copying rather than re-breaking: the three workflows that run `send_notifications.py` share one group so they can't overlap on `notification_queue`, and `admin-alerts.yml`/`web-health-agent.yml` still run on the same `*/30 * * * *` cron in *different* groups but no longer collide because each writes only its own children of `admin_meta` (`update()` with a fixed key set, never `set()` on the parent).
- `/web_vitals/{día}` is written by `js/web-vitals-snippet.js` from a sample of real visits and read/pruned by `web_health_agent.py`. Append-only, one child per sample: it is written with POST so Firebase mints the key and two simultaneous visits can't overwrite each other.

### Post-sale follow-up (`js/src/tm-crm.src.js`)

The Clientes tab had always derived its customer list from `VENTAS` (reading `v.cliente` / `v.telefono`) but the sale form never asked for either, so the table was permanently empty. The sale form now captures both (optional), and `tm-crm.src.js` turns them into follow-ups at 3 / 30 / 90 days, surfaced in Clientes → 📞 Seguimiento with pre-filled `wa.me` links.

Two rules are load-bearing. **Customer name and phone stay in localStorage** — `registrarVentaPedido` also mirrors the order into Firebase `/pedidos/$id`, which is `".read": true`, so anything put there is world-readable; that payload is built field-by-field on purpose and must never be handed the whole `venta` object. And each milestone has a `ventana`: past it, the milestone is skipped rather than sent late, and only the most advanced due milestone fires — otherwise a customer gets three messages at once after the admin has been away. `tests/crm_check.mjs` pins both, plus `test_crm.py` greps the Firebase payload for leaked customer fields.

### Data files and the "lite" catalog

`productos.json` is the full catalog (admin reads/writes this). `productos-lite.json` is the same data with `descripcion` stripped, generated by `scripts/build-productos-lite.py`, served to the public site to save payload on slow connections — several other scripts (`fill_specs.py`, etc.) also touch `productos-lite.json` directly and must preserve that "lite = no descripcion" contract rather than regenerating it from scratch.

### Python automation (scripts/) and GitHub Actions

`scripts/regenerate_artifacts.py` (697+ lines, run by `regenerate-artifacts.yml`) is the one that generates the **static, indexable** part of the site: 118 `/p/producto-*.html`, 13 `/c/<slug>.html`, `sitemap.xml`, and the category list in the footer of `index.html` (between the `<!-- tm:cats-inicio -->` / `<!-- tm:cats-fin -->` markers — that list used to be hand-written and drifted to 8 of 13 categories, leaving five with a page nobody linked to). The category pages already contain product cards in plain HTML, which is why **a static-site generator like 11ty would not add what it looks like it would add** — that content is already server-rendered. Product pages carry breadcrumbs, `BreadcrumbList` JSON-LD and related products so the catalogue is a navigable mesh rather than 118 dead ends.

`scripts/build_og_images.py` renders one 1200×630 Open Graph card per product into `og/`, with a manifest so unchanged products aren't re-rendered. It exists because the `/p/` pages declared `og:image:width 1200`/`height 630` while the real photos are 480×480 or 700×700 — WhatsApp and Facebook lay out the preview using the *declared* size, so every product's preview was cropped or letterboxed. Bump `version` inside `huella()` when the card design changes, or already-generated cards keep the old look forever (their product data didn't change).

`scripts/send_notifications.py` decides what changed by diffing `productos.json` against a snapshot it keeps in RTDB (`/notificaciones_estado`), **not** against git. It used to compare HEAD with the previous commit that touched `productos.json` and the workflow checked out with `fetch-depth: 20` — but dozens of automated commits land between two catalogue edits (`sync_resenas.py` alone commits several times an hour), so `productos.json` appeared only once in the fetched history and the comparison silently returned `None`: no new products, no price drops, no restocks detected, and not one error in the log. Because the snapshot makes detection idempotent, it now runs on **every** invocation (the flush cron included, which is why `SOLO_FLUSH` is gone), so a change missed by the push-triggered run gets picked up by the next cron instead of never. Two other things there are load-bearing: `_fusionar_cola` needs the `consumidos` set or it re-adds from the node exactly what the run just sent (that is what made "🏷️ N productos rebajados" fire on every single pass), and `/seguimientos` — the post-sale follow-up reminder the cron pushes to the owner's phone — holds **only** `ts` and `hecho`; its rule has `"$otro": {".validate": false}` precisely so a customer's name or phone can never land there.

Every other script in `scripts/` is triggered by a cron or `workflow_dispatch` in `.github/workflows/`, not run interactively. Check `.github/workflows/*.yml` for the actual schedule/trigger and `concurrency.group` before assuming two scripts can't interfere with each other. Notable ones: `revertir_ofertas.py` (auto-expires timed discounts), `precio_radar.py` (scrapes Revolico/Porlalivre/lelespc to compare prices), `send_notifications.py` (push queue, Firebase-backed to avoid git conflicts), `update_rate_from_eltoque.py` (USD→CUP exchange rate), `nightly_agent.py`/`admin_alerts.py`/`web_health_agent.py` (health/alerting, report to Telegram and to the admin Copilot panel).

### Other services (not part of the static site's own deploy)

- `bot/` — a separate Telegram bot (python-telegram-bot), its own `requirements.txt` and `Procfile`, deployed independently.
- `mini-services/chat-bot/` — a Cloudflare Worker (TypeScript, own `wrangler.toml`/`package.json`) backing the on-site AI chat widget (`js/tm-bot.js` calls out to it).
- `bot/cloudflare_worker.js` is a *different* Worker, deployed via the root `wrangler.toml` (`name = "tiendamax"`, weekly cron) — don't confuse it with `mini-services/chat-bot`.

### Deploy

Pushing to `main` triggers `build-css.yml` and `minify-js.yml` (both in a shared `repo-autobuild` concurrency group so they never race each other committing bundle files), which rebuild the bundles, bump cache-busting hashes, commit as `github-actions[bot]`, then trigger `pages.yml` to actually publish to GitHub Pages. `pages.yml` excludes `scripts/`, `mini-services/`, and the Firebase config files from what gets deployed. In other words: **you don't need to manually rebuild bundles before pushing** for them to end up correct on the live site — but you do need `scripts/deploy.sh` (or the individual build scripts) if you want to verify/test the built output locally before pushing, or if CI's auto-commit-back loop isn't the flow you want.
