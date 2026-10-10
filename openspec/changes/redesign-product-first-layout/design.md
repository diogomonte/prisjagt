# Design

## Context

See `proposal.md` - Why. What the approach has to fit:

- `index.html` is a single file carrying ~200 lines of inline CSS and CSS custom properties, with
  a `prefers-color-scheme: dark` block overriding them.
- Most markup is built in `app.js`, not in HTML: `offerRow`, `renderOffers`, `panelHead`,
  `renderProduct`. A styling change is therefore mostly a JavaScript change.
- The project's defining constraint so far has been zero dependencies, no build step, everything
  vendored (Leaflet is committed under `vendor/`).
- `classList.add/remove('hidden')` is used throughout for show/hide.

**Measured facts from the live API that shape the data decisions:**

| Fact | Value |
|---|---|
| Bulk `/v1/food-waste/?geo=…` | 16 stores, 418 offers, 260 KB, **one** request |
| Per-store `/v1/food-waste/{id}` | ~25 offers, 9.7 KB, one request each |
| Rate limiting | per **IP**, burst-sensitive: 6 requests at 400 ms → blocked; **14 at 2 s → clean** |
| Offer image | `product.image`, a 400×400 CDN URL already present in the response |

## Goals / Non-Goals

**Goals:**
- Offers readable at a glance, with the discount legible before anything else.
- A full grid on arrival for one request, not sixteen.
- Tailwind's authoring benefits without putting a build step in anyone's deploy path.

**Non-Goals:**
- Dark mode, in any form. Removed, not hidden behind a toggle.
- Restyling the map tiles. Only the map's size, border and placement change.
- Any runtime JavaScript dependency. Tailwind ships as a stylesheet, nothing more.
- Changing cache lifetimes, pacing, or what the EAN lookup returns — this change presents that
  data differently, it does not alter it.

## Decisions

### Tailwind is vendored as generated CSS, not loaded from a CDN

The Tailwind CLI runs at development time over `index.html` and `app.js`, and its output is
committed as `vendor/tailwind.css` alongside `vendor/leaflet.css`. Deployment copies files; no
build runs in CI or in the browser.

*Alternatives considered:* the Play CDN would avoid a build entirely, but it adds a third-party
runtime request (breaking the project's no-CDN rule), ships ~100 KB of JavaScript, and its own
documentation rules it out for production. Hand-written CSS would preserve zero dependencies
exactly, but the user asked for Tailwind.

Consequence, accepted and stated plainly: the repository gains a dev dependency and a regeneration
step. Anyone editing class names must re-run it. This is the first time this project is not
build-free, and it is a deliberate trade, not an oversight.

**Scanner trap:** Tailwind discovers classes by scanning source text. Classes assembled by
concatenation (`'badge-' + size`) are invisible to it and silently missing from the output. Every
class must appear as a complete literal in the source.

### The grid's model is a flat offer list, not the per-store response

Rendering keeps a flat array where each offer carries its store, rather than rendering from the
nested per-store response. Filtering by store, sorting by discount across stores, and showing a
store name on each card all fall out of that shape; the nested shape makes each of them a special
case.

The bulk response is still **written into the existing per-store cache keys**, so this change
feeds the cache rather than bypassing it, and a later single-store refresh stays consistent with
what the grid shows.

### One bulk request on boot, not sixteen per-store requests

Measured, the bulk endpoint returns 16 stores for the cost of one request. Filling the same grid
store-by-store would be 16 requests — and at the pacing the rate limiter demands (~2 s apart) that
is over half a minute of trickling content, besides being the burst pattern that triggers an
IP-level block.

This reverses the earlier judgement in `add-request-cache` that per-store fetching was the gentler
option. That judgement was made before the limiter was measured; bulk is both faster to display
and strictly fewer requests.

### Store selection filters rather than fetches

Because the grid already holds every nearby offer, clicking a pin needs no request at all — it
narrows an in-memory list. This makes the map feel instant and removes the most common source of
requests in the current design.

### Leaflet must be told when its box changes

Leaflet caches the map's pixel size and renders grey tiles if the container resizes without
notice. The map now changes size at breakpoints and when the mobile overlay opens, so
`invalidateSize()` must fire on both. This is the single most likely visual bug in this change and
is called out as its own verification step.

## Risks / Trade-offs

- **A stale `vendor/tailwind.css` silently breaks styling** → The generated file is committed, so
  a contributor who edits classes without regenerating ships broken CSS. Mitigated by documenting
  the step in the README and keeping class names in literal form so regeneration is deterministic.
- **The bulk response is 260 KB and covers 16 stores, not all 169** → The grid is "nearby offers",
  not "every offer in Copenhagen". Paging further costs a request per page; deferred until the
  grid proves too sparse in practice.
- **Grey map tiles after a resize** → Covered by an explicit `invalidateSize` call and a test that
  asserts loaded tiles rather than merely a visible container.
- **Dark-mode users lose a theme they had** → Deliberate, at the user's explicit instruction. The
  single theme must therefore be comfortable in a dark room, so the design avoids large expanses
  of pure white at full brightness in favour of a soft green-tinted surface.
- **Three in-flight changes touching the same two files** → This one rewrites the render paths the
  other two own. Sequencing is a hard requirement, not a preference.

## Migration Plan

No data migration: cache keys, lifetimes and the API surface are unchanged, so an existing user's
cached offers render in the new grid immediately. Rollback is reverting the commit; `vendor/`
gains one file that the previous version simply would not reference.
