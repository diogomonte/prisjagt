# Proposal

## Why

Prisjagt asks the Salling Group API for data it already had. Clearance offers are kept only in an
in-memory map, so every page reload refetches every store the user opens. Worse, measurement
against the live API shows the limiter is far tighter than assumed: six requests in roughly two
seconds returned `429 "Your IP (…) has been blocked due to excessive requests. Try again in a
minute."` The block is **per IP, not per key**, so one impatient user takes the app down for
everyone sharing that address — including every visitor behind a shared NAT. Today a user who
clicks six map pins quickly breaks the app and is told only "prøv igen om lidt".

## What Changes

- Persist clearance offers across reloads in a new `sg_clear_v1:<storeId>` namespace with a
  30-minute lifetime. Reopening a store, or reloading the page, costs zero requests.
- Serve cached data **stale-while-revalidate**: cached offers paint immediately, a background
  refresh replaces them when the entry is older than its lifetime, and a *failed* refresh leaves
  the usable prices on screen rather than blanking the panel.
- Store only the fields the UI renders. Measured, this is 290 bytes per clearance row instead of
  639 — 55% smaller, so all ~90 Copenhagen stores fit in ~0.7 MB of a ~5 MB budget.
- Shape outbound traffic in one place: at most one request in flight, a minimum gap between
  request starts, and identical in-flight requests coalesced into one promise.
- On a 429, stop sending for a cooldown period and say so with a live countdown. The API's
  `retry-after` header is unusable — it returned `46443` (12.9 hours) while the body said "a
  minute" — so the value must be clamped to a sane range rather than trusted.
- Unify the three existing ad-hoc caches (token, stores, EAN prices) behind one small storage
  helper, generalising the quota-eviction logic that already exists for EAN entries.
- Report cache and cooldown state in the UI instead of failing silently.

## Capabilities

### New Capabilities
- `api-request-budget`: How the application conserves its API request budget — what is cached and
  for how long, how stale data is served and revalidated, how outbound requests are paced, and how
  rate-limit responses are absorbed and surfaced.

### Modified Capabilities
<!-- None. `price-lookup` is still an unarchived change, so there is no spec file under
     openspec/specs/ to delta. Its own caching requirement (per-store key, bounded lifetime)
     stays true under the unified helper; the new pacing behaviour is specified here and applies
     to every caller, including price lookups. -->

## Impact

- **Code**: `app.js` — new cache helper, the limiter inside `sgFetch` (the single choke point all
  traffic already passes through), revalidation in the store-selection and offer-rendering paths,
  and a trim helper. `index.html` — a footer status line, an "opdateret" line in the panel header,
  and small CSS. `README.md` — the cache namespaces, lifetimes, and the IP-based spike limit.
- **APIs**: no new endpoints. Reduces calls to `/v1/food-waste/{storeId}` and smooths the paged
  `/v2/stores` loop, which currently fires its pages back to back and is itself a burst.
- **Dependencies**: none added.
- **Overlap**: the in-flight change `add-ean-price-lookup` is mid-implementation and owns
  `sgFetch` and the EAN cache that this change refactors. The two must be sequenced, not applied
  in parallel.
- **Risk**: users may see a price up to the cache lifetime out of date. Mitigated by showing the
  update time and keeping an explicit refresh control.
