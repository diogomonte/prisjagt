# Design

## Context

See `proposal.md` - Why. Constraints that shape everything below:

- The app is a static site: `index.html` + `app.js` + vendored Leaflet. No build step, no npm,
  no modules, no backend. `app.js` is a single IIFE in ES5-compatible style.
- All API calls go through one existing helper, `sgFetch(path, overrideToken)` (`app.js:38`),
  which injects `Authorization: Bearer <token>` and throws an `Error` carrying `statusCode` plus
  the API's own `error` string. `describe(err)` (`app.js:55`) maps those to Danish user text.
- The bearer token is the user's own, held in `localStorage`. Verified: `GET /v2/products/{ean}`
  returns `access-control-allow-origin: *`, so it is callable directly from the browser with the
  same token — no proxy.
- Verified against the live API: `/v2/products/{ean}` **requires a `storeId` query parameter**
  (without it: `400 "Missing storeId"`), and prices are genuinely per-store — a Netto item
  returns `404 "No such Product"` at a føtex and at a Salling store. A lookup is only meaningful
  against one specific store.
- Error bodies from this API carry `errorMessage`, not the `error` field the gateway uses, so the
  shared `sgFetch` helper has to read both.
- Scope grants are per-API, so the token may be valid for food-waste and stores while refused
  (403) for products. That is a normal state, not an error state.

## Goals / Non-Goals

**Goals:**
- One code path for resolving a barcode to a price, used by both the standalone lookup UI and the
  per-row compare control.
- Zero new dependencies, including for barcode scanning.
- Price lookup is strictly additive: if it is unavailable for any reason, the existing map and
  clearance panels behave exactly as they do today.

**Non-Goals:**
- Continuous/streaming scanning (scan → first hit → stop).
- Any product search, browse, or catalogue listing — `/v2/products/{ean}` is lookup-by-key only.
- Price history or trend tracking; nothing is persisted beyond a short-lived cache.
- Comparing one barcode across several stores at once. A lookup targets exactly one store; the
  user switches stores on the map to ask again. Fanning a single barcode out across ~90 stores
  would be one request per store and is the fastest way to exhaust the quota.
- Webshop prices. The response carries a `webshop` side alongside `instore`; this app is about
  physical stores and reads `instore` only.

## Decisions

### Barcode scanning via native `BarcodeDetector`, never a library

`BarcodeDetector` is a platform API in Chrome/Edge/Android WebView. Where present, scanning costs
~30 lines: `getUserMedia({video:{facingMode:'environment'}})` into a `<video>`, then poll
`detector.detect(video)` on `requestAnimationFrame` until a result arrives, then stop every track.

*Alternatives considered:* ZXing-wasm or QuaggaJS would give scanning on Safari and Firefox too,
but each is 200KB-1MB of vendored third-party code, and the project's defining constraint is
"HTML/JS, nothing else". Manual barcode entry is a complete fallback — the number is printed on
the package. Rejected.

Consequence, accepted: on iOS Safari there is no scan button, only typing. Feature-detect with
`'BarcodeDetector' in window` and hide the control rather than showing a broken one.

### Lookup UI lives in the existing right-hand panel, not a new route

The panel (`#panel`) is already the detail surface and is already swapped wholesale by
`panelMessage()`. A barcode field goes in the header (always visible), and its result renders into
the panel through the same mechanism, replacing whatever store was shown. No router, no modal,
no new layout region. Selecting a store pin replaces it back.

### `lookupEan(ean, storeId)` returns a promise and owns the cache

A single function: validate → cache hit? → `sgFetch('/v2/products/' + ean + '?storeId=' + storeId)`
→ normalize → cache → resolve. Both callers (lookup form, row compare) await the same promise, so
the row-compare path inherits caching and error handling for free. An in-flight `Map` keyed by
`storeId + ':' + ean` dedupes concurrent requests.

`storeId` is mandatory, not optional with a default. A default store would silently show the
wrong shop's price, which is worse than refusing the lookup.

Normalization reads the documented shape: the price lives under `instore`, where `description` is
the brand and `name` the product (so the display label joins both). `instore` may be `null`,
which means "not carried in physical stores" and is a distinct displayable outcome. "No numeric
price" is likewise explicit rather than coerced to `0`. There is no image field, so looked-up
products render without a picture.

### The store context is whichever pin is selected

The map already owns the notion of a current store, so the lookup form reuses it rather than
introducing a second store selector. With no pin selected the panel asks the user to pick one and
issues no request.

*Alternatives considered:* a header `<select>` of ~90 stores duplicates the map and is harder to
scan; nearest-store-by-geolocation is better for someone standing in the shop but adds a
permission prompt and a fallback path for a denied prompt. Both remain viable follow-ups; neither
is needed for the first version.

### "Not found" must not claim the product does not exist

`404 "No such Product"` is returned both for a barcode that exists nowhere and for a real product
the selected store does not carry — the two are indistinguishable from the response. So the
message is scoped to the store ("ikke fundet i denne butik") rather than asserting anything about
the catalogue as a whole.

### Cache: `localStorage`, keyed by store + EAN, 7-day TTL, size-capped

Regular prices change on the order of weeks, so a long TTL is safe and is the main quota defense.
Mirror the existing `sg_stores_v1` pattern (`{at, ...}` wrapper, `try/catch` around every storage
access, treat failure as "no cache"). One key per store-and-EAN pair (`sg_ean_v1:<storeId>:<ean>`) rather than one
blob, so a large cache cannot be lost or rewritten wholesale on every lookup — and, critically,
so one store's price can never be served as another's. On `QuotaExceededError`,
drop the oldest ~25% of `sg_ean_v1:` keys and retry once.

*Alternative:* IndexedDB — correct for large caches but far more code for a few hundred small
rows. Rejected.

### 403 is a first-class state, 401 reuses existing handling

`sgFetch` already surfaces `statusCode`. Add a `403` branch *only* in the price-lookup callers:
show "din API-nøgle mangler adgang til Products EAN" plus the developer-portal link. Do not touch
`forgetToken()` for 403 — the token is fine, the grant is missing; clearing it would be wrong and
would log the user out of a working map. `401` continues to route to `forgetToken()`, `429` to the
existing quota message in `describe()`.

### Row comparison is opt-in per row

Each clearance row with `product.ean` gets a small "tjek normalpris" button. Clicking it resolves
that one EAN. A store can carry 100+ clearance items; auto-resolving all of them would spend the
quota on data the user did not ask for and would hammer the API on every pin click. The
disagreement flag (>1 DKK apart) is computed only for rows the user actually resolved.

## Risks / Trade-offs

- **"Not found" is ambiguous** → `404` cannot distinguish an unknown barcode from a product the
  store does not stock, so every message is store-scoped and never claims the product does not
  exist. Accepted limitation, not fixable from this API.
- **A price is only true for one store** → Always render the store name next to the price, and key
  the cache by store so a stale entry can never leak across stores.
- **Non-commercial licence now binds the whole app** → State it in the README and in the UI near
  any displayed price. It is a documentation obligation, not a technical one, but it is the one
  risk that cannot be fixed later by a code change.
- **`BarcodeDetector` absent on ~30% of mobile browsers** → Manual entry is a first-class path,
  not a degraded one; the field is always present and the scan button is merely additive.
- **Camera stream leaks if the user navigates away mid-scan** → Stop all tracks in a single
  `teardown()` called from success, cancel, error, and `visibilitychange`.
- **Quota exhaustion from row-compare clicking** → Per-row opt-in, 7-day cache, in-flight dedupe,
  and no auto-retry on 429.
- **A fourth API scope is more setup friction for new users** → The README marks it optional and
  the app runs without it; the gate still only validates against `/v2/stores`.

## Migration Plan

Purely additive to a static site. No data migration, no breaking change: a user who never grants
the Products EAN scope sees the app exactly as it is today, minus the scan control. Rollback is
reverting the commit; stale `sg_ean_v1:*` keys left in a browser are inert and are ignored by the
previous version.
