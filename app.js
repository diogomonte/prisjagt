/* Prisjagt - live clearance prices from Salling Group on a map of Copenhagen.
   No build step, no dependencies beyond the vendored Leaflet. */
(function () {
  'use strict';

  // Talks straight to the API in production. dev-server.py sets
  // window.PRISJAGT_API = '/api' so local work does not need the origin
  // registered on the key first.
  var API = window.PRISJAGT_API || 'https://api.sallinggroup.com';
  var CPH = [55.6761, 12.5683];
  var RADIUS_KM = 10;
  var PER_PAGE = 100;
  var TOKEN_KEY = 'sg_token';
  var STORES_KEY = 'sg_stores_v1';
  var BRANDS = {
    netto: '#ffd400',
    foetex: '#004b93',
    bilka: '#0a4fa1',
    salling: '#8c1d40'
  };

  var el = function (id) { return document.getElementById(id); };
  var map = null;
  var markers = null;
  var offerCache = new Map();
  var allOffers = [];          // flat model: every loaded offer, store attached
  var storeById = {};
  var storeFilter = null;      // store id, or null for "everything nearby"
  var sortMode = 'discount';
  var selected = null;        // id of the store whose panel is open
  var selectedStore = null;   // the store object itself, for lookups

  /* ---------- API ---------- */

  // A deployment may inject a credential so visitors need none of their own.
  // It is suppressed for the session once rejected, otherwise clearing storage
  // would fall straight back to the same bad key and loop.
  var injectedRejected = false;
  var TOKEN_PLACEHOLDER = 'PRISJAGT_TOKEN_NOT_SET';

  function injectedToken() {
    if (injectedRejected) return null;
    var value = typeof window !== 'undefined' ? window.PRISJAGT_TOKEN : null;
    if (typeof value !== 'string' || !value) return null;
    // Guard against a deploy that wrote the marker through unsubstituted.
    return value === TOKEN_PLACEHOLDER ? null : value;
  }

  function storedToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  // The visitor's own credential wins, so they can use their own quota.
  function token() {
    return storedToken() || injectedToken();
  }

  /* ---------- request pacing ---------- */

  // Salling Group blocks by IP after a short burst - six requests in about two
  // seconds was enough - and such a block hits every user behind that address.
  // So everything funnels through one queue: one request in flight, spaced, and
  // identical concurrent requests share a single response.
  var MIN_GAP = 400;
  var COOLDOWN_MIN = 5000;
  var COOLDOWN_MAX = 300000;
  var COOLDOWN_DEFAULT = 60000;

  var queue = [];
  var inFlight = new Map();
  var sending = false;
  var lastStart = 0;
  var cooldownUntil = 0;
  var onBudgetChange = null;

  function now() { return Date.now(); }

  function cooldownRemaining() {
    return Math.max(0, cooldownUntil - now());
  }

  function budgetChanged() {
    if (onBudgetChange) onBudgetChange();
  }

  function cooldownError() {
    var err = new Error('For mange forespørgsler');
    err.statusCode = 429;
    err.cooldown = Math.ceil(cooldownRemaining() / 1000);
    return err;
  }

  // The API advertised retry-after: 46443 (12.9 hours) while its body said "try
  // again in a minute", so the header is clamped rather than trusted.
  function cooldownDelay(res) {
    var header = res && res.headers && res.headers.get ? res.headers.get('retry-after') : null;
    var seconds = header === null || header === undefined || header === '' ? NaN : Number(header);
    if (!isFinite(seconds) || seconds <= 0) return COOLDOWN_DEFAULT;
    return Math.min(COOLDOWN_MAX, Math.max(COOLDOWN_MIN, seconds * 1000));
  }

  function pump() {
    if (sending || !queue.length) return;

    if (cooldownRemaining() > 0) {
      // Fail fast rather than queueing behind the gate: releasing a held queue
      // all at once is the burst we are trying to avoid.
      var blocked = queue.splice(0, queue.length);
      blocked.forEach(function (job) { job.reject(cooldownError()); });
      return;
    }

    var wait = Math.max(0, lastStart + MIN_GAP - now());
    if (wait > 0) {
      setTimeout(pump, wait);
      return;
    }

    var next = queue.shift();
    sending = true;
    lastStart = now();
    rawFetch(next.path, next.token).then(function (value) {
      sending = false;
      next.resolve(value);
      pump();
    }, function (err) {
      sending = false;
      next.reject(err);
      pump();
    });
  }

  function rawFetch(path, overrideToken) {
    var t = overrideToken || token();
    return fetch(API + path, { headers: { Authorization: 'Bearer ' + t } })
      .then(function (res) {
        return res.text().then(function (body) {
          var json = null;
          try { json = body ? JSON.parse(body) : null; } catch (e) { /* non-JSON */ }
          if (res.ok) return json;
          var err = new Error(
            (json && (json.error || json.errorMessage)) || ('HTTP ' + res.status));
          err.statusCode = res.status;
          if (res.status === 429) {
            cooldownUntil = now() + cooldownDelay(res);
            err.cooldown = Math.ceil(cooldownRemaining() / 1000);
            budgetChanged();
          }
          throw err;
        });
      });
  }

  function sgFetch(path, overrideToken) {
    if (cooldownRemaining() > 0) return Promise.reject(cooldownError());

    // Coalesce only unauthenticated-by-default calls on the same path; a call
    // with an explicit token is a credential check and must not be shared.
    if (!overrideToken && inFlight.has(path)) return inFlight.get(path);

    var pending = new Promise(function (resolve, reject) {
      queue.push({ path: path, token: overrideToken, resolve: resolve, reject: reject });
      pump();
    });

    if (!overrideToken) {
      var settle = function () { inFlight.delete(path); };
      inFlight.set(path, pending);
      pending.then(settle, settle);
    }
    return pending;
  }

  function describe(err) {
    if (err && err.statusCode === 429) {
      return 'For mange forespørgsler lige nu. Prøv igen om et øjeblik.';
    }
    if (err && err.statusCode) return 'Fejl ' + err.statusCode + ': ' + err.message;
    // Browsers block cross-origin fetch from a file:// page regardless of the
    // API's CORS headers, so say so instead of blaming the connection.
    if (location.protocol === 'file:') {
      return 'Siden skal vises via en webserver, ikke som en lokal fil. ' +
        'Kør fx "python3 -m http.server 8000" i mappen og åbn http://localhost:8000.';
    }
    // Salling Group only returns CORS headers on successful responses for
    // origins registered on the API key, so an unregistered origin fails here
    // with no status code at all. That is by far the most common cause.
    return 'Browseren kunne ikke læse svaret fra Salling Groups API. ' +
      'Tilføj "' + location.origin + '" under Origins på din API-nøgle på ' +
      'developer.sallinggroup.dev — ellers sender de ikke CORS-headere. ' +
      'Tjek også internetforbindelse og annonceblokker.';
  }

  /* ---------- cache ---------- */

  var EAN_PREFIX = 'sg_ean_v1:';
  var CLEAR_PREFIX = 'sg_clear_v1:';
  var TTL = {
    stores: 24 * 60 * 60 * 1000,        // locations barely move
    clearances: 30 * 60 * 1000,         // stock shifts during the day
    ean: 7 * 24 * 60 * 60 * 1000        // regular prices move slowly
  };

  // Returns { data, age, stale } so callers can tell "nothing cached" from
  // "cached but old" - the latter is still worth rendering while it refreshes.
  // `legacyField` lets a namespace that predates this helper keep its entries:
  // the store list used to be written as { at, stores: [...] }.
  function cacheGet(key, ttl, legacyField) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var hit = JSON.parse(raw);
      if (!hit || typeof hit.at !== 'number') return null;
      if ((hit.data === undefined || hit.data === null) &&
          legacyField && hit[legacyField] !== undefined && hit[legacyField] !== null) {
        hit = { at: hit.at, data: hit[legacyField] };
      }
      if (hit.data === undefined || hit.data === null) return null;
      var age = Date.now() - hit.at;
      return { data: hit.data, age: age, at: hit.at, stale: age > ttl };
    } catch (e) {
      return null;
    }
  }

  function cacheEntries(prefix) {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key || key.indexOf(prefix) !== 0) continue;
        var at = 0;
        try {
          var parsed = JSON.parse(localStorage.getItem(key));
          at = (parsed && typeof parsed.at === 'number') ? parsed.at : 0;
        } catch (e) { /* unparseable - evict first */ }
        out.push({ key: key, at: at });
      }
    } catch (e) { /* storage unavailable */ }
    return out;
  }

  // Frees room when localStorage is full: drops the oldest quarter of one
  // namespace (unparseable entries count as oldest). Credentials are never
  // eviction candidates - only prefixed cache keys are considered.
  function evictOldest(prefix) {
    var entries = cacheEntries(prefix);
    if (!entries.length) return 0;
    entries.sort(function (a, b) { return a.at - b.at; });
    var drop = Math.max(1, Math.ceil(entries.length * 0.25));
    var removed = 0;
    for (var i = 0; i < drop; i++) {
      try {
        localStorage.removeItem(entries[i].key);
        removed++;
      } catch (e) { /* ignore */ }
    }
    return removed;
  }

  function cachePut(key, data, evictPrefix) {
    var payload = JSON.stringify({ at: Date.now(), data: data });
    try {
      localStorage.setItem(key, payload);
      return true;
    } catch (e) {
      if (evictPrefix) evictOldest(evictPrefix);
      try {
        localStorage.setItem(key, payload);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  function cacheDrop(prefix) {
    var entries = cacheEntries(prefix);
    var removed = 0;
    for (var i = 0; i < entries.length; i++) {
      try {
        localStorage.removeItem(entries[i].key);
        removed++;
      } catch (e) { /* ignore */ }
    }
    return removed;
  }

  /* ---------- clearance cache ---------- */

  function clearKey(storeId) { return CLEAR_PREFIX + storeId; }

  // Stores only what the UI renders: 290 bytes per row instead of 639, which
  // is what keeps a whole city inside the storage budget. Dropped on purpose:
  // categories (both languages), lastUpdate, startTime, endTime, currency, and
  // discount (derivable from the two prices). Nothing here is rendered.
  function trimClearances(data) {
    var rows = (data && data.clearances) || [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var offer = rows[i].offer || {};
      var product = rows[i].product || {};
      out.push({
        offer: {
          newPrice: offer.newPrice,
          originalPrice: offer.originalPrice,
          percentDiscount: offer.percentDiscount,
          stock: offer.stock,
          stockUnit: offer.stockUnit
        },
        product: {
          description: product.description,
          ean: product.ean,
          image: product.image
        }
      });
    }
    return { clearances: out };
  }

  function cachedClearances(storeId) {
    return cacheGet(clearKey(storeId), TTL.clearances);
  }

  function storeClearances(storeId, data) {
    return cachePut(clearKey(storeId), trimClearances(data), CLEAR_PREFIX);
  }

  /* ---------- EAN price lookup ---------- */

  function cleanEan(input) {
    return String(input == null ? '' : input).replace(/\s+/g, '');
  }

  function validEan(input) {
    var digits = cleanEan(input);
    if (!/^[0-9]+$/.test(digits)) return false;
    var n = digits.length;
    return n === 8 || n === 12 || n === 13 || n === 14;
  }

  // Prices differ between stores, so the key must carry both. Without the
  // storeId one store's price would be served as another's.
  function eanCacheKey(storeId, ean) {
    return EAN_PREFIX + storeId + ':' + ean;
  }

  function eanCacheGet(storeId, ean) {
    var hit = cacheGet(eanCacheKey(storeId, ean), TTL.ean);
    return hit && !hit.stale ? hit.data : null;
  }

  function eanCacheSet(storeId, ean, data) {
    return cachePut(eanCacheKey(storeId, ean), data, EAN_PREFIX);
  }

  var eanInFlight = new Map();

  // GET /v2/products/{ean} returns, per the published schema:
  //   { "instore": { "description": "TP-LINK",      // brand
  //                  "name": "TL-WA850RE",          // product
  //                  "ean": "6935364070199",
  //                  "price": 13.95,
  //                  "unit": "l", "unitPrice": 13.95,
  //                  "contents": 1, "contentsUnit": "l",
  //                  "deposit": { "price": 3, "text": "+ PANT" },
  //                  "campaign": { ... } },
  //     "webshop": null }
  // Either side may be null. There is no image field, so looked-up products
  // render without a picture. Error bodies carry `errorMessage`, not `error`.

  function isNumeric(v) {
    return typeof v === 'number'
      ? isFinite(v)
      : (typeof v === 'string' && /^[0-9]+([.,][0-9]+)?$/.test(v.trim()));
  }

  function toNumber(v) {
    return typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  }

  function normalizeProduct(raw, ean) {
    var body = (raw && typeof raw === 'object' && raw.instore && typeof raw.instore === 'object')
      ? raw.instore
      : null;

    if (!body) {
      return { ean: ean, name: null, price: null, image: null, available: false };
    }

    // `description` is the brand and `name` the product; show both when present.
    var label = [body.description, body.name]
      .filter(function (part) { return typeof part === 'string' && part.trim(); })
      .join(' ')
      .trim();

    return {
      ean: body.ean || ean,
      name: label || null,
      price: isNumeric(body.price) ? toNumber(body.price) : null,
      image: null,
      available: true
    };
  }

  // Resolves an EAN at one store to {ean, name, price, image, available};
  // price is null when the store has no numeric price for it. Rejects with an
  // Error carrying statusCode, plus notFound:true for a 404, invalidEan:true
  // for unusable input and noStore:true when no store was given.
  function lookupEan(input, storeId) {
    if (!storeId) {
      var noStore = new Error('Ingen butik valgt');
      noStore.noStore = true;
      return Promise.reject(noStore);
    }

    var ean = cleanEan(input);
    if (!validEan(ean)) {
      var bad = new Error('Ugyldig stregkode');
      bad.invalidEan = true;
      return Promise.reject(bad);
    }

    var cached = eanCacheGet(storeId, ean);
    if (cached) return Promise.resolve(cached);

    var flightKey = storeId + ':' + ean;
    if (eanInFlight.has(flightKey)) return eanInFlight.get(flightKey);

    var pending = sgFetch('/v2/products/' + encodeURIComponent(ean) +
        '?storeId=' + encodeURIComponent(storeId))
      .then(function (raw) {
        var product = normalizeProduct(raw, ean);
        eanCacheSet(storeId, ean, product);
        return product;
      })
      .catch(function (err) {
        if (err.statusCode === 404) err.notFound = true;
        throw err;
      });

    // Keep the entry only while the request is open, so a failure is retryable.
    pending = pending.then(function (v) {
      eanInFlight.delete(flightKey);
      return v;
    }, function (e) {
      eanInFlight.delete(flightKey);
      throw e;
    });

    eanInFlight.set(flightKey, pending);
    return pending;
  }

  function describeLookup(err) {
    if (!err) return 'Ukendt fejl.';
    if (err.noStore) return 'Vælg først en butik på kortet.';
    if (err.invalidEan) return 'Stregkoden skal være 8, 12, 13 eller 14 cifre.';
    // A 404 cannot distinguish "no such barcode" from "this store does not
    // carry it", so the message must stay scoped to the store.
    if (err.notFound) return 'Varen blev ikke fundet i denne butik.';
    if (err.statusCode === 403) return 'FORBIDDEN';
    return describe(err);
  }

  /* ---------- token gate ---------- */

  function showGate(message, isError) {
    el('gate').classList.remove('hidden');
    el('gate').classList.add('flex');
    ['app-head', 'layout', 'app-foot'].forEach(function (id) {
      el(id).classList.add('hidden');
    });
    if (message) {
      var m = el('gate-msg');
      m.textContent = message;
      m.className = 'mt-3 text-sm ' + (isError ? 'font-medium text-deal' : 'text-muted');
    }
  }

  function showApp() {
    el('gate').classList.add('hidden');
    el('gate').classList.remove('flex');
    ['app-head', 'layout', 'app-foot'].forEach(function (id) {
      el(id).classList.remove('hidden');
    });
    el('app-foot').classList.add('flex');
  }

  function clearCredentialState() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(STORES_KEY);
    } catch (e) { /* ignore */ }
    cacheDrop(CLEAR_PREFIX);
    cacheDrop(EAN_PREFIX);
    offerCache.clear();
    allOffers = [];
  }

  // Called when a credential is rejected. If the rejected one was injected by
  // the deployment, suppress it for the session so the gate is reachable.
  function forgetToken(message) {
    var wasInjected = !storedToken() && !!injectedToken();
    clearCredentialState();
    if (wasInjected) {
      // The caller's generic "your key is invalid" would be misleading: the
      // visitor never supplied one. Name the site's key as the problem.
      injectedRejected = true;
      showGate('Sidens egen API-nøgle virker ikke lige nu. ' +
        'Indsæt din egen nøgle for at fortsætte.', true);
      return;
    }
    showGate(message || 'Nøglen er slettet fra din browser.', false);
  }

  // Called when the visitor discards their own key. Falls back to the site's
  // key when there is one, rather than forcing them to supply another.
  function discardOwnToken() {
    clearCredentialState();
    if (injectedToken()) {
      showApp();
      boot(true);
      return;
    }
    showGate('Nøglen er slettet fra din browser.', false);
  }

  function saveToken(ev) {
    ev.preventDefault();
    var value = el('gate-input').value.trim();
    if (!value) return;
    var btn = el('gate-save');
    btn.disabled = true;
    showGate('Tjekker nøglen…', false);
    sgFetch('/v2/stores?per_page=1', value)
      .then(function () {
        try { localStorage.setItem(TOKEN_KEY, value); } catch (e) { /* ignore */ }
        el('gate-input').value = '';
        btn.disabled = false;
        showApp();
        boot();
      })
      .catch(function (err) {
        btn.disabled = false;
        if (err.statusCode === 401 || err.statusCode === 403) {
          showGate('Nøglen blev afvist. Tjek at appen har adgang til Anti Food Waste og Stores.', true);
        } else {
          showGate(describe(err), true);
        }
      });
  }

  /* ---------- stores ---------- */

  function cachedStores() {
    var hit = cacheGet(STORES_KEY, TTL.stores, 'stores');
    if (!hit || hit.stale || !Array.isArray(hit.data)) return null;
    return hit.data;
  }

  function usable(store) {
    var c = store && store.coordinates;
    return !!(store && store.id && Array.isArray(c) && c.length === 2 &&
      isFinite(c[0]) && isFinite(c[1]) && BRANDS[store.brand]);
  }

  function fetchStores() {
    var all = [];
    function page(n) {
      var q = '/v2/stores?geo=' + CPH[0] + ',' + CPH[1] +
        '&radius=' + RADIUS_KM + '&per_page=' + PER_PAGE + '&page=' + n;
      return sgFetch(q).then(function (batch) {
        if (!Array.isArray(batch)) return all;
        all = all.concat(batch.filter(usable));
        if (batch.length < PER_PAGE || n >= 20) return all;
        return page(n + 1);
      });
    }
    return page(1).then(function (stores) {
      cachePut(STORES_KEY, stores, CLEAR_PREFIX);
      return stores;
    });
  }

  /* ---------- map ---------- */

  function initMap() {
    if (map) return;
    map = L.map('map', { zoomControl: true }).setView(CPH, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragydere'
    }).addTo(map);
    markers = L.layerGroup().addTo(map);
  }

  function drawStores(stores) {
    markers.clearLayers();
    stores.forEach(function (store) {
      storeById[store.id] = store;
      // Salling returns coordinates as [longitude, latitude].
      var m = L.circleMarker([store.coordinates[1], store.coordinates[0]], {
        radius: 7,
        weight: 2,
        color: '#333',
        fillColor: BRANDS[store.brand],
        fillOpacity: 0.95
      });
      m.bindTooltip(store.name || store.brand);
      m.on('click', function () {
        selectStore(store);
        if (!el('map-overlay').classList.contains('hidden')) closeMapOverlay();
      });
      m.addTo(markers);
    });
  }

  function locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function (pos) {
      map.setView([pos.coords.latitude, pos.coords.longitude], 14);
    }, function () { /* denied or unavailable - ignore */ });
  }

  /* ---------- offers ---------- */

  function kr(n) {
    return Number(n).toFixed(2).replace('.', ',') + ' kr.';
  }

  function panelHead(store, extra) {
    var addr = store.address || {};
    var line = [addr.street, [addr.zip, addr.city].filter(Boolean).join(' ')]
      .filter(Boolean).join(', ');
    var head = document.createElement('div');
    head.className = 'mb-3';

    var h = document.createElement('h2');
    h.className = 'text-lg font-bold text-ink';
    h.textContent = store.name || store.brand;
    head.appendChild(h);

    if (line) {
      var a = document.createElement('p');
      a.className = 'text-sm text-muted';
      a.textContent = line;
      head.appendChild(a);
    }
    if (extra) head.appendChild(extra);
    return head;
  }

  var CARD = 'group relative flex h-full flex-col overflow-hidden rounded-xl border ' +
    'border-brand-line bg-white shadow-sm transition hover:shadow-md';

  function offerCard(item) {
    var offer = item.offer || {};
    var product = item.product || {};
    var storeId = item.storeId;
    var store = storeById[storeId];

    var card = document.createElement('article');
    card.className = CARD;

    var pct = offer.percentDiscount
      ? '-' + Math.round(offer.percentDiscount) + '%'
      : null;

    // The image block is only drawn when there is an image; otherwise an empty
    // square would dominate the card. The badge then moves inline.
    if (product.image) {
      var figure = document.createElement('div');
      figure.className = 'relative h-36 shrink-0 bg-brand-wash';
      var img = document.createElement('img');
      img.src = product.image;
      img.alt = '';
      img.loading = 'lazy';
      img.className = 'h-full w-full object-contain p-2';
      img.onerror = function () {
        img.remove();
        figure.className = 'relative h-8 shrink-0 bg-brand-wash';  // collapse, keep badge
      };
      figure.appendChild(img);
      if (pct) {
        var badge = document.createElement('span');
        badge.className = 'absolute right-2 top-2 rounded-full bg-deal px-2 py-0.5 ' +
          'text-xs font-bold text-white shadow';
        badge.textContent = pct;
        figure.appendChild(badge);
      }
      card.appendChild(figure);
    }

    var body = document.createElement('div');
    body.className = 'flex flex-1 flex-col gap-1 p-3';

    var head = document.createElement('div');
    head.className = 'flex items-start justify-between gap-2';
    var name = document.createElement('h3');
    name.className = 'line-clamp-2 text-sm font-semibold text-ink';
    name.textContent = product.description || 'Ukendt vare';
    head.appendChild(name);
    if (pct && !product.image) {
      var inlineBadge = document.createElement('span');
      inlineBadge.className = 'shrink-0 rounded-full bg-deal px-2 py-0.5 text-xs ' +
        'font-bold text-white';
      inlineBadge.textContent = pct;
      head.appendChild(inlineBadge);
    }
    body.appendChild(head);

    var prices = document.createElement('div');
    prices.className = 'mt-auto flex items-baseline gap-2';
    var now = document.createElement('span');
    now.className = 'text-xl font-bold text-brand';
    now.textContent = kr(offer.newPrice);
    prices.appendChild(now);
    if (offer.originalPrice > offer.newPrice) {
      var was = document.createElement('span');
      was.className = 'text-sm text-muted line-through';
      was.textContent = kr(offer.originalPrice);
      prices.appendChild(was);
    }
    body.appendChild(prices);

    var meta = document.createElement('p');
    meta.className = 'text-xs text-muted';
    var bits = [];
    if (store) bits.push(store.name || store.brand);
    if (offer.stock) bits.push(offer.stock + ' ' + (offer.stockUnit === 'kg' ? 'kg' : 'stk.'));
    meta.textContent = bits.join(' · ');
    body.appendChild(meta);

    if (product.ean && validEan(product.ean) && storeId) {
      var compare = document.createElement('button');
      compare.type = 'button';
      compare.className = 'self-start text-xs font-medium text-brand underline hover:text-brand-dark';
      compare.textContent = 'tjek normalpris';
      compare.onclick = function () {
        compare.disabled = true;
        compare.textContent = 'henter…';
        lookupEan(product.ean, storeId)
          .then(function (found) {
            compare.remove();
            body.appendChild(regularPriceLine(found, offer));
          })
          .catch(function (err) {
            if (err.statusCode === 401) {
              forgetToken('Nøglen er ikke længere gyldig. Indsæt en ny.');
              return;
            }
            compare.disabled = false;
            compare.textContent = 'tjek normalpris';
            var msg = document.createElement('p');
            msg.className = 'text-xs font-medium text-deal';
            msg.textContent = err.statusCode === 403
              ? 'API-nøglen mangler adgang til Products EAN.'
              : describeLookup(err);
            body.appendChild(msg);
          });
      };
      body.appendChild(compare);
    }

    card.appendChild(body);
    return card;
  }

  // Shows the catalogue's regular price next to a clearance offer, and flags
  // the case where the offer's reported originalPrice disagrees with it.
  function regularPriceLine(found, offer) {
    var line = document.createElement('p');
    line.className = 'text-xs';
    if (found.price === null) {
      line.className = 'text-xs text-muted';
      line.textContent = 'Normalpris ikke tilgængelig';
      return line;
    }

    var reported = Number(offer.originalPrice);
    var disagrees = isFinite(reported) && Math.abs(reported - found.price) > 1;
    if (disagrees) {
      line.className = 'text-xs font-semibold text-deal';
      line.textContent = 'Normalpris ' + kr(found.price) +
        ' — tilbuddet oplyser ' + kr(reported);
    } else {
      line.textContent = 'Normalpris ' + kr(found.price);
    }
    return line;
  }

  function clockTime(ms) {
    var d = new Date(ms);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ---------- the offer grid ---------- */

  // One flat list of every loaded offer keeps filtering by store, sorting
  // across stores and labelling each card with its store trivial; the nested
  // per-store response makes each of those a special case.
  function mergeOffers(storeId, data) {
    var rows = (data && data.clearances) || [];
    allOffers = allOffers.filter(function (o) { return o.storeId !== storeId; });
    for (var i = 0; i < rows.length; i++) {
      allOffers.push({ storeId: storeId, offer: rows[i].offer, product: rows[i].product });
    }
  }

  function sortedOffers(list) {
    var copy = list.slice();
    if (sortMode === 'price') {
      copy.sort(function (a, b) { return (a.offer.newPrice || 0) - (b.offer.newPrice || 0); });
    } else if (sortMode === 'name') {
      copy.sort(function (a, b) {
        return String(a.product.description || '').localeCompare(String(b.product.description || ''), 'da');
      });
    } else {
      copy.sort(function (a, b) {
        return (b.offer.percentDiscount || 0) - (a.offer.percentDiscount || 0);
      });
    }
    return copy;
  }

  function visibleOffers() {
    if (!storeFilter) return sortedOffers(allOffers);
    return sortedOffers(allOffers.filter(function (o) { return o.storeId === storeFilter; }));
  }

  function renderFilterChip() {
    var chip = el('filter-chip');
    if (!storeFilter) {
      chip.classList.add('hidden');
      chip.classList.remove('inline-flex');
      chip.textContent = '';
      return;
    }
    var store = storeById[storeFilter] || {};
    chip.textContent = '';
    chip.classList.remove('hidden');
    chip.classList.add('inline-flex');
    var label = document.createElement('span');
    label.textContent = storeLabel(store);
    chip.appendChild(label);
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.setAttribute('aria-label', 'Ryd filter');
    clear.className = 'font-bold text-brand hover:text-brand-dark';
    clear.textContent = '×';
    clear.onclick = function () { setStoreFilter(null); };
    chip.appendChild(clear);
  }

  function setStoreFilter(storeId) {
    storeFilter = storeId || null;
    selected = storeFilter;
    renderGrid();
  }

  function gridNote(text, tone) {
    var p = document.createElement('p');
    // Not a grid child: auto-rows-fr would give a one-line note a full row.
    p.className = 'mb-3 text-sm ' + (tone === 'err' ? 'font-medium text-deal' : 'text-muted');
    p.textContent = text;
    return p;
  }

  function renderGrid(meta) {
    meta = meta || {};
    var products = el('products');
    products.textContent = '';
    renderFilterChip();

    var items = visibleOffers();
    el('offer-count').textContent = items.length
      ? items.length + ' nedsatte varer' + (storeFilter ? ' i denne butik' : ' i nærheden')
      : '';

    if (meta.at) {
      products.appendChild(gridNote('Opdateret kl. ' + clockTime(meta.at) +
        (meta.refreshing ? ' · opdaterer…' : '')));
    }
    if (meta.refreshError) {
      products.appendChild(gridNote('Kunne ikke opdatere — viser gemte priser. ' + meta.refreshError, 'err'));
    }

    if (!items.length) {
      products.appendChild(gridNote(storeFilter
        ? 'Ingen nedsatte varer i denne butik lige nu.'
        : 'Ingen nedsatte varer i nærheden lige nu.'));
      return;
    }

    var grid = document.createElement('div');
    grid.className = 'grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4';
    for (var i = 0; i < items.length; i++) grid.appendChild(offerCard(items[i]));
    products.appendChild(grid);
  }

  function panelMessage(node) {
    var panel = el('products');
    panel.textContent = '';
    panel.appendChild(node);
  }

  function panelError(message, retry) {
    var wrap = document.createElement('div');
    var p = document.createElement('p');
    p.className = 'text-sm font-medium text-deal';
    p.textContent = message;
    wrap.appendChild(p);
    if (retry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mt-2 rounded-lg border border-brand-line px-3 py-1.5 text-sm hover:border-brand';
      btn.textContent = 'Prøv igen';
      btn.onclick = retry;
      wrap.appendChild(btn);
    }
    panelMessage(wrap);
  }

  function fetchClearances(store) {
    return sgFetch('/v1/food-waste/' + encodeURIComponent(store.id))
      .then(function (data) {
        var trimmed = trimClearances(data);
        storeClearances(store.id, data);
        offerCache.set(store.id, { data: trimmed, at: now() });
        mergeOffers(store.id, trimmed);
        return trimmed;
      });
  }

  // One request returns every nearby store's offers. Filling the same grid
  // store-by-store would be ~16 requests, which is both slower to display and
  // the burst pattern the API blocks by IP.
  function fetchNearbyOffers() {
    return sgFetch('/v1/food-waste/?geo=' + CPH[0] + ',' + CPH[1] + '&radius=' + RADIUS_KM)
      .then(function (data) {
        var entries = Array.isArray(data) ? data : [];
        for (var i = 0; i < entries.length; i++) {
          var store = entries[i].store || {};
          if (!store.id) continue;
          var trimmed = trimClearances(entries[i]);
          // Write through the per-store cache so a later single-store refresh
          // stays consistent with what the grid shows.
          storeClearances(store.id, entries[i]);
          offerCache.set(store.id, { data: trimmed, at: now() });
          if (!storeById[store.id]) storeById[store.id] = store;
          mergeOffers(store.id, trimmed);
        }
        return entries.length;
      });
  }

  // Everything nearby is already loaded, so selecting a store is a filter over
  // the model - no request at all. A store outside the bulk set is fetched on
  // demand, through the same cache.
  function selectStore(store, force) {
    selectedStore = store;
    storeById[store.id] = store;

    var known = allOffers.some(function (o) { return o.storeId === store.id; });
    var cached = offerCache.get(store.id);
    if (!force && (known || cached)) {
      if (!known && cached) mergeOffers(store.id, cached.data);
      setStoreFilter(store.id);
      return;
    }

    storeFilter = store.id;
    selected = store.id;
    renderFilterChip();
    panelMessage(gridNote('Henter nedsatte varer…'));

    fetchClearances(store)
      .then(function () {
        if (storeFilter === store.id) renderGrid({ at: now() });
      })
      .catch(function (err) {
        if (err.statusCode === 401) { forgetToken('Nøglen er ikke længere gyldig. Indsæt en ny.'); return; }
        if (storeFilter !== store.id) return;
        if (err.statusCode === 404) {
          var empty = { clearances: [] };
          storeClearances(store.id, empty);
          offerCache.set(store.id, { data: empty, at: now() });
          mergeOffers(store.id, empty);
          renderGrid({ at: now() });
          return;
        }
        panelError(describe(err), function () { selectStore(store, true); });
      });
  }

  /* ---------- EAN lookup UI ---------- */

  var PORTAL = 'https://developer.sallinggroup.dev';

  function storeLabel(store) {
    if (!store) return '';
    var addr = store.address || {};
    return [store.name || store.brand, addr.street].filter(Boolean).join(', ');
  }

  function priceNote() {
    var note = document.createElement('p');
    note.className = 'mt-3 text-xs text-muted';
    note.textContent = 'Normalpris i fysiske butikker fra Salling Groups API. ' +
      'Priser kan afvige fra hylden. Data stilles til rådighed til undervisningsbrug ' +
      'og ikke-kommerciel brug.';
    return note;
  }

  function scopeHelp() {
    var wrap = document.createElement('p');
    wrap.className = 'text-sm font-medium text-deal';
    wrap.appendChild(document.createTextNode(
      'Din API-nøgle mangler adgang til Products EAN. Anmod om adgang på '));
    var link = document.createElement('a');
    link.className = 'underline';
    link.href = PORTAL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'developer.sallinggroup.dev';
    wrap.appendChild(link);
    wrap.appendChild(document.createTextNode('. Kortet og nedsatte varer virker fortsat.'));
    return wrap;
  }

  function renderProduct(product, store) {
    var products = el('products');
    products.textContent = '';

    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'mb-3 text-sm font-medium text-brand underline hover:text-brand-dark';
    back.textContent = '← Tilbage til tilbud';
    back.onclick = function () { renderGrid(); };
    products.appendChild(back);

    var card = document.createElement('article');
    card.className = 'max-w-md rounded-xl border border-brand-line bg-white p-5 shadow-sm';

    var h = document.createElement('h2');
    h.className = 'text-lg font-bold text-ink';
    h.textContent = product.name || 'Ukendt vare';
    card.appendChild(h);

    var ean = document.createElement('p');
    ean.className = 'text-sm tabular-nums text-muted';
    ean.textContent = 'EAN ' + product.ean;
    card.appendChild(ean);

    var where = document.createElement('p');
    where.className = 'text-sm text-muted';
    where.textContent = 'Pris i ' + storeLabel(store);
    card.appendChild(where);

    var price = document.createElement('p');
    if (product.available === false) {
      price.className = 'mt-3 text-muted';
      price.textContent = 'Varen findes ikke i de fysiske butikker.';
    } else if (product.price === null) {
      price.className = 'mt-3 text-muted';
      price.textContent = 'Pris ikke tilgængelig';
    } else {
      price.className = 'mt-3 text-3xl font-bold text-brand';
      price.textContent = kr(product.price);
    }
    card.appendChild(price);

    card.appendChild(priceNote());
    products.appendChild(card);
  }

  function renderLookupError(err, retry) {
    if (err && err.statusCode === 401) {
      forgetToken('Nøglen er ikke længere gyldig. Indsæt en ny.');
      return;
    }
    if (err && err.statusCode === 403) {
      panelMessage(scopeHelp());
      return;
    }
    if (err && err.noStore) {
      var ask = document.createElement('p');
      ask.className = 'text-sm text-muted';
      ask.textContent = describeLookup(err);
      panelMessage(ask);
      return;
    }
    if (err && (err.invalidEan || err.notFound)) {
      var p = document.createElement('p');
      p.className = 'text-sm font-medium text-deal';
      p.textContent = describeLookup(err);
      panelMessage(p);
      return;
    }
    panelError(describeLookup(err), retry);
  }

  function runLookup(value) {
    var store = selectedStore;
    if (!store) {
      renderLookupError({ noStore: true });
      return;
    }

    var ean = cleanEan(value);
    if (!validEan(ean)) {
      renderLookupError({ invalidEan: true });
      return;
    }

    var loading = document.createElement('p');
    loading.className = 'text-sm text-muted';
    loading.textContent = 'Slår ' + ean + ' op i ' + storeLabel(store) + '…';
    panelMessage(loading);

    lookupEan(ean, store.id)
      .then(function (product) { renderProduct(product, store); })
      .catch(function (err) {
        renderLookupError(err, function () { runLookup(ean); });
      });
  }

  /* ---------- barcode scanning (native BarcodeDetector only) ---------- */

  var scanStream = null;
  var scanTimer = null;

  function scanSupported() {
    return typeof window !== 'undefined' && 'BarcodeDetector' in window &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function scanTeardown() {
    if (scanTimer) { cancelAnimationFrame(scanTimer); scanTimer = null; }
    if (scanStream) {
      scanStream.getTracks().forEach(function (track) { track.stop(); });
      scanStream = null;
    }
    var video = el('scan-video');
    video.pause();
    video.srcObject = null;
    el('scan').classList.add('hidden');
    el('scan').classList.remove('flex');
  }

  function scanFail(message) {
    scanTeardown();
    var p = document.createElement('p');
    p.className = 'text-sm font-medium text-deal';
    p.textContent = message;
    panelMessage(p);
    el('ean-input').focus();
  }

  function startScan() {
    if (!scanSupported()) return;
    var overlay = el('scan');
    var video = el('scan-video');
    el('scan-msg').textContent = 'Hold stregkoden foran kameraet…';
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    var detector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf']
    });

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(function (stream) {
        scanStream = stream;
        video.srcObject = stream;
        return video.play();
      })
      .then(function () {
        var tick = function () {
          if (!scanStream) return;
          detector.detect(video)
            .then(function (hits) {
              if (!scanStream) return;
              if (hits && hits.length && hits[0].rawValue) {
                var found = hits[0].rawValue;
                scanTeardown();
                el('ean-input').value = found;
                runLookup(found);
                return;
              }
              scanTimer = requestAnimationFrame(tick);
            })
            .catch(function () {
              if (scanStream) scanTimer = requestAnimationFrame(tick);
            });
        };
        scanTimer = requestAnimationFrame(tick);
      })
      .catch(function () {
        scanFail('Kunne ikke bruge kameraet. Indtast stregkoden i stedet.');
      });
  }

  /* ---------- budget status ---------- */

  var statusTimer = null;

  var BUDGET_BASE = 'rounded-full border px-2 py-0.5 font-medium';

  function setStatus(text, waiting) {
    var node = el('budget');
    if (!node) return;
    node.textContent = text || '';
    if (!text) {
      node.className = BUDGET_BASE + ' hidden border-brand-line text-muted';
      return;
    }
    node.className = BUDGET_BASE + (waiting
      ? ' border-deal text-deal'
      : ' border-brand-line text-muted');
  }

  // Shows the cooldown counting down, so a paused app never looks broken.
  function renderBudget() {
    var remaining = Math.ceil(cooldownRemaining() / 1000);
    if (remaining > 0) {
      setStatus('For mange forespørgsler — venter ' + remaining + ' s', true);
      if (!statusTimer) statusTimer = setInterval(renderBudget, 1000);
      return;
    }
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    setStatus('', false);
  }

  /* ---------- boot ---------- */

  function loadOffers(force) {
    // Rebuild the model from whatever is already cached, so a reload paints
    // without a request; only fetch when nothing usable is cached.
    var warmed = 0;
    if (!force) {
      var ids = Object.keys(storeById);
      for (var i = 0; i < ids.length; i++) {
        var hit = cachedClearances(ids[i]);
        if (hit && !hit.stale) {
          offerCache.set(ids[i], { data: hit.data, at: hit.at });
          mergeOffers(ids[i], hit.data);
          warmed++;
        }
      }
    }
    if (warmed) {
      renderGrid({ at: now() });
      return Promise.resolve();
    }

    panelMessage(gridNote('Henter tilbud i nærheden…'));
    return fetchNearbyOffers()
      .then(function () { renderGrid({ at: now() }); })
      .catch(function (err) {
        if (err.statusCode === 401) { forgetToken('Nøglen er ikke længere gyldig. Indsæt en ny.'); return; }
        panelError(describe(err), function () { loadOffers(true); });
      });
  }

  function boot(force) {
    initMap();
    map.invalidateSize();

    var cached = force ? null : cachedStores();
    if (cached && cached.length) {
      drawStores(cached);
      loadOffers(force);
      return;
    }

    panelMessage(gridNote('Henter butikker…'));
    fetchStores()
      .then(function (stores) {
        drawStores(stores);
        if (!stores.length) {
          panelMessage(gridNote('Fandt ingen butikker i området.'));
          return;
        }
        loadOffers(force);
      })
      .catch(function (err) {
        if (err.statusCode === 401) { forgetToken('Nøglen er ikke længere gyldig. Indsæt en ny.'); return; }
        panelError(describe(err), function () { boot(force); });
      });
  }

  /* ---------- mobile map overlay ---------- */

  // Leaflet caches the container size and paints grey tiles if it is resized
  // without being told, so every move of the map element re-measures it.
  function moveMap(toOverlay) {
    var target = toOverlay ? el('map-overlay-slot') : el('map-pane');
    var node = el('map');
    if (node.parentNode !== target) target.appendChild(node);
    if (map) setTimeout(function () { map.invalidateSize(); }, 0);
  }

  function openMapOverlay() {
    var overlay = el('map-overlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    moveMap(true);
  }

  function closeMapOverlay() {
    var overlay = el('map-overlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    moveMap(false);
  }

  onBudgetChange = renderBudget;
  el('gate-form').addEventListener('submit', saveToken);
  el('ean-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    runLookup(el('ean-input').value);
  });
  el('scan-cancel').addEventListener('click', function () { scanTeardown(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && scanStream) scanTeardown();
  });
  if (scanSupported()) {
    el('ean-scan').classList.remove('hidden');
    el('ean-scan').addEventListener('click', startScan);
  }
  el('forget').addEventListener('click', function () { discardOwnToken(); });
  el('locate').addEventListener('click', locate);
  el('reload-stores').addEventListener('click', function () {
    allOffers = [];
    offerCache.clear();
    boot(true);
  });
  el('sort').addEventListener('change', function (ev) {
    sortMode = ev.target.value;        // ordering survives a filter change
    renderGrid();
  });
  el('map-toggle').addEventListener('click', openMapOverlay);
  el('map-close').addEventListener('click', closeMapOverlay);

  // Leaving the narrow breakpoint must return the map to its column.
  var wide = window.matchMedia('(min-width: 1024px)');
  var syncMap = function () {
    if (wide.matches) closeMapOverlay();
    if (map) map.invalidateSize();
  };
  if (wide.addEventListener) wide.addEventListener('change', syncMap);
  else if (wide.addListener) wide.addListener(syncMap);
  window.addEventListener('resize', function () { if (map) map.invalidateSize(); });

  if (token()) {
    showApp();
    boot();
  } else {
    showGate();
  }
})();
