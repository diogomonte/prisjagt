# Prisjagt

See **live clearance prices** in Copenhagen supermarkets (Netto, føtex, Bilka, Salling) on a map.

Pick a store pin, get that store's current anti-food-waste items with the old price, the new
price, the discount and how much is left in stock.

![screenshot placeholder](docs/screenshot.png)

## What this shows (and what it does not)

Two kinds of price, from two different APIs:

- **Clearance prices** (Anti Food Waste API) — per-store, live, browsable from the map. This is
  the main view: pick a store, see everything marked down right now.
- **Regular in-store prices** (Products EAN API) — looked up **one barcode at a time**. There is
  no catalogue search or browse, because the API only answers "what does this EAN cost?".

So Prisjagt is not a general price comparison across supermarkets: you can browse what is
discounted, and you can check any single product by its barcode. The UI states this on every
store panel and next to every looked-up price.

## Running it

There is no build step and no dependencies to install. Any static file server works:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

**You must serve the page over http(s).** Opening `index.html` as a `file://` URL does not work:
browsers block cross-origin requests from file pages whatever CORS headers the API sends, so
every API call fails. Camera scanning likewise needs `https://` or `localhost`.

## Getting an API key

The app runs entirely in your browser, so it uses **your own** free Salling Group key —
no key is committed to this repository and there is no backend.

1. Create a free account at <https://developer.sallinggroup.dev>.
2. Create an app and request these scopes:
   | Scope | Needed for | Required? |
   |---|---|---|
   | **Anti Food Waste** | clearance prices per store | yes |
   | **Stores** | the map pins | yes |
   | **Salling Group Products EAN** | regular price by barcode | optional |
3. **Add your site's origin to the credential's "Origins" field** — for local use
   `http://localhost:8000`, plus your deployed origin (e.g. `https://you.github.io`).
   This is required, not optional: Salling Group only sends `Access-Control-Allow-Origin`
   on successful responses for origins registered on the key. Miss this step and every call
   fails in the browser with a CORS error, even though the same key works fine from `curl`.
4. Copy the app's bearer token and paste it into Prisjagt on first visit.

Without the Products EAN scope the map and clearance browsing work exactly as normal — only
barcode lookups report the missing grant.

The token is kept in your browser's `localStorage` and is only ever sent to
`api.sallinggroup.com`. "Glem min API-nøgle" in the footer deletes it.

## Barcode lookup

Type a barcode into the header field to see that product's regular in-store price.

On browsers with a built-in barcode detector (Chrome, Edge, Android) a **Scan** button also
appears and reads the barcode with the camera. **Safari and Firefox have no such API**, so there
the Scan button is hidden and you type the number printed on the package. This is deliberate:
adding camera scanning to those browsers would mean vendoring a ~1MB barcode library, and this
project keeps its dependency list at one (Leaflet).

Scanning needs a secure context — `https://` or `localhost`.

## How it works

- `index.html` — the whole UI and all styling.
- `app.js` — token gate, store loading, offer loading, rendering. Plain ES5-ish JavaScript,
  no framework, no modules.
- `vendor/` — Leaflet 1.9.4, vendored so there is no CDN dependency.

### Caching

Everything is cached in `localStorage`, because the API's rate limiting is strict (see below):

| Key | Holds | Lifetime |
|---|---|---|
| `sg_stores_v1` | the store list for the map | 24 hours |
| `sg_clear_v1:<storeId>` | that store's clearance offers | 30 minutes |
| `sg_ean_v1:<storeId>:<ean>` | one product's regular price at one store | 7 days |

Cached offers are shown **immediately** and refreshed in the background when older than 30
minutes, so reloading the page costs no requests at all. The panel always shows "Opdateret kl.
HH:MM" so you can see how old a price is, and "Opdatér" forces a fresh fetch. If a background
refresh fails, the saved prices stay on screen rather than vanishing.

Only the fields the interface renders are stored — measured, 311 bytes per offer instead of 607,
so all ~90 Copenhagen stores take about 0.7 MB. When storage fills up, the oldest quarter of that
namespace is dropped; your API key is never evicted.

### Rate limiting (why the app paces itself)

Salling Group's spike protection blocks **by IP address, not by API key** — six requests in about
two seconds was enough to earn
`429 "Your IP (…) has been blocked due to excessive requests. Try again in a minute."` A block
therefore affects everyone sharing that address, not just the person who triggered it.

So Prisjagt sends at most one request at a time, at least 400 ms apart, and coalesces duplicate
in-flight requests. After a 429 it stops sending for a cooldown and shows a countdown in the
footer; cached stores still open normally while it waits. The `retry-after` header is not trusted
— it was observed returning `46443` (12.9 hours) while the body said "a minute" — so the value is
clamped to between 5 and 300 seconds.

## Self-hosting

Push the repository and enable GitHub Pages — `.github/workflows/pages.yml` publishes the files
as-is. Any static host (Netlify, Cloudflare Pages, nginx, a USB stick) works the same way.

## Open source components

- [Leaflet](https://leafletjs.com) — BSD-2-Clause (`vendor/LEAFLET-LICENSE`)
- Map tiles from [OpenStreetMap](https://www.openstreetmap.org/copyright) — ODbL.
  The public tile server has a [usage policy](https://operations.osmfoundation.org/policies/tiles/);
  point `app.js` at your own tile server for heavy traffic.
- Prisjagt itself — MIT (`LICENSE`)

## Licence of the data

The clearance and store data is used under Salling Group's API terms. The **Products EAN API is
licensed for educational, non-commercial use only** — so if you deploy Prisjagt with that scope
enabled, your deployment must be non-commercial too. This constrains the whole app, not just the
barcode feature.

## Disclaimer

Unofficial and unaffiliated with Salling Group. Prices come from their API and may lag reality;
always check the shelf.
