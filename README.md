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

If the site you are visiting already supplies a key, you can skip all of this — paste your own only
if you would rather use your own quota.

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

- `index.html` — the page shell, styled with Tailwind utility classes.
- `app.js` — token gate, store loading, offer loading, rendering. Plain ES5-ish JavaScript,
  no framework, no modules. Most markup is built here.
- `vendor/` — Leaflet 1.9.4 and the generated Tailwind stylesheet, both committed so there is no
  CDN dependency and no build step at deploy time.

### Layout

Products are the subject: the offer grid takes at least half the screen, and the map is a smaller
secondary column used for navigation. On arrival the grid is filled with every nearby store's
offers from a single request; clicking a store pin filters the grid rather than fetching. On
phones the grid is full-screen and the map opens behind the **Kort** button.

The app renders **one light green/white theme**. It deliberately does not follow the operating
system's dark-mode setting.

### Styling (the one build step)

Tailwind is the only thing in this project that needs building, and it never runs at deploy time —
`vendor/tailwind.css` is committed and the published site just serves it.

```sh
npm install       # once
npm run css       # regenerate vendor/tailwind.css
npm run css:watch # while editing
```

Run it **whenever you change a class name**, then commit the regenerated file. Tailwind finds
classes by scanning `index.html` and `app.js` as text, so every class must appear as a complete
literal — a name assembled at runtime (`'text-' + tone`) is invisible to the scanner and will be
missing from the output. The palette lives in `styles/input.css`.

`node_modules/` is git-ignored; `vendor/tailwind.css` is **not**, on purpose.

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

## Deploying to GitHub Pages

The workflow in `.github/workflows/pages.yml` stages `index.html`, `app.js` and `vendor/` into a
publish directory and uploads only those — planning docs, the dev server and `node_modules/` are
never published. No build runs at deploy time; the committed `vendor/tailwind.css` is served as-is.

Three things must be set up by hand, because none of them lives in the repository:

1. **Register the site's origin on your API key.** In the Salling Group portal, add your Pages
   origin (e.g. `https://you.github.io`) under **Origins** on the credential. Without this every
   request fails in the browser with a CORS error while the same key works fine from `curl` —
   Salling only sends `Access-Control-Allow-Origin` on *successful* responses for registered
   origins.
2. **Add the key as a repository secret** named `SALLING_API_KEY`
   (Settings → Secrets and variables → Actions). The deploy injects it into the published page so
   visitors need no key of their own. If the secret is missing or the injection marker has been
   removed from `index.html`, the deploy **fails loudly** rather than publishing a site that
   silently asks every visitor for a key.
3. **Set Settings → Pages → Source to "GitHub Actions"**, or the workflow deploys nothing.

Any other static host works the same way — serve the same three paths and inject the key yourself.

### The deployed key is public

> A key injected into a static site **cannot be kept secret**. The GitHub secret keeps it out of
> the repository and the build log; it does not keep it out of the HTML and JavaScript that are
> served. Anyone can open DevTools and read it.

Restricting the key to your origin stops *other websites* using it in a browser. It is a browser
mechanism and nothing more — a direct HTTP client such as `curl` ignores CORS entirely, so the key
remains usable by anyone who copies it. Salling Group may revoke a key that is abused.

This is the deliberate trade for visitors not needing their own account. If you would rather not
make that trade, leave `SALLING_API_KEY` unset: the deploy then fails, and you can remove the
injection step so every visitor supplies their own key instead.

### Which key gets used

| Situation | Key used |
|---|---|
| Visitor has pasted their own | **Theirs** — their own quota |
| Visitor has pasted nothing | The site's injected key |
| Visitor clicks "Glem min API-nøgle" | Falls back to the site's key, or the gate if there is none |
| The site's key is rejected | The gate appears, explaining the site's key is not working |

## Open source components

- [Leaflet](https://leafletjs.com) — BSD-2-Clause (`vendor/LEAFLET-LICENSE`)
- [Tailwind CSS](https://tailwindcss.com) — MIT, used as a build-time tool only
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
