# Proposal

## Why

The layout buries the thing the app exists for. The map occupies most of the viewport while
offers are squeezed into a 360px sidebar as a cramped vertical list — and only after the user
clicks a pin, so the screen shows **no prices at all** on arrival. For an app whose purpose is
"see what is cheap near me right now", the first screen answers nothing.

The palette compounds it: a neutral grey that flips with the OS theme, which reads as a generic
utility rather than a grocery-deals site.

## What Changes

- Invert the hierarchy: **products become the subject, the map becomes navigation.** The offer
  grid occupies at least half the viewport; the map is demoted to a smaller secondary column.
- Replace list rows with image-led product cards in a responsive grid — picture, discount badge,
  large new price, struck-through old price, store and stock.
- Fill the grid on arrival with **one** bulk request covering every nearby store, instead of
  waiting for a pin click. Clicking a pin then *filters* the grid rather than populating it.
- Add sorting (discount, price, name) and a dismissible store filter chip.
- Adopt Tailwind for styling, shipped as a **vendored, pre-generated stylesheet** so the deployed
  site and runtime stay dependency-free and build-free.
- **BREAKING (visual):** remove dark mode entirely. The app renders one light green/white theme
  regardless of OS preference.
- On phones, show products full-screen and move the map behind a "Kort" button.

## Capabilities

### New Capabilities
- `offer-browsing`: How a user sees and navigates clearance offers — the relative prominence of
  offers versus the map, what the grid contains on arrival, how a card presents a discount, and
  how filtering and sorting narrow the set.

### Modified Capabilities
<!-- None. `price-lookup` and `api-request-budget` are both still unarchived changes, so neither
     has a spec file under openspec/specs/ to delta. This change alters how their data is
     presented, not what they require: the EAN lookup result and the cache lifetimes are
     unchanged. -->

## Impact

- **Code**: `index.html` (grid shell, mobile map overlay, dark-mode block removed, ~200 lines of
  inline CSS replaced by utility classes); `app.js` (`offerRow` → `offerCard`, `renderOffers` →
  grid rendering over a flat offer model, bulk boot fetch, filter and sort state);
  `vendor/tailwind.css` (generated, committed); dev-only `package.json` and Tailwind config;
  `README.md`.
- **APIs**: no new endpoints. Boot issues one `/v1/food-waste/?geo=…` bulk call (16 stores, ~418
  offers, 260 KB) instead of one call per store clicked — measured as strictly fewer requests.
- **Project character**: this is the first build step in the project. It runs only when class
  names change and never at deploy time, but the repo is no longer dependency-free. Accepted
  deliberately in choosing Tailwind over hand-written CSS.
- **Sequencing**: `add-ean-price-lookup` and `add-request-cache` are both in flight and own the
  render paths this change rewrites. This must land after both.
