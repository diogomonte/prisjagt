# Tasks

## 1. Unified cache helper

- [x] 1.1 Add a `cacheGet(key, ttl)` returning `{ data, age, stale }` or `null`, and a
      `cachePut(key, data)`, both wrapping every `localStorage` access in `try/catch`; verify in
      the Node harness that a fresh entry reports `stale: false`, an expired one reports
      `stale: true` **with its data intact**, a corrupt entry returns `null`, and dead storage
      returns `null` / `false` without throwing
- [x] 1.2 Generalise `evictOldestEans` into `evictOldest(prefix)` and route the EAN path through
      it; verify the existing eviction assertions still pass and that eviction with a clearance
      prefix leaves `sg_token`, `sg_stores_v1` and `sg_ean_v1:*` untouched
- [x] 1.3 Re-point `cachedStores`/`fetchStores` and the EAN cache at the shared helper with their
      existing key names and lifetimes (24 h, 7 d); verify the full harness suite still passes and
      that entries written by the previous version are still readable

## 2. Request pacing in `sgFetch`

- [x] 2.1 Add a queue inside `sgFetch`: one request in flight, a minimum 400 ms gap between
      starts; verify in the harness with a stubbed clock and fetch that eight calls issue eight
      requests, in order, each at least 400 ms after the previous start
- [x] 2.2 Coalesce identical in-flight URLs into one promise (generalising the existing
      `eanInFlight` pattern so stores and clearances get it too); verify three concurrent calls
      for one URL issue a single request and all three resolve with equal data, and that a
      different URL is not coalesced with them
- [x] 2.3 Verify a failed request clears its queue slot and in-flight entry, so a retry of the
      same URL issues a fresh request rather than resolving from a dead promise

## 3. Rate-limit cooldown

- [x] 3.1 On a 429, set a cooldown until which `sgFetch` refuses to send, rejecting callers
      immediately with a `cooldown` error instead of queueing them; verify with a stubbed 429 that
      no further request leaves during the cooldown and that queued callers reject rather than
      pile up
- [x] 3.2 Derive the wait from the response's retry hint clamped to 5 s–300 s; verify
      `retry-after: 46443` (the measured real value) clamps to 300 s, `retry-after: 1` raises to
      5 s, a sane `60` is honoured as 60 s, and a missing or non-numeric header defaults to 60 s
- [x] 3.3 Verify the cooldown expires on its own: after the clamped wait elapses on a stubbed
      clock, the next call issues a request normally

## 4. Persistent clearance cache

- [x] 4.1 Add a `trimClearances` helper keeping only rendered fields and dropping `categories`,
      `lastUpdate`, `startTime`, `currency` and `discount`; verify against the real 418-row
      fixture that output averages ≈290 bytes per row (vs 639 raw) and that every field the
      renderer reads is still present
- [x] 4.2 Store fetched offers under `sg_clear_v1:<storeId>` through the shared helper with a
      30-minute lifetime; verify a store opened twice in one session issues one request, and that
      after a simulated reload (cleared in-memory map, intact storage) it issues none
- [ ] 4.3 Keep the in-memory `offerCache` as the first tier in front of storage; verify a repeat
      click within a session does not re-parse from storage (assert the storage read count)
- [x] 4.4 Clear `sg_clear_v1:*` in `forgetToken` alongside the other namespaces; verify no
      clearance data survives forgetting the key

## 5. Stale-while-revalidate rendering

- [ ] 5.1 Render stored offers immediately and start a single background refresh only when the
      entry is stale; verify in the browser Network tab that a fresh entry fires no request and a
      stale one fires exactly one, with prices visible before it resolves
- [ ] 5.2 Replace the list in place when a background refresh resolves, leaving the panel's scroll
      position usable; verify by making a stale store's refresh return a changed price
- [ ] 5.3 On a failed background refresh keep the stale data on screen with a quiet note; verify
      by taking the network offline and reopening a stale store — prices stay, panel does not
      blank, no error replaces the list
- [ ] 5.4 Show "Opdateret kl. HH:MM" for stored data and a refreshing indicator while a refresh is
      in flight; verify both appear in light and dark mode and at 375px width
- [ ] 5.5 Make the existing "Opdatér" button force a refresh past the lifetime, and verify it
      still works while a cooldown is active by reporting the cooldown rather than appearing dead

## 6. Visible budget state

- [ ] 6.1 Add a footer status line reporting cache/cooldown state; verify it reads the cooldown
      with a live countdown that ticks down and clears itself when the cooldown ends
- [ ] 6.2 Verify a cooldown does not block cached browsing: with a cooldown active, opening a
      store that has stored offers displays them and attempts no revalidation (Network tab)

## 7. Documentation

- [x] 7.1 Document in `README.md` the cache namespaces and lifetimes, that clearance prices may be
      up to 30 minutes old with a shown update time, and that the provider's spike protection
      blocks **by IP** after a short burst (quoting the measured 6-requests-in-2-seconds figure)
      so anyone redeploying understands why the pacing exists; verify the documented key names
      match what the code actually writes

## 8. End-to-end verification

- [ ] 8.1 With a live token, walk the full flow: open five stores, reload, reopen all five — the
      Network tab shows five `food-waste` requests before the reload and none after
- [ ] 8.2 Click six pins as fast as possible and verify requests leave ~400 ms apart, all six
      succeed, and no 429 occurs — the case that currently breaks the app
- [ ] 8.3 After opening 20 stores, verify total `localStorage` usage is within a few hundred KB,
      confirming the trim holds in practice
- [x] 8.4 Run `node --check app.js`, the full harness suite, confirm every `getElementById` id
      exists in `index.html`, and grep the tree to confirm no API key or cached data was committed
