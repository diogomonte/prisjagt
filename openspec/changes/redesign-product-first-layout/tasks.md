# Tasks

## 1. Tailwind toolchain

- [x] 1.1 Add a dev-only `package.json` with a `css` script running the Tailwind CLI over
      `index.html` and `app.js` into `vendor/tailwind.css`, plus the Tailwind config defining the
      brand palette (deep green, soft green wash, ink, muted, and a separate "deal" colour for
      discounts so green never has to mean both brand and saving); verify `npm run css` produces a
      non-empty stylesheet and that `node_modules/` is git-ignored while `vendor/tailwind.css` is
      **not**
- [x] 1.2 Link the generated stylesheet from `index.html` and confirm the page still renders with
      the dev server and with no network access to any third-party host; verify by loading the
      page offline-except-localhost and checking no request leaves for a CDN
- [x] 1.3 Document the regeneration step in `README.md` — when it is needed, that it never runs at
      deploy time, and that classes must be written as complete literals or the scanner misses
      them; verify by following the documented steps from a clean clone

## 2. Light-only theme

- [x] 2.1 Delete the `prefers-color-scheme: dark` block and every dark override from
      `index.html`, replacing the custom-property palette with the Tailwind theme; verify with a
      browser forced to `colorScheme: 'dark'` that the rendered background stays light
- [x] 2.2 Check text contrast across the gate, header, cards and footer in the single theme;
      verify computed foreground/background pairs meet a readable contrast margin, including the
      muted secondary text that is easiest to get wrong

## 3. Layout shell

- [x] 3.1 Replace the flex split with a responsive grid giving offers at least half the viewport
      width and the map less than that on wide screens; verify with measured
      `getBoundingClientRect` widths at 1280px that offers ≥50% and map ≤45%
- [x] 3.2 Collapse to a products-only single column below the side-by-side breakpoint, with the
      map removed from the flow; verify at 375px that the grid is full width, no map column is
      laid out, and the document has zero horizontal overflow
- [x] 3.3 Add the mobile "Kort" control opening the map as a full-screen overlay, and a dismiss
      path that returns to the grid preserving any store selection; verify opening and dismissing
      at 375px
- [x] 3.4 Call `invalidateSize()` whenever the map's box changes — breakpoint change and overlay
      open; verify by asserting loaded tiles (not merely a visible container) after opening the
      overlay, which is the grey-tile failure this guards against

## 4. Product cards

- [x] 4.1 Replace `offerRow` with a card renderer emitting image, overlaid discount badge, product
      name clamped to two lines, prominent new price, struck-through original price, and a store
      and stock footer; verify a rendered card contains every one of those elements for a real
      offer
- [x] 4.2 Keep the existing lazy-loading and error-removal behaviour for product images and make
      the card lay out correctly without one; verify by rendering an offer with a broken image URL
      and confirming no gap or overlap remains
- [x] 4.3 Lay the cards out as a responsive grid whose column count adapts to width; verify the
      column count increases between 375px, 1024px and 1440px and that no width causes horizontal
      scrolling
- [x] 4.4 Carry the existing "tjek normalpris" control onto the card without changing its
      behaviour; verify it still resolves one offer against its own store and renders the result
      on that card

## 5. Bulk data and the offer model

- [x] 5.1 Build a flat offer model where each entry carries its store, populated from the bulk
      response; verify the model's length equals the sum of the per-store offer counts and that
      every entry resolves to a known store
- [x] 5.2 Fetch the bulk area response once on boot and write each store's offers into the
      existing per-store cache keys so the cache is fed rather than bypassed; verify exactly one
      clearance request is issued on boot and that per-store cache entries exist afterwards
- [x] 5.3 Render the grid from the model on arrival, with an explanatory empty state when no
      nearby store has offers; verify the grid is populated from a single request, and verify the
      empty state by returning an empty bulk response
- [x] 5.4 Reuse the cached model on reload rather than refetching when it is still fresh; verify a
      reload issues no clearance request and still fills the grid

## 6. Filtering and sorting

- [x] 6.1 Make selecting a store filter the grid in memory with no request, showing a dismissible
      indication of the active store; verify clicking a pin issues zero requests and that every
      visible card belongs to that store
- [x] 6.2 Clear the filter from that control and restore the full set; verify the card count
      returns to the unfiltered total
- [x] 6.3 Add a sort control for discount, price and name, defaulting to largest discount first,
      and keep the chosen ordering across a filter change; verify each ordering and that it
      survives selecting and clearing a store

## 7. Remaining surfaces

- [x] 7.1 Restyle the credential gate as a centred card on the soft green surface, keeping its
      validation and error states; verify a bad credential still reports rejection and a good one
      still enters the app
- [x] 7.2 Restyle the barcode lookup result and the scan overlay, and confirm every
      `classList` show/hide still works against Tailwind's `hidden`; verify a lookup renders its
      detail view and returns to the grid, and that the scan overlay opens and closes
- [x] 7.3 Restyle the footer budget indicator, keeping the cooldown countdown behaviour; verify a
      simulated rate-limit response still shows a counting-down indicator

## 8. End-to-end verification

- [x] 8.1 Run the existing harness suite and confirm it still passes — this change alters markup,
      not cache or pacing logic, so any failure there is a real regression
- [x] 8.2 Drive the real app in a browser and assert the whole redesign at once: grid ≥50% width,
      populated from one request, pin click filters without a request, dark OS preference ignored,
      375px single column with a working map overlay
- [x] 8.3 Capture screenshots at desktop and mobile widths for a visual check, and confirm the
      discount is the most prominent element on a card
- [x] 8.4 Confirm no third-party host is contacted at runtime and that `node_modules/` is absent
      from what would be deployed
