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
  var STORES_TTL = 24 * 60 * 60 * 1000;
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
  var selected = null;        // id of the store whose panel is open
  var selectedStore = null;   // the store object itself, for lookups

  /* ---------- API ---------- */

  function token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function sgFetch(path, overrideToken) {
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
          throw err;
        });
      });
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

  /* ---------- EAN price lookup ---------- */

  var EAN_PREFIX = 'sg_ean_v1:';
  var EAN_TTL = 7 * 24 * 60 * 60 * 1000;

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
    try {
      var raw = localStorage.getItem(eanCacheKey(storeId, ean));
      if (!raw) return null;
      var hit = JSON.parse(raw);
      if (!hit || typeof hit.at !== 'number' || !hit.data) return null;
      if (Date.now() - hit.at > EAN_TTL) return null;
      return hit.data;
    } catch (e) {
      return null;
    }
  }

  function eanCacheEntries() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key || key.indexOf(EAN_PREFIX) !== 0) continue;
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

  // Frees room for new lookups when localStorage is full: drops the oldest
  // quarter of cached prices (unparseable entries count as oldest).
  function evictOldestEans() {
    var entries = eanCacheEntries();
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

  function eanCacheSet(storeId, ean, data) {
    var key = eanCacheKey(storeId, ean);
    var payload = JSON.stringify({ at: Date.now(), data: data });
    try {
      localStorage.setItem(key, payload);
      return true;
    } catch (e) {
      evictOldestEans();
      try {
        localStorage.setItem(key, payload);
        return true;
      } catch (e2) {
        return false;
      }
    }
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
    ['app-head', 'layout', 'app-foot'].forEach(function (id) {
      el(id).classList.add('hidden');
    });
    if (message) {
      var m = el('gate-msg');
      m.textContent = message;
      m.className = 'small ' + (isError ? 'err' : 'muted');
    }
  }

  function showApp() {
    el('gate').classList.add('hidden');
    ['app-head', 'layout', 'app-foot'].forEach(function (id) {
      el(id).classList.remove('hidden');
    });
  }

  function forgetToken(message) {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(STORES_KEY);
    } catch (e) { /* ignore */ }
    offerCache.clear();
    showGate(message || 'Nøglen er slettet fra din browser.', false);
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
    try {
      var raw = localStorage.getItem(STORES_KEY);
      if (!raw) return null;
      var hit = JSON.parse(raw);
      if (!hit || !hit.at || !Array.isArray(hit.stores)) return null;
      if (Date.now() - hit.at > STORES_TTL) return null;
      return hit.stores;
    } catch (e) {
      return null;
    }
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
      try {
        localStorage.setItem(STORES_KEY, JSON.stringify({ at: Date.now(), stores: stores }));
      } catch (e) { /* quota - fine */ }
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
      // Salling returns coordinates as [longitude, latitude].
      var m = L.circleMarker([store.coordinates[1], store.coordinates[0]], {
        radius: 7,
        weight: 2,
        color: '#333',
        fillColor: BRANDS[store.brand],
        fillOpacity: 0.95
      });
      m.bindTooltip(store.name || store.brand);
      m.on('click', function () { selectStore(store); });
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
    head.className = 'panel-head';

    var h = document.createElement('h2');
    h.textContent = store.name || store.brand;
    head.appendChild(h);

    if (line) {
      var a = document.createElement('div');
      a.className = 'addr';
      a.textContent = line;
      head.appendChild(a);
    }

    var note = document.createElement('p');
    note.className = 'small muted';
    note.textContent = 'Viser live nedsatte varer (datovarer) fra Salling Groups API — ikke almindelige hyldepriser.';
    head.appendChild(note);

    if (extra) head.appendChild(extra);
    return head;
  }

  function offerRow(item, storeId) {
    var offer = item.offer || {};
    var product = item.product || {};
    var li = document.createElement('li');

    if (product.image) {
      var img = document.createElement('img');
      img.src = product.image;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = function () { img.remove(); };
      li.appendChild(img);
    }

    var body = document.createElement('div');
    body.className = 'o-body';

    var name = document.createElement('div');
    name.className = 'o-name';
    name.textContent = product.description || 'Ukendt vare';
    body.appendChild(name);

    var prices = document.createElement('div');
    prices.className = 'o-prices';
    var now = document.createElement('span');
    now.className = 'o-new';
    now.textContent = kr(offer.newPrice);
    prices.appendChild(now);

    if (offer.originalPrice > offer.newPrice) {
      var was = document.createElement('span');
      was.className = 'o-old';
      was.textContent = kr(offer.originalPrice);
      prices.appendChild(was);
    }
    if (offer.percentDiscount) {
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '-' + Math.round(offer.percentDiscount) + '%';
      prices.appendChild(badge);
    }
    body.appendChild(prices);

    if (offer.stock) {
      var stock = document.createElement('div');
      stock.className = 'small muted';
      stock.textContent = offer.stock + ' ' + (offer.stockUnit === 'kg' ? 'kg' : 'stk.') + ' tilbage';
      body.appendChild(stock);
    }

    if (product.ean && validEan(product.ean)) {
      var compare = document.createElement('button');
      compare.type = 'button';
      compare.className = 'rowbtn';
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
            var msg = document.createElement('div');
            msg.className = 'small err';
            msg.textContent = err.statusCode === 403
              ? 'API-nøglen mangler adgang til Products EAN.'
              : describeLookup(err);
            body.appendChild(msg);
          });
      };
      body.appendChild(compare);
    }

    li.appendChild(body);
    return li;
  }

  // Shows the catalogue's regular price next to a clearance offer, and flags
  // the case where the offer's reported originalPrice disagrees with it.
  function regularPriceLine(found, offer) {
    var line = document.createElement('div');
    line.className = 'o-regular';
    if (found.price === null) {
      line.className += ' muted';
      line.textContent = 'Normalpris ikke tilgængelig';
      return line;
    }

    var reported = Number(offer.originalPrice);
    var disagrees = isFinite(reported) && Math.abs(reported - found.price) > 1;
    if (disagrees) {
      line.className += ' o-disagree';
      line.textContent = 'Normalpris ' + kr(found.price) +
        ' — tilbuddet oplyser ' + kr(reported);
    } else {
      line.textContent = 'Normalpris ' + kr(found.price);
    }
    return line;
  }

  function renderOffers(store, data) {
    var panel = el('panel');
    panel.textContent = '';

    var refresh = document.createElement('div');
    refresh.className = 'row';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Opdatér';
    btn.onclick = function () {
      offerCache.delete(store.id);
      selectStore(store);
    };
    refresh.appendChild(btn);
    panel.appendChild(panelHead(store, refresh));

    var items = (data && data.clearances) || [];
    if (!items.length) {
      var empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Ingen nedsatte varer lige nu.';
      panel.appendChild(empty);
      return;
    }

    var count = document.createElement('p');
    count.className = 'small muted';
    count.textContent = items.length + ' nedsatte varer';
    panel.appendChild(count);

    var list = document.createElement('ul');
    list.className = 'offers';
    items.slice().sort(function (a, b) {
      return ((b.offer && b.offer.percentDiscount) || 0) - ((a.offer && a.offer.percentDiscount) || 0);
    }).forEach(function (item) {
      list.appendChild(offerRow(item, store.id));
    });
    panel.appendChild(list);
  }

  function panelMessage(node) {
    var panel = el('panel');
    panel.textContent = '';
    panel.appendChild(node);
  }

  function panelError(message, retry) {
    var wrap = document.createElement('div');
    var p = document.createElement('p');
    p.className = 'err';
    p.textContent = message;
    wrap.appendChild(p);
    if (retry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Prøv igen';
      btn.onclick = retry;
      wrap.appendChild(btn);
    }
    panelMessage(wrap);
  }

  function selectStore(store) {
    selected = store.id;
    selectedStore = store;
    if (offerCache.has(store.id)) {
      renderOffers(store, offerCache.get(store.id));
      return;
    }

    var loading = document.createElement('div');
    loading.appendChild(panelHead(store));
    var p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Henter nedsatte varer…';
    loading.appendChild(p);
    panelMessage(loading);

    sgFetch('/v1/food-waste/' + encodeURIComponent(store.id))
      .then(function (data) {
        offerCache.set(store.id, data);
        if (selected === store.id) renderOffers(store, data);
      })
      .catch(function (err) {
        if (err.statusCode === 401) { forgetToken('Nøglen er ikke længere gyldig. Indsæt en ny.'); return; }
        if (selected !== store.id) return;
        if (err.statusCode === 404) {
          offerCache.set(store.id, { clearances: [] });
          renderOffers(store, { clearances: [] });
          return;
        }
        panelError(describe(err), function () { selectStore(store); });
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
    note.className = 'small muted';
    note.textContent = 'Normalpris i fysiske butikker fra Salling Groups API. ' +
      'Priser kan afvige fra hylden. Data stilles til rådighed til undervisningsbrug ' +
      'og ikke-kommerciel brug.';
    return note;
  }

  function scopeHelp() {
    var wrap = document.createElement('p');
    wrap.className = 'err';
    wrap.appendChild(document.createTextNode(
      'Din API-nøgle mangler adgang til Products EAN. Anmod om adgang på '));
    var link = document.createElement('a');
    link.href = PORTAL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'developer.sallinggroup.dev';
    wrap.appendChild(link);
    wrap.appendChild(document.createTextNode('. Kortet og nedsatte varer virker fortsat.'));
    return wrap;
  }

  function renderProduct(product, store) {
    var panel = el('panel');
    panel.textContent = '';

    var head = document.createElement('div');
    head.className = 'panel-head';
    var h = document.createElement('h2');
    h.textContent = product.name || 'Ukendt vare';
    head.appendChild(h);
    var ean = document.createElement('div');
    ean.className = 'ean';
    ean.textContent = 'EAN ' + product.ean;
    head.appendChild(ean);

    // A price is only true for the store it was looked up in, so name it.
    var where = document.createElement('div');
    where.className = 'addr';
    where.textContent = 'Pris i ' + storeLabel(store);
    head.appendChild(where);
    panel.appendChild(head);

    var row = document.createElement('div');
    row.className = 'product';
    if (product.image) {
      var img = document.createElement('img');
      img.src = product.image;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = function () { img.remove(); };
      row.appendChild(img);
    }
    var body = document.createElement('div');
    var price = document.createElement('div');
    if (product.available === false) {
      price.className = 'muted';
      price.textContent = 'Varen findes ikke i de fysiske butikker.';
    } else if (product.price === null) {
      price.className = 'muted';
      price.textContent = 'Pris ikke tilgængelig';
    } else {
      price.className = 'p-price';
      price.textContent = kr(product.price);
    }
    body.appendChild(price);
    row.appendChild(body);
    panel.appendChild(row);

    panel.appendChild(priceNote());
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
      ask.className = 'muted';
      ask.textContent = describeLookup(err);
      panelMessage(ask);
      return;
    }
    if (err && (err.invalidEan || err.notFound)) {
      var p = document.createElement('p');
      p.className = 'err';
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
    loading.className = 'muted';
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
  }

  function scanFail(message) {
    scanTeardown();
    var p = document.createElement('p');
    p.className = 'err';
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

  /* ---------- boot ---------- */

  function hint(text) {
    var p = document.createElement('p');
    p.className = 'muted';
    p.textContent = text;
    panelMessage(p);
  }

  function boot(force) {
    initMap();
    map.invalidateSize();

    var cached = force ? null : cachedStores();
    if (cached && cached.length) {
      drawStores(cached);
      hint('Vælg en butik på kortet for at se nedsatte varer og slå stregkoder op.');
      return;
    }

    hint('Henter butikker…');
    fetchStores()
      .then(function (stores) {
        drawStores(stores);
        if (!stores.length) {
          hint('Fandt ingen butikker i området.');
        } else {
          hint('Vælg en butik på kortet for at se nedsatte varer og slå stregkoder op. ' +
            stores.length + ' butikker fundet.');
        }
      })
      .catch(function (err) {
        if (err.statusCode === 401) { forgetToken('Nøglen er ikke længere gyldig. Indsæt en ny.'); return; }
        panelError(describe(err), function () { boot(force); });
      });
  }

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
  el('forget').addEventListener('click', function () { forgetToken(); });
  el('locate').addEventListener('click', locate);
  el('reload-stores').addEventListener('click', function () { boot(true); });

  if (token()) {
    showApp();
    boot();
  } else {
    showGate();
  }
})();
