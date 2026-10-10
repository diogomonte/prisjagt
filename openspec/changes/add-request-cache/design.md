# Design

## Context

See `proposal.md` - Why. The state this has to fit into:

- `app.js` is one IIFE in ES5-compatible style, no modules, no build step, no dependencies beyond
  vendored Leaflet.
- **Every** API call already funnels through one helper, `sgFetch(path, overrideToken)`, which
  injects the bearer header and throws an `Error` carrying `statusCode` plus the API's message
  (read from `error` or `errorMessage`, since the two APIs differ). That single choke point is why
  a limiter can be added without auditing call sites.
- Three ad-hoc caches exist, each with its own `try/catch` storage code: `sg_token`,
  `sg_stores_v1` (24 h, holds the whole store list in one key), and `sg_ean_v1:<storeId>:<ean>`
  (7 d, one key per entry, with quota eviction in `evictOldestEans`).
- Clearance offers are held only in an in-memory `Map`, cleared on every reload.

**Measured against the live API** (these numbers drive the decisions below):

| Fact | Value |
|---|---|
| One store's offers | 9.7 KB |
| Clearance row as returned / trimmed to rendered fields | 639 B / 290 B |
| All ~90 Copenhagen stores, trimmed | ~0.7 MB of a ~5 MB budget |
| Burst that triggered a block | 6 requests in ~2 s |
| Block scope | **by IP address**, not by key |
| `retry-after` on that 429 | `46443` (12.9 h) while the body said "a minute" |

## Goals / Non-Goals

**Goals:**
- Normal browsing costs close to zero requests after the first visit.
- A burst of user clicks cannot trip the IP block.
- One storage helper, rather than a fourth hand-rolled cache.
- Cached data is never silently presented as live.

**Non-Goals:**
- Bulk or city-wide prefetch. One bulk page returns 16 stores and 418 rows for 260 KB, and paging
  the city is ~6 requests back to back — precisely the pattern that produced the IP block.
- Offline support or a service worker.
- IndexedDB. At ~0.7 MB, `localStorage` is adequate and synchronous, which suits the existing
  code shape.
- Caching inside `dev-server.py`. It is a local dev tool; production has no proxy, so a cache
  there would hide the behaviour that matters.

## Decisions

### The limiter lives inside `sgFetch`, not beside it

A queue wrapper around the existing fetch call: at most one request in flight, a minimum interval
between starts, and a map of in-flight promises keyed by URL so duplicate concurrent requests
share one response. Because every caller already goes through `sgFetch`, nothing can bypass it and
no call site changes.

*Alternative considered:* throttling at each call site (store paging, clearance fetch, EAN
lookup). Rejected — it is three places to get right, and the next feature would add a fourth.

Pacing is **serialise + minimum gap**, not a token bucket. The observed limit is a short-window
IP block, and the simplest shape that respects it is "one at a time, spaced". A token bucket would
let a burst through by design, which is the thing to avoid.

### Cooldown is a gate on sending, and clamps the advertised delay

A 429 sets a timestamp until which `sgFetch` refuses to send, rejecting callers immediately with a
cooldown error rather than queueing them behind it — a queue would deliver a thundering herd the
moment the gate opened. The wait comes from the response's retry hint **clamped into a plausible
range**; the measured `46443` would otherwise disable the app for half a day while the body said a
minute. Clamping, rather than ignoring the header, keeps us honest if the provider starts sending
sane values.

### Freshness is per namespace, and cached reads report staleness

One helper over `localStorage` returning `{ data, age, stale }` rather than `data | null`, so the
caller can decide between "render it" and "render it and revalidate". That distinction is what
stale-while-revalidate needs and is exactly what the current `cachedStores`/`eanCacheGet` pattern
cannot express — both collapse an expired entry to `null`, discarding data that is still worth
showing.

Lifetimes: stores 24 h (locations barely move), clearances 30 min (stock shifts during the day),
EAN prices 7 d (regular prices move slowly). Keys keep their existing names so an upgrade does not
orphan what users already have cached.

### Trimming is a storage decision, not a model decision

The trim happens on write and the UI keeps reading the same field names, so rendering code is
untouched. Dropped: `categories` (both languages), `lastUpdate`, `startTime`, `currency`,
`discount` — none is rendered, and `discount` is derivable from the two prices. This is what turns
1.4 MB into 0.7 MB.

*Risk accepted:* a future feature that wants a dropped field must bump the namespace version
(`sg_clear_v2:`) to invalidate stale trimmed entries.

### Eviction is generalised, not duplicated

`evictOldestEans` already walks `localStorage`, sorts by age, drops the oldest quarter and retries
once — and is already covered by assertions proving it leaves `sg_token` and `sg_stores_v1` alone.
It becomes prefix-parameterised and serves clearances too. Credentials are never eviction
candidates.

## Risks / Trade-offs

- **Users see prices up to 30 minutes old** → The update time is always displayed and an explicit
  refresh is one click away. This is the deliberate cost of the decision above.
- **Serialising adds latency to concurrent work** → At one request at a time with a short gap, the
  paged store fetch at boot takes a little longer. Acceptable: the alternative is the burst that
  currently trips the block, and after the first visit the cache means far fewer requests anyway.
- **A cooldown blocks even the first, innocent request** → Cached stores still open normally
  during a cooldown, so the app stays usable rather than dead.
- **Namespace drift between the two in-flight changes** → `add-ean-price-lookup` owns `sgFetch`
  and the EAN cache today. Applying both at once would conflict; sequencing is required and is
  called out in the proposal's Impact.
- **`localStorage` is synchronous** → Writes of a few hundred KB are fast enough at this size, but
  a much larger cache would need to move off the main thread. The namespace version gives a path.

## Migration Plan

Purely additive to a static site, with no data migration: existing `sg_stores_v1` and
`sg_ean_v1:*` entries keep their key names and remain readable, and clearances simply start being
stored where nothing was stored before. Rollback is reverting the commit; leftover
`sg_clear_v1:*` keys are inert and ignored by the previous version.
