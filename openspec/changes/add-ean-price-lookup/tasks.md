# Tasks

## 1. Confirm the API contract

- [x] 1.1 Call `GET /v2/products/{ean}` with a real granted token for a known Salling product and
      record the exact response JSON; verify it contains a product name and a numeric price field,
      and paste the observed shape into a comment above `lookupEan` in `app.js`
- [x] 1.2 Call the same endpoint with a nonsense but well-formed 13-digit EAN and record the
      status code and body; verify the not-found case is distinguishable from an error
- [x] 1.3 Call the endpoint with a token that lacks the Products EAN grant and verify it returns
      403 (not 401), confirming the design's 403-vs-401 split

## 2. Lookup core with caching

- [x] 2.1 Add `validEan(input)` to `app.js` — strip whitespace, accept only 8/12/13/14 digits;
      verify by calling it from the console with `"5700382235705"`, `"abc"`, `"123"` and an
      EAN containing spaces, expecting true/false/false/true
- [x] 2.2 Rework `eanCacheGet` / `eanCacheSet` to key on store **and** barcode
      (`sg_ean_v1:<storeId>:<ean>`) with a `{at, data}` wrapper and 7-day TTL, every access in
      `try/catch`; verify a stored entry is returned without a network call, that a hand-edited
      old `at` value causes a refetch, and that the same barcode at a second store never reads
      the first store's cached price
- [x] 2.3 On `QuotaExceededError` in `eanCacheSet`, drop the oldest ~25% of `sg_ean_v1:` keys and
      retry once; verify by filling `localStorage` with junk until it throws, then confirming a
      lookup still succeeds
- [x] 2.4 Rework `lookupEan(ean, storeId)`: require both arguments, validate, cache hit,
      in-flight `Map` keyed by `storeId + ':' + ean`, request
      `/v2/products/<ean>?storeId=<storeId>`, normalize from the shape recorded in 1.1 (price
      under `instore`, `description` = brand + `name` = product, `instore: null` means not
      carried), treat a missing numeric price as an explicit `{price: null}` outcome; verify two
      rapid calls for the same store+EAN issue exactly one request and that a call with no
      storeId is rejected without a request
- [x] 2.5 Verify `lookupEan` surfaces 403 and 429 distinctly from not-found by stubbing
      `window.fetch` in the console to return each status and checking the rejected error's
      `statusCode`
- [x] 2.6 Fix `sgFetch` to read the API's message from `errorMessage` as well as `error`, since
      the products API uses the former and the gateway the latter; verify by stubbing a 504 body
      of `{"errorMessage":"Gateway Timeout..."}` and confirming the text reaches the user-facing
      message instead of a bare "HTTP 504"

## 3. Lookup UI

- [ ] 3.1 Add a barcode input plus submit button to the `index.html` header region, styled with
      the existing tokens; verify it renders in light and dark mode and at 375px wide with no
      horizontal scroll
- [ ] 3.2 Render the lookup result into `#panel` via the existing `panelMessage()`: product name,
      regular price formatted with the existing `kr()`, lazy-loaded image with `onerror` removal,
      and the Salling attribution plus "priser kan afvige fra hylden" note; verify against a real
      EAN that the price matches what 1.1 recorded
- [ ] 3.3 Wire the failure states to distinct inline messages — invalid input (no request issued,
      confirm in the Network tab), not-found scoped to the selected store (must not claim the
      product does not exist anywhere), `instore: null` / price unavailable, 403 with the
      developer-portal link, 429, network error with a retry button; verify each by stubbing
      `fetch` per case
- [ ] 3.4 Verify a 401 from a price lookup still routes through `forgetToken()` and a 403 does
      **not**, by stubbing each status and confirming the map stays loaded in the 403 case
- [ ] 3.5 Wire the store context: the lookup form resolves against the currently selected pin,
      the rendered result names that store, and with no pin selected the panel asks the user to
      choose one; verify no request is issued with no store selected (Network tab) and that
      selecting a different store then re-submitting the same barcode queries the new store

## 4. Camera scanning

- [ ] 4.1 Add a scan button rendered only when `'BarcodeDetector' in window`; verify it is present
      in Chrome and absent in Safari or with `BarcodeDetector` deleted from `window`
- [ ] 4.2 Implement scan: `getUserMedia({video:{facingMode:'environment'}})` into a `<video>`,
      poll `detect()` on `requestAnimationFrame`, on first result stop and feed the value into
      `lookupEan`; verify end-to-end by scanning a real product barcode on a phone over HTTPS or
      `localhost`
- [ ] 4.3 Implement a single `teardown()` stopping every track, called from success, cancel,
      error and `visibilitychange`; verify the camera indicator light goes out in all four paths
- [ ] 4.4 Handle denied permission and absent camera by returning to manual entry with a message;
      verify by denying the permission prompt and by running in a browser profile with no camera

## 5. Clearance row comparison

- [ ] 5.1 In `offerRow()`, add a "tjek normalpris" button only when `item.product.ean` is present;
      verify a store panel shows the button on rows with an EAN and omits it on rows without one
- [ ] 5.2 On click, resolve that one EAN via `lookupEan(ean, storeId)` using the store whose
      clearances are displayed, and render the regular price into that row; verify in the Network
      tab that exactly one request fires, that it carries that store's id, and that no sibling
      row changes
- [x] 5.3 When the resolved regular price differs from `offer.originalPrice` by more than 1 DKK,
      mark the row showing both values; verify against a real store panel, or by stubbing
      `lookupEan` to return a price 5 kr from the reported original
- [ ] 5.4 Verify a 403 on a row comparison leaves the rest of the clearance list intact and
      interactive, with the panel still scrollable

## 6. Documentation

- [ ] 6.1 Update `README.md`: add Products EAN to the API-scope list marked **optional**, document
      the barcode lookup and the `BarcodeDetector`-only scanning limitation, and state the
      educational/non-commercial licence constraint on deployment; verify the setup steps work by
      following them in a fresh browser profile
- [x] 6.2 Update the README's "What this shows" section — it currently says no shelf-price API
      exists; verify the corrected text matches the behavior actually shipped

## 7. End-to-end verification

- [ ] 7.1 With a token granted all three scopes, serve via `python3 -m http.server` and walk the
      full flow: map loads, pin click lists clearances, row compare shows a regular price that
      matches the row's `originalPrice`, header lookup resolves a typed EAN against the selected
      store, switching store re-queries, and reload serves cached EANs with no network calls
- [ ] 7.2 With a token granted only food-waste and stores, verify the map and clearance browsing
      are byte-for-byte unaffected and only price lookups report the missing grant
- [x] 7.3 Run `node --check app.js`, confirm every `getElementById` id exists in `index.html`, and
      grep the working tree to confirm no API key or EAN cache data was committed
