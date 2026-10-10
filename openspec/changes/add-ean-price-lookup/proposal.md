# Proposal

## Why

Prisjagt currently shows only clearance (anti-food-waste) prices, because that was the only
price data we had access to. Salling Group also publishes a **Products EAN API**
(`GET /v2/products/{ean}`) that returns the regular in-store price for a product by barcode.
That closes the gap between what users ask for ("what does this cost in the shop?") and what the
app can answer, and it lets us verify that a clearance item is actually a good deal rather than
trusting the `originalPrice` the offer feed reports.

## What Changes

- Add an EAN lookup to the app: with a store selected on the map, the user enters or scans a
  barcode and sees that product's regular price **at that store**. Prices are per-store, so a
  lookup without a selected store is refused rather than defaulted.
- Use the device camera for scanning **only** via the browser's built-in `BarcodeDetector` API.
  Where it is unavailable (Safari, Firefox), the input degrades to manual barcode entry. No
  barcode library is added — the project's zero-dependency constraint holds.
- Enrich the existing store panel: each clearance row can resolve its `product.ean` against the
  EAN API to show the regular shelf price alongside the clearance price, and flag rows where the
  reported `originalPrice` disagrees with it. Resolution is on demand (per row, on click), never
  a bulk fetch, to stay inside the API quota.
- Cache EAN lookups in `localStorage` with a TTL, since regular prices move far more slowly than
  clearance stock.
- Document the new required API scope and its licence constraint in the README: the Products EAN
  API is licensed for **educational, non-commercial use only**, which now applies to the whole
  deployed app.

## Capabilities

### New Capabilities
- `price-lookup`: Resolving a product barcode (EAN) to its current regular in-store price,
  including caching, error and unavailability handling, and the barcode capture path.

### Modified Capabilities
<!-- None. The existing clearance-map behavior has no spec file yet, so there is no
     requirement delta to express; the panel integration is covered as a requirement of
     price-lookup and recorded under Impact. -->

## Impact

- **Code**: `index.html` (lookup UI region, scan button), `app.js` (`sgFetch` reuse, new
  `lookupEan` + cache, clearance-row enrichment), `README.md` (scope + licence note).
- **APIs**: adds `GET https://api.sallinggroup.com/v2/products/{ean}?storeId=<id>`. The
  `storeId` parameter is required (`400 "Missing storeId"` without it). Verified to return
  `access-control-allow-origin: *`, so it is callable directly from the browser with the user's
  existing bearer token — no proxy, no backend.
- **Pre-existing bug surfaced**: this API reports failures in an `errorMessage` field while the
  gateway uses `error`. The shared `sgFetch` helper read only `error`, so every API error in the
  app — including on the map and clearance panels — lost its message. Fixed as part of this
  change.
- **Access**: the user's Salling Group app must additionally be granted the *Salling Group
  Products EAN* scope. The app must keep working when it is not granted (403) rather than break.
- **Dependencies**: none added. `BarcodeDetector` is a platform API, not a library.
- **Licence**: the EAN API's non-commercial, educational-use terms constrain how Prisjagt may be
  deployed and must be stated in the README.
