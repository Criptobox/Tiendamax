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

`tests/` holds ~600 unit tests. `test_build_completeness.py` asserts every `css/*.css`/`js/src/*.src.js` file is actually listed in `build_css.py`'s `ORDEN` / `build_js_bundle.py`'s `ORDEN` — add new source files there or they'll silently never ship. There is still no coverage for `admin.html`'s inline `<script>` logic beyond the smoke test.

Several tests exist because the failure they catch is **silent** — nothing errors, the page renders, and the damage only shows up in the live site or in Google. Read these before "simplifying" them away:

- `test_imagen_en_uso.py` (+ `imagen_en_uso_check.mjs`) — guards the check that decides whether a photo can be deleted from the repo. It got this wrong once and deleted a product's only photo.
- `test_enlazado_interno.py` — asserts no `/c/` or `/p/` page is left without incoming links and no product page is a dead end. Orphan pages serve fine and break nothing; they just rank badly.
- `test_contraste.py` — WCAG ratios for the generated pages, plus a check that the colours it validates are still the ones the generator writes.
- `tests/anuncio_check.mjs` (+ `test_anuncio.py`) — the ad image: see "The ad image" below. It needs a real browser because everything it checks depends on `measureText()`.
- `tests/inicio_check.mjs` and `tests/agenda_check.mjs` (+ `test_agenda_inicio.py`) — the Inicio screen, its agenda and the AI path: see "Who uses the panel" and "The Copiloto" below. Its point is a lie, not an exception — a screen that says nothing is urgent because the engine hasn't answered yet.
- `test_alcance.py` — walks from the roots (HTML `onclick`/`data-action`, plus each file's top-level code) and follows the calls. `test_codigo_muerto.py` only counts *references*, which cannot see a clique: 23 functions in `revolico_integration.js` kept each other "referenced" while the only door into the group rendered into a container that does not exist. Nothing errored; the bundle just shipped them to every phone.
- `test_ids_fantasma.py` — `getElementById('x').algo` where no HTML creates `#x`. A null that gets checked is fine and common on purpose (one bundle serves index/admin/product pages); a null dereferenced immediately throws and silently truncates the rest of the function. That is how `cargarConfiguracionGitHub` filled three fields and then died, invisibly, on every ⚙️ Configuración.
- `test_cola_vigente.py` + `notificaciones_check.mjs` — a push sits in the customer's tray with frozen text until they swipe it away, so "🏷️ 4 productos rebajados" has to be true *at send time* and cannot be corrected afterwards. The queue fills every cron run but only drains in daylight hours, and in between products sell out, discounts get reverted by `revertir_ofertas.py`, and the same product gets `extend`ed in twice.
- `tests/medir_check.mjs` (+ `test_ficha_venta.py`) — the counter on the `/p/` pages. Needs a real browser for the reason given under "Python automation" below: the allowlist, the owner exclusion and the reload window are all things a static read of the file cannot tell apart from decoration.
- `tests/comparar_check.mjs` (+ `test_comparar_principal.py`) — the 🔀 Comparar screen. See "Comparing against the main store" below: the commission-currency rule turns 7 differences into 1, and getting it wrong hands the gestor a button that breaks a correct commission.
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

Two more modules live in `js/src/` but are deliberately **out** of the bundle (`STANDALONE` in `build_js_bundle.py`): `tm-bot.src.js` (the chat bubble/panel) and `tm-bot-cerebro.src.js` (the assistant's whole brain, ~130 KB minified). The shell injects the brain only when a customer actually opens the chat, via the URL in `<meta name="tm-bot-cerebro">` — which lives in the HTML so `bump_versions.py` keeps its cache-busting hash in sync. The bot answers entirely in the browser: there is no chat backend, and **no LLM on the storefront** — every answer is deterministic JS matched against the live catalog. (The *admin panel* is the exception and a different situation: one user, their own API key — see "The Copiloto" below.) `mini-services/chat-bot/` is the retired Cloudflare Worker it used to call (TypeScript, not Python), kept only for reference; its README explains why it was dropped. Anything proposing LangChain / a vector DB / RAG / function calling for this bot is proposing to rebuild that backend, with the per-message cost, the API key and the outage surface that removing it avoided.

When the bot "arma un sistema" (`R.sistemaSolar`/`sistemaSeguridad`/`sistemaInternet`), `_armarSistema()` walks the catalog **once** and returns the role→products structure; the three builders only render it. That structure is what feeds `cotizacionHTML()`, the printable technical proposal behind the "📄 Descargar cotización" button — a standalone HTML document opened in a new tab and printed with the browser's own "Save as PDF". Deliberately **no jsPDF/html2canvas**: the brain is downloaded whole the first time anyone opens the chat, on 3G. Note `_capacidadBateria()` returns `null` when a battery doesn't declare Ah *and* V, unlike `R.autonomia` which assumes 100Ah×12V so the chat can still answer — the quote is a paper the customer shows an installer, where a supposed number reads as a measured one. `tests/cotizacion_check.mjs` guards exactly that.

`R.diagnostico` (fault triage) follows the same rule and it is the whole point of the module: the `DIAGNOSTICO` table holds only **symptom** patterns that hold for a whole device family, while manufacturer-specific numeric codes live in `codigos-error.json` (ships with `marcas: {}` — it gets filled by copying manuals). When a code isn't there, Max says so and asks for make and model instead of translating it; when it can still infer from symptoms, the "I don't have this code" notice is printed **before** the inference and the inference is labelled as one. Don't "improve" that into a confident answer. `tests/test_diagnostico.py` also validates the shape of any code the admin adds — a malformed entry fails no differently from a missing one at runtime.

`js/*.js` at the repo root (`combos.js`, `cart-share.js`, `event-delegation.js`, `tienda-plus.js`, `revolico_integration.js`, `admin-copilot.js`, `analytics.js`, `banners.js`, `biometric-auth.js`, `error-report.js`, `hero-efectos.js`, `push-fix.js`, `seo-dynamico.js`, `share-patch.js`, `subcategorias.js`, `urgencia-ventas.js`, `web-vitals-snippet.js`) are standalone — **not** part of the `js/src` bundle pipeline. They're loaded as individual `<script>` tags in `index.html`/`admin.html`, always *after* `tm-bundle.js`, so it's normal (not a bug) for them to call bundle globals they don't define themselves. Some of these deliberately override bundle functions post-load (`push-fix.js` replaces the bundle's FCM registration logic entirely — this is intentional, not dead code, even though it leaves the bundle's version unreachable). `tienda-plus.js` also post-processes whatever the bundle rendered: it walks `.producto-card`/`.rel-card` and makes them keyboard-operable, so a change to how cards are built in `tm-ui.src.js` can be silently undone there.

### The ad image (`js/revolico_integration.js`)

**One canvas draws every image the shop publishes.** `window.tmAnuncioImagen(canvas, producto, {formato, texto})` — `formato` is `'cuadrado'` (1080×1080) or `'vertical'` (1080×1920), `texto` decides whether the product's name and price are drawn on it. Three callers:

- Revólico preview (`previsualizarRevolico`) — `cuadrado`, **no** text. Revólico asks for title, price and description in its own form fields, so repeating them inside the image is noise. This is the variant whose look everything else copies: dark gradient in the category's tone, gold border, big photo, `TiendaMax` / `tiendamax.org` strip at the bottom.
- Facebook preview (`previsualizarFacebook`) and the per-category batch (`pubCatCartelesLote` in `admin.html`) — `cuadrado`, with text.
- WhatsApp Status (`pubShareStory` in `admin.html`) — `vertical`, with text. 9:16 because Status fills the phone screen and crops anything else.

This replaced a generator of four HTML poster templates (`clasico`/`pro2`/`horizontal`/`tecno`) captured with html2canvas, plus its template picker and manual brand-colour palette in the Publicar tab. That whole path depended on injected CSS, an off-screen node and CORS-clean photos, and each of the three failed silently into a blank PNG. Don't reintroduce an HTML-then-screenshot poster: everything the templates did, the canvas does directly.

Three things there are load-bearing:

- **The text block's height is measured before the photo gets its own.** They are two separate calculations and when they drifted apart the price got painted on top of the `TiendaMax` strip — canvas draws wherever you tell it and reports nothing. The draw records where the text actually ended in `canvas.dataset.tmAnuncio`, and `tests/anuncio_check.mjs` crosses that against the strip for all 132 products in both formats.
- **The title font shrinks (62/54 → 34) until the whole name fits**, rather than clipping the tail. Clipping is how `Protector … TOMZN TOVPD1-60` lost its `60` and a protein lost its `962g` — the very thing that tells a product from its sibling. The same test asserts no number survives only in the original.
- **A photo that would lose more than 22% to a cover-crop is drawn contained, over a blurred copy of itself.** Landscape photos in the 9:16 format were being cut in half. Revólico's `cuadrado` without text keeps the plain cover crop, byte-identical to what it always produced.

The background tone comes from `tmColorCategoria()` (`TM_CAT_COLORES` in `js/admin-copilot.js`) normalised through `_revOscurecer()` to the luminance of the original burnt orange — some category colours are near-white (Energía is yellow) and would swallow the photo and the strip. That table is the only thing left of the poster generator in `admin-copilot.js`.

### The CSS cascade (css/)

Similarly, `css/*.css` source files get concatenated (not merged/deduped) into `css/bundle.css`. **Load order is the primary way conflicting rules get resolved** — later files win ties in specificity, and several files exist specifically to override earlier ones (see the comments in `build_css.py`'s `ORDEN`). `modal-v4.css` loads last and is treated as "wins everything" by convention. `styles.css` and `premium-theme.css` are historically pre-minified (single-line) with no separate readable source — that's expected, not a build artifact gone wrong.

### Who uses the panel: a *gestor*, not the owner

**The person running `admin.html` sells products that are not theirs.** They earn a per-product **commission** (`comision` + `comisionMoneda` on each product, copied onto each sale line), not the sale price. This is the single most load-bearing fact about the Inicio screen, and getting it wrong is what made the old one useless:

- Inicio's big card used to show **valor de inventario**. That is the owner's money and it does not move day to day — the largest type on the screen was the number the user could do least about. It now shows **their commission**: total, with the month underneath.
- **Restocking is not theirs to do.** "59 agotados" and "23 con stock bajo" are true, but as *tasks with a button* they only take the place of something actionable. Inicio's agenda filters them out via `AGENDA_NO_MIAS` in `admin.html` (`stockout`, `lowstock`); the full list stays one tap away in the Copiloto bubble, and the number stays visible as the "A la venta" tile (73 of 132 — what they *can* sell). If the products ever become theirs, empty that Set.
- Customers waiting on `/avisos_stock` are **not** a stock chore — they are people who want to buy. That task used to say "Reponer" and open Productos; it now says "Ver quiénes son" and opens Clientes → Avisos, where a gestor can actually write to them.

**`gananciasDe(ventas)` is the one place commission is counted** (`{usd, mn, porProducto, unidades}`), used by both `renderInicio` and `renderVentas`. It lived inline inside `renderVentas`; Inicio needed the same figure and a second copy would have drifted — the one that went wrong would have been Inicio's, the screen that gets looked at. `ventasDelMes(ventas, año, mes)` sits next to it.

**USD and MN are never added together, anywhere.** They are different currencies and the rate moves weekly, so a merged total is a number that does not exist. The hero puts them in two columns with a divider and an explicit `USD` / `MN` label under each; the by-month chart draws **two** charts with independent scales rather than one; `dosMonedas()` renders "$X + $Y MN" and never sums. Gold means MN throughout the panel. This already went wrong once in the per-product commission list, where 300 MN sorted and read as $300.

**Blocks with nothing to show collapse to one line.** The old "Ventas — últimos 7 días" chart was flat zero almost always (16 sales spread over months) and spent 160px saying nothing; it is now "Mi ganancia por mes" over six months, which has shape. When there is no commission at all it becomes a single line saying so, and `tests/inicio_check.mjs` asserts that collapsed block stays under 90px.

### The Copiloto: one task engine, and the AI path

**`buildTasks()` in `js/admin-copilot.js` is the only thing that analyses the shop.** It reads the catalog plus `/interesados`, `/avisos_stock`, `/analytics/vistas`, `/analytics/whatsapp`, `/ventas` and `/tokens`, and produces a ranked task list: products out of stock, customers waiting for a restock, the product with many views and no WhatsApp clicks, what hasn't been published in days. Inicio's agenda (`renderAgendaInicio` in `admin.html`) **reads** that list through `window.tmCopilotoTareas()` and runs its buttons through `window.tmCopilotoAbrirTarea` — the same path as the buttons inside the bubble. Do not add a second analysis in `admin.html`: two engines over the same catalog drift, and the one that goes wrong is the one nobody is looking at (this already happened with the acronym tables in `nightly_agent.py` and `admin-copilot.js`).

The agenda has **three** states, not two, and the distinction is the whole point: no engine loaded, engine hasn't finished a pass yet, and finished-with-nothing-to-do. Collapsing the last two makes the screen say "✅ Nada urgente" while 59 products are out of stock — nothing errors and nothing looks wrong. `window.tmCopilotoListo()` reports whether a pass has *completed*, which is not the same as "not currently loading" (between passes, `state.loading` is false and the tasks are still good).

**The AI path is `iaLlamarModelo(prompt, imagen)`, and it picks the provider from the key's prefix:**

| Prefix | Goes to | Model |
|---|---|---|
| `sk-ant-` | `api.anthropic.com` | `claude-opus-5` |
| `AIza` | Gemini | `gemini-2.0-flash` |
| `sk-or` | OpenRouter | `openrouter/auto` |
| `gsk_` | Groq | `llama-3.3-70b-versatile` |
| anything else | DeepSeek | `deepseek-chat` |

The localStorage key is called `anthropicApiKey` for historical reasons but holds **any** provider's key — and until recently there was no `sk-ant-` branch, so a real Claude key fell through to DeepSeek's endpoint and returned 401 that read as "bad key". The Anthropic call needs the `anthropic-dangerous-direct-browser-access: true` header: the panel calls the API from the owner's phone, not a server, and without it CORS blocks the request and it again looks like a bad key. `window.tmAIChat` is the alias `js/revolico_integration.js` calls for its "✨ Mejorar con IA" buttons — it lives in `admin-copilot.js` because that is the file that knows how to talk to a model, and it *throws* rather than returning null so the caller can show why it failed.

**Numbers are computed by the panel; only prose comes from the model.** A figure invented in the Inicio agenda is undetectable — same rule that keeps Max's printable quote from estimating autonomies.

One trap worth remembering: `_firma()` awaits `TMAuth.token()`, which awaits `init()`, which downloads the Firebase SDK from gstatic. That await sits **outside** `getJson`'s `AbortController`, so its 6-second timeout does not cover it. Without a cap of its own, a slow or blocked gstatic leaves `buildTasks` unfinished, `state.loading` stuck at `true`, and its own first-line guard then rejects every later refresh — the Copiloto stops producing tasks permanently, in silence. It now races a 4-second timeout. `tests/agenda_check.mjs` and `test_agenda_inicio.py` pin all of the above.

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

### Where a sale came from

`VENTA_ORIGENES` (`js/src/tm-ui.src.js`) is the list of channels a sale can carry; `VENTA_ORIGEN_CHIPS` in `admin.html` renders it as a one-tap, optional row in the sale form. The five online ones are the same keys `/analytics/fuentes` counts, which is the whole point: `cargarFuentes()` puts a channel's visits next to its sales, and a channel with 200 visits and no sales looks identical to one with 20 and three until you have both halves. `conocido` is the sale that came from no published link.

Two rules. **Nothing is preselected and nothing is required** — a default channel stays put on the sales entered in a hurry and attributes sales that aren't its own, which is a false number and worse than the blank. And **the channel never goes into the Firebase order**: `/pedidos/$id` is `".read": true`, that payload is built field-by-field (see the CRM section above), and where the shop sells from is its own business.

### Comparing against the main store (AXONTECH)

The products aren't the gestor's, and they aren't TiendaMax's either: they come from another shop, **axontech92.github.io/AXONTECH**, which changes prices, restocks and adds products without telling anyone. Before the 🔀 Comparar screen the only way to find out was to open both sites and read 132 listings, so nobody did: 31 sellable products were never uploaded and prices went stale.

**`scripts/comparar_principal.py` (cron, every 3h) fetches; the panel compares.** The script downloads the main store's `data.json` from `raw.githubusercontent.com` and writes two files; the browser does the actual cross-referencing against `PRODUCTOS`, which it already has in memory. That split is the point: the download is 1 MB and the person opening the screen is in Cuba on mobile data, so the expensive half runs on GitHub Actions for free — and because the comparison itself is live, a row disappears the moment the gestor fixes it instead of waiting for the next cron run.

- **Only `productos` and `categorias` come out of that download.** The same `data.json` also carries `gestores` (with a `password` field) and 427 `vales` (with `cliente`, `telefono`, `carnet`, `direccion`). None of that has any business passing through this repo, which is public. `descargar()` never reads those keys and `test_comparar_principal.py` greps the script to keep it that way.
- Two output files. `principal-catalogo.json` is the comparison fields (28 KB, 4 KB gzipped) and loads every time the screen opens; `principal-fichas.json` is the descriptions, needed only to fill the form for one missing product, and only downloads if that button is used. Together they'd be 26 KB gzipped per open to show text that is read once per product.
- The main store stores no `categoria` on a product, only a `catId` into its own list. Untranslated, the category arrives empty on all 108 and the "Rellenar" button leaves a required field blank.
- A failed download or an empty result **must not overwrite the file**. A blank catalog makes the screen say "nothing missing", which is the opposite of the truth and indistinguishable from being up to date.

**Names cannot be matched automatically, and the numbers say so.** The main store writes `mikrotik sxt sq 5ax` where this catalog has `MikroTik SXTsq 5 AX` (same device, one space) and `Nanostation loco m5` where this has `NanoStation M5 Loco` (same device, words reversed) — but in that same range `hAP ac3` and `hap ax3` are two different routers, and m2 is not m5. Scored by token+trigram overlap on the real catalogs, **the highest-scoring pair of all (0.89) is a wrong one** (`Nanostation loco m5` vs `NanoStation Loco M2`) while a correct pair scores 0.41 (`Router ASUS AX1800` / `Asus RT-AX1800S`). There is no threshold. Auto-matching would hide genuinely missing products with no way to notice, so:

- The screen **proposes and the person decides**. `cmpAbrirPicker` ranks candidates only so you don't have to scroll; the picker carries an explicit "m2 no es m5, ac3 no es ax3" line, which is its only defence against a fast tap on a plausible wrong row. Never turn that ranking into a one-tap suggested link.
- Linking is not just hiding: `CMP_ENLACES` (`tm_cmp_enlaces` in localStorage) is checked **first** in `cmpEmparejar`, so a linked product moves out of "Te faltan" and into the price/stock/commission comparisons. On the real catalog, linking four products dropped Faltan 31 → 27 *and* raised Repuestos 5 → 6: a sale that had been hiding as a false "missing product".
- **The main store re-enters the same product**, so two of its rows can legitimately point at one product here. `Sistema de Alarma` exists twice (two ids, $170/0u and $180/2u) and the same welder is listed as both `Maquina de soldar YESWELDER FLUX-140 FLEX` and `Planta de soldar Bielmeier FLUXMAX 140`. The picker used to hide a product already linked to another row, which left rows that could **never** be cleared — the gestor sees "no lo tengo" forever and is right to say otherwise. Many-to-one is allowed; the option just says "ya emparejado con «X»" so it is an informed tap and not an accident.
- `cmpGemelaYaMia()` catches the case where the main store's *other* copy already matches a product here, and the row says so with a one-tap "es el mismo". This is **not** the fuzzy matching ruled out above: it compares two rows of the *same* shop whose normalized names are identical — their own duplicate, not a guess. The check must stay an exact normalized-name match; `tests/comparar_check.mjs` includes an `Alarma Pro` that scores highly against `Alarma` and must **not** be flagged.
- `CMP_OCULTOS` is the plain dismissal. Both are listed and undoable in the block's footer, which sits **outside** the fold — a list that hides things without saying how many or which is a list nobody trusts twice, and the answer to "did it save?" cannot be behind a collapsed section.
- **The marks live in the repo** (`comparar-marcas.json`, published with `subirArchivoAGitHub` — the same retrying writer as `productos.json`), because marking is real work and losing it on a new phone would be losing the work. `CMP_MARCAS` is the source of truth (`{priId: {mio|oculto|borrado, ts}}`) and `CMP_ENLACES`/`CMP_OCULTOS` are derived from it. Three things there are load-bearing:
  - **It merges per mark, never file-for-file.** With two devices, publishing the whole file means whoever saves last wipes the other's marks — nothing errors, the work is just gone. `cmpFusionar` keeps the newest `ts` for each product, and `cmpPublicar` re-reads the file immediately before writing, so a mark made on the other device between page load and save survives.
  - **Undo writes a tombstone, not a delete.** A mark that simply vanishes is a mark the other device still has and will re-publish, so the undo bounces back. Tombstones older than `CMP_LAPIDA_DIAS` are pruned on write.
  - **localStorage is written on the tap; the repo write waits 4s.** Marking ten products is ten taps in a few seconds, and that would be ten commits and ten round trips from a Cuban phone. The local write means the delay risks nothing. On load, anything local the repo doesn't have is published — so a save that failed, or marks made offline, heal themselves instead of sitting there silently.
- Rows with a match show **the gestor's own product name** (that is what the button changes and what they must recognise in their catalog), with the main store's name underneath when the two differ — the only way to check a link is right.

**The price is stored twice and the two disagree on 12 of the 108 products.** `precio` is a formatted string (`"$115"`, `"280 cup"`) and `precioActual` a number; the main store's own catalog renders **`precio`** (its `buildCatalogHTML`), so that is the figure the gestor sees when they open the page to check. Reading `precioActual` had the screen claiming a VEVOR charger cost $145 while the main store's page, open alongside, said $125 — the user caught it. `precio_de()` therefore reads the string first and keeps the disagreeing number as `precioOtro`, which the row prints as "(su ficha interna dice $130)": using one figure while hiding the other is how a wrong price gets applied with a confident tap.

And that string carries a currency: **`"280 cup"` is not $280.** One product is priced in CUP and it was being shown as `$280`, at the top of "Te faltan" — the Linterna mistake again, in the price this time. Prices now travel with `precioMoneda`, only same-currency prices are compared (the rest go to the no-button list, alongside the commission conflicts, and the block is titled "Lo que no puedo comparar" for that reason), and every row that prints a main-store price passes its currency. `cmpTasaMN()` exists **only** to sort a list that mixes currencies — otherwise 280 CUP outranks a $250 router — and never to convert anything shown or compared.

**The commission currency is the load-bearing rule of the whole feature.** 1500 MN and $1.80 are nearly the same money (1500 ÷ 687 ≈ $2.18). Compared as bare numbers they produce **7 differences where there is 1**, and each carries a button that would change a correct commission into a wrong one — this already went wrong once, reading the Linterna's commission as $1500 instead of 1500 MN. So:

- The main store writes the commission as a formatted string (`"$10 USD"`, `"1500 MN"`) *and* in a separate `comisionMoneda` field, and **the two contradict each other on 5 products** (`"$3 USD"` with `comisionMoneda: "MN"`; `"$1000 USD"` on a $20 product). When they disagree, or the number can't be true for that price, the script marks the row `comisionDudosa` and the panel shows it under "Comisiones que no puedo comparar" — **with no button**, because there is no figure to trust. A false difference here is worse than none.
- The panel only compares commissions **of the same currency**; different currencies go to the same no-button list. 14 of the gestor's own products declare no `comisionMoneda`, so `cmpMonedaMia()` infers it by magnitude (the two catalogs separate cleanly: USD ≤ 35, MN ≥ 1000) — and applying a commission **writes the currency alongside the number**, turning that inference into a declared fact. Leaving a bare `1000` behind means the next reader infers USD.

**A difference on something that is out of stock is true but is not today's work.** With the real catalogs, 5 of the 6 rows in "Precio distinto" + "Lo que no puedo comparar" were products sitting at zero on both sides — the noise buried the one row that could still turn into a sale. Rows where either side is at zero are marked `dormido` in `cmpAnalizar` and moved behind a one-line "N agotados ahora mismo" inside their block; the block's badge counts only what is actionable today (muted when that is zero). They are **apartadas, not borradas**: when the stock comes back the price has to already be right, so the rows stay openable, keep their button, and carry an `agotado` tag so opening them doesn't re-create the confusion. `cmpPartir` renders both halves with the *same* painter — two painters would drift, and the half that goes wrong is the hidden one.

Restocks are detected by diffing against the previous run's file, and a product appearing for the first time is **not** a restock — otherwise the first run pushes "108 restocked". The push (through `enviar_push_admin`) only counts restocks the gestor currently has at zero: that the main store restocked something already on sale is not news. `tests/comparar_check.mjs` runs the screen in a real browser, because whether a row appears, with which button and which number, is decided there and a static read of `admin.html` cannot tell a working currency rule from a broken one.

### Data files and the "lite" catalog

`productos.json` is the full catalog (admin reads/writes this). `productos-lite.json` is the same data with `descripcion` stripped, generated by `scripts/build-productos-lite.py`, served to the public site to save payload on slow connections — several other scripts (`fill_specs.py`, etc.) also touch `productos-lite.json` directly and must preserve that "lite = no descripcion" contract rather than regenerating it from scratch.

### Python automation (scripts/) and GitHub Actions

`scripts/regenerate_artifacts.py` (697+ lines, run by `regenerate-artifacts.yml`) is the one that generates the **static, indexable** part of the site: 118 `/p/producto-*.html`, 13 `/c/<slug>.html`, `sitemap.xml`, and the category list in the footer of `index.html` (between the `<!-- tm:cats-inicio -->` / `<!-- tm:cats-fin -->` markers — that list used to be hand-written and drifted to 8 of 13 categories, leaving five with a page nobody linked to). The category pages already contain product cards in plain HTML, which is why **a static-site generator like 11ty would not add what it looks like it would add** — that content is already server-rendered. Product pages carry breadcrumbs, `BreadcrumbList` JSON-LD and related products so the catalogue is a navigable mesh rather than 118 dead ends.

**The `/p/` pages are the destination of everything the shop publishes, and everything on them is copied 132 times and downloaded over 3G.** That is the constraint behind three decisions there:

- **They count their own traffic, inline** (`MEDIR_JS`, ~1.5 KB). `js/analytics.js` is 20 KB *and* fetches `config.json`, so it never went on these pages — which meant views per product, WhatsApp clicks and the referring channel shown in the panel came only from people browsing tiendamax.org on their own. The traffic that publishing generates was invisible in exactly the panel where you decide what to publish. Three things there are load-bearing: it writes to the **same paths in the same shape** (integer at `.../count`, server increment with a read-modify-write fallback) so the two sources add up instead of counting separately; it reuses **the site's own session keys** (`tm_an_vistas_<id>` with analytics.js's 30-minute window, `tm_visita_contada` from `tm-patches.src.js`) because with keys of its own, someone arriving through a published link and then continuing to tiendamax.org counts two visits — and the duplicate is the one for the channel you were trying to measure; and the channel goes through the `_TM_FUENTES` allowlist, copied, because the key becomes a Firebase path and an invented `utm_source` would create nodes in the database. The explanatory comments live in the Python source, not in the string — they would ship 132 times. `tests/medir_check.mjs` runs it in a real browser: the allowlist being *written* in the file does not prove it is *used* (a `var c=q` leaves it there, intact and decorative), and the same goes for excluding the owner and for not recounting on reload.
- **`{css_extra}`**: the stylesheet is inline in every page, so rules for a block that page doesn't have are pure weight. Warranty (8 products) and reviews (whichever have them) carry their CSS only where the block exists.
- **Warranty and reviews are printed at build time from real data, or not at all.** `garantia` is typed by hand by the gestor; `_garantia_html` prints it only when it exists — a default here is a promise the customer comes back to collect. Reviews come from `resenas-cache.json`, and `_resenas_jsonld` emits `aggregateRating` only with real reviews behind it, which is both what Google penalises and, here, a lie.

With stock, **WhatsApp is the primary button and comes first**: there is no cart and no payment, the order *is* the message. "Ver más en TiendaMax" used to be the orange primary and sent someone already looking at the product they wanted back to the whole catalogue.

`scripts/build_og_images.py` renders one 1200×630 Open Graph card per product into `og/`, with a manifest so unchanged products aren't re-rendered. It exists because the `/p/` pages declared `og:image:width 1200`/`height 630` while the real photos are 480×480 or 700×700 — WhatsApp and Facebook lay out the preview using the *declared* size, so every product's preview was cropped or letterboxed. Bump `version` inside `huella()` when the card design changes, or already-generated cards keep the old look forever (their product data didn't change).

`scripts/send_notifications.py` decides what changed by diffing `productos.json` against a snapshot it keeps in RTDB (`/notificaciones_estado`), **not** against git. It used to compare HEAD with the previous commit that touched `productos.json` and the workflow checked out with `fetch-depth: 20` — but dozens of automated commits land between two catalogue edits (`sync_resenas.py` alone commits several times an hour), so `productos.json` appeared only once in the fetched history and the comparison silently returned `None`: no new products, no price drops, no restocks detected, and not one error in the log. Because the snapshot makes detection idempotent, it now runs on **every** invocation (the flush cron included, which is why `SOLO_FLUSH` is gone), so a change missed by the push-triggered run gets picked up by the next cron instead of never. Two other things there are load-bearing: `_fusionar_cola` needs the `consumidos` set or it re-adds from the node exactly what the run just sent (that is what made "🏷️ N productos rebajados" fire on every single pass), and `/seguimientos` — the post-sale follow-up reminder the cron pushes to the owner's phone — holds **only** `ts` and `hecho`; its rule has `"$otro": {".validate": false}` precisely so a customer's name or phone can never land there.

Every other script in `scripts/` is triggered by a cron or `workflow_dispatch` in `.github/workflows/`, not run interactively. Check `.github/workflows/*.yml` for the actual schedule/trigger and `concurrency.group` before assuming two scripts can't interfere with each other. Notable ones: `revertir_ofertas.py` (auto-expires timed discounts), `precio_radar.py` (scrapes Revolico/Porlalivre/lelespc to compare prices), `send_notifications.py` (push queue, Firebase-backed to avoid git conflicts), `update_rate_from_eltoque.py` (USD→CUP exchange rate), `nightly_agent.py`/`admin_alerts.py`/`web_health_agent.py` (health/alerting, report to Telegram and to the admin Copilot panel).

### Other services (not part of the static site's own deploy)

- `bot/` — a separate Telegram bot (python-telegram-bot), its own `requirements.txt` and `Procfile`, deployed independently.
- `mini-services/chat-bot/` — a Cloudflare Worker (TypeScript, own `wrangler.toml`/`package.json`) backing the on-site AI chat widget (`js/tm-bot.js` calls out to it).
- `bot/cloudflare_worker.js` is a *different* Worker, deployed via the root `wrangler.toml` (`name = "tiendamax"`, weekly cron) — don't confuse it with `mini-services/chat-bot`.

### Deploy

Pushing to `main` triggers `build-css.yml` and `minify-js.yml` (both in a shared `repo-autobuild` concurrency group so they never race each other committing bundle files), which rebuild the bundles, bump cache-busting hashes, commit as `github-actions[bot]`, then trigger `pages.yml` to actually publish to GitHub Pages. `pages.yml` excludes `scripts/`, `mini-services/`, and the Firebase config files from what gets deployed. In other words: **you don't need to manually rebuild bundles before pushing** for them to end up correct on the live site — but you do need `scripts/deploy.sh` (or the individual build scripts) if you want to verify/test the built output locally before pushing, or if CI's auto-commit-back loop isn't the flow you want.
