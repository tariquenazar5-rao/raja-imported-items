/* Raja Imported Items — homepage sections (2026-11-01)
   Injects a trust row (after the hero), Top Categories and Top Products
   (after the offers/deals section) into the STOREFRONT HOME only.
   Data is read live from Firestore, so prices/stock are always current.
   Wrapped defensively: any failure leaves the shop exactly as it was. */
(function () {
  'use strict';
  try {
    var params = new URLSearchParams(location.search);
    if ((params.get('view') || '').toLowerCase() === 'admin') return;

    var API = 'https://firestore.googleapis.com/v1/projects/raja-one-stop-shop/databases/(default)/documents/app-data/products?key=AIzaSyAbAGGJGTbEJc36dl29yiDMFKo_9aXuwXE';
    var CATS_API = 'https://firestore.googleapis.com/v1/projects/raja-one-stop-shop/databases/(default)/documents/app-data/categories?key=AIzaSyAbAGGJGTbEJc36dl29yiDMFKo_9aXuwXE';
    var TOP_CODES = ['P185', 'P002', 'P006', 'P292', 'P005', 'P013', 'P301', 'P321'];
    var TOP_CATS = ['Electronics Gadgets', 'Beauty, Cosmetics & Personal Care', 'Hair Dryers & Styling', 'Bottles & Tumblers', 'Kitchen Appliances', 'Irons', 'Heaters', 'Personal Grooming'];

    var built = false, fetching = false;
    var cachedProducts = null, cachedCats = null, ovlOpen = false;

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function unwrap(v) {
      if (v === null || typeof v !== 'object') return v;
      if ('stringValue' in v) return v.stringValue;
      if ('integerValue' in v) return parseInt(v.integerValue, 10);
      if ('doubleValue' in v) return v.doubleValue;
      if ('booleanValue' in v) return v.booleanValue;
      if ('nullValue' in v) return null;
      if ('arrayValue' in v) return (v.arrayValue.values || []).map(unwrap);
      if ('mapValue' in v) { var o = {}, f = v.mapValue.fields || {}; for (var k in f) o[k] = unwrap(f[k]); return o; }
      return v;
    }
    function money(n) { return 'Rs. ' + Number(n || 0).toLocaleString('en-US'); }

    var IC = {
      diamond: '<svg viewBox="0 0 24 24" fill="none" stroke="#B8860B" stroke-width="1.7" stroke-linejoin="round"><path d="M7 3h10l4 6-9 12L3 9l4-6z"/><path d="M3 9h18"/><path d="M9.5 3L12 9l2.5-6"/></svg>',
      tag: '<svg viewBox="0 0 24 24" fill="none" stroke="#B8860B" stroke-width="1.7" stroke-linejoin="round"><path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg>',
      headset: '<svg viewBox="0 0 24 24" fill="none" stroke="#B8860B" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M3 15a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4z"/><path d="M21 15a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-4z"/><path d="M19 20a3 3 0 0 1-3 2h-3"/></svg>',
      returns: '<svg viewBox="0 0 24 24" fill="none" stroke="#B8860B" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.7-6.5"/><path d="M3 4v5h5"/></svg>'
    };

    function trustHTML() {
      var items = [
        [IC.diamond, 'Best Quality', '100% Original'],
        [IC.tag, 'Best Price', 'Sab Se Kam Daam'],
        [IC.headset, '24/7 Support', 'WhatsApp Par Rabta']
      ];
      var h = '<div class="rj-sec"><div class="rj-trust-in">';
      items.forEach(function (it) {
        h += '<div class="rj-trust-it"><div class="rj-ic">' + it[0] + '</div><b>' + it[1] + '</b><span>' + it[2] + '</span></div>';
      });
      return h + '</div></div>';
    }

    function showcaseHTML() {
      return '<div class="rj-sec">' +
        '<div class="rj-head"><div><div class="rj-eyebrow">Shop by Category</div><div class="rj-title">Top Categories</div><div class="rj-sub">Explore Our Popular Categories</div></div><button class="rj-all" id="rj-cats-all" type="button">View All \u2192</button></div>' +
        '<div class="rj-cats" id="rj-cats-row"></div>' +
        '<div class="rj-head"><div><div class="rj-eyebrow">Trending Now</div><div class="rj-title">Top Products</div><div class="rj-sub">Neat, clean &amp; boxed \u2014 handpicked premium imports</div></div><button class="rj-all" id="rj-prods-all" type="button">View All \u2192</button></div>' +
        '<div class="rj-prods" id="rj-prods-row"></div>' +
        '</div>';
    }

    function findAnchors() {
      var cover = document.querySelector('img[alt="Storefront Cover"]');
      var hero = cover ? cover.closest('section') : null;
      var deals = null, secs = document.querySelectorAll('section');
      for (var i = 0; i < secs.length; i++) {
        if ((secs[i].textContent || '').indexOf('Super Deals') > -1) { deals = secs[i]; break; }
      }
      return { hero: hero, deals: deals };
    }

    function scrollToShop() {
      var a = findAnchors();
      var t = a.deals && a.deals.nextElementSibling;
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function gotoCategory(name) {
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var t = (btns[i].textContent || '').trim();
        if (t === name || t.indexOf(name) === 0) {
          btns[i].click();
          btns[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
      scrollToShop();
    }

    /* ---- View All: ALL products --------------------------------------
       The shop's own tab bar has an "All Products (N)" tab and, under
       it, an "All Categories" filter pill (state ALL = no category
       filter). Activate both the same way gotoCategory activates a
       category pill, then scroll to the shop grid. */
    function findBtn(match) {
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var t = (btns[i].textContent || '').trim();
        if (match(t)) return btns[i];
      }
      return null;
    }

    function gotoAllProducts() {
      try {
        var tab = findBtn(function (t) { return t.indexOf('All Products') === 0; });
        if (tab) tab.click();
        setTimeout(function () {
          try {
            var pill = findBtn(function (t) { return t === 'All Categories'; });
            if (pill) pill.click();
            setTimeout(function () {
              try {
                var anchor = tab || pill;
                var sec = anchor && anchor.closest ? anchor.closest('section') : null;
                if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                else scrollToShop();
              } catch (e) { scrollToShop(); }
            }, 60);
          } catch (e) { scrollToShop(); }
        }, 120);
      } catch (e) { scrollToShop(); }
    }

    /* ---- View All: ALL categories overlay ----------------------------
       Category list = Firestore app-data/categories doc (in its own
       order); counts are computed from the products array cached by
       loadData. Tapping a category closes the overlay and reuses the
       existing gotoCategory() navigation. */
    function ensureOverlay() {
      var ovl = document.getElementById('rj-cats-overlay');
      if (ovl) return ovl;
      ovl = document.createElement('div');
      ovl.id = 'rj-cats-overlay';
      ovl.className = 'rj-ovl';
      ovl.innerHTML =
        '<div class="rj-ovl-panel" role="dialog" aria-modal="true" aria-label="All Categories">' +
          '<div class="rj-ovl-head"><div><div class="rj-eyebrow">Shop by Category</div>' +
          '<div class="rj-title">All Categories</div>' +
          '<div class="rj-sub" id="rj-ovl-sub"></div></div>' +
          '<button class="rj-ovl-close" id="rj-ovl-close" type="button" aria-label="Close">\u00D7</button></div>' +
          '<div class="rj-cats rj-ovl-grid" id="rj-ovl-grid"></div>' +
        '</div>';
      document.body.appendChild(ovl);
      ovl.addEventListener('click', function (ev) { if (ev.target === ovl) closeAllCategories(); });
      var cb = document.getElementById('rj-ovl-close');
      if (cb) cb.addEventListener('click', closeAllCategories);
      document.addEventListener('keydown', function (ev) {
        if (ovlOpen && (ev.key === 'Escape' || ev.keyCode === 27)) closeAllCategories();
      });
      return ovl;
    }

    function openAllCategories() {
      try {
        var ovl = ensureOverlay();
        ovl.classList.add('open');
        ovlOpen = true;
        try { document.body.style.overflow = 'hidden'; } catch (e) {}
        if (cachedProducts && cachedCats) renderAllCats();
        else {
          var g = document.getElementById('rj-ovl-grid');
          if (g) g.innerHTML = '<div class="rj-ovl-msg">Loading categories\u2026</div>';
          loadData();
        }
      } catch (e) { /* leave the shop as it was */ }
    }

    function closeAllCategories() {
      try {
        var ovl = document.getElementById('rj-cats-overlay');
        if (ovl) ovl.classList.remove('open');
        ovlOpen = false;
        try { document.body.style.overflow = ''; } catch (e) {}
      } catch (e) {}
    }

    function renderAllCats() {
      var grid = document.getElementById('rj-ovl-grid');
      if (!grid || !cachedProducts) return;
      var counts = {}, reps = {};
      cachedProducts.forEach(function (p) {
        var c = p.category || '';
        counts[c] = (counts[c] || 0) + 1;
        if (p.image && (!reps[c] || (p.stock || 0) > 0 && (reps[c].stock || 0) <= 0)) reps[c] = p;
      });
      var cats = (cachedCats || []).slice();
      Object.keys(counts).forEach(function (c) { if (c && cats.indexOf(c) === -1) cats.push(c); });
      var sub = document.getElementById('rj-ovl-sub');
      if (sub) sub.textContent = cats.length + ' categories \u00B7 ' + cachedProducts.length + ' products';
      var h = '';
      cats.forEach(function (cat) {
        var rep = reps[cat];
        h += '<div class="rj-cat" data-cat="' + esc(cat) + '">' +
          (rep && rep.image ? '<img src="' + esc(rep.image) + '" alt="' + esc(cat) + '" loading="lazy">' : '') +
          '<div class="rj-cat-b"><b>' + esc(cat) + '</b><span>' + (counts[cat] || 0) + ' products</span></div></div>';
      });
      grid.innerHTML = h || '<div class="rj-ovl-msg">No categories found.</div>';
      var cards = grid.querySelectorAll('.rj-cat');
      for (var i = 0; i < cards.length; i++) {
        cards[i].addEventListener('click', function () {
          var name = this.getAttribute('data-cat');
          closeAllCategories();
          gotoCategory(name);
        });
      }
    }

    function renderCats(products) {
      var row = document.getElementById('rj-cats-row');
      if (!row) return;
      var h = '';
      TOP_CATS.forEach(function (cat) {
        var list = products.filter(function (p) { return p.category === cat; });
        if (!list.length) return;
        var rep = null;
        list.forEach(function (p) {
          if ((p.stock || 0) > 0 && p.image && (!rep || (p.salePrice || 0) > (rep.salePrice || 0))) rep = p;
        });
        if (!rep) rep = list[0];
        h += '<div class="rj-cat" data-cat="' + esc(cat) + '"><img src="' + esc(rep.image || '') + '" alt="' + esc(cat) + '" loading="lazy"><div class="rj-cat-b"><b>' + esc(cat) + '</b><span>' + list.length + ' products</span></div></div>';
      });
      row.innerHTML = h;
      var cards = row.querySelectorAll('.rj-cat');
      for (var i = 0; i < cards.length; i++) {
        cards[i].addEventListener('click', function () { gotoCategory(this.getAttribute('data-cat')); });
      }
    }

    function renderProds(products) {
      var row = document.getElementById('rj-prods-row');
      if (!row) return;
      var byCode = {};
      products.forEach(function (p) { byCode[p.code] = p; });
      var h = '';
      TOP_CODES.forEach(function (code) {
        var p = byCode[code];
        if (!p || (p.stock || 0) <= 0) return;
        var off = (p.originalPrice && p.originalPrice > p.salePrice) ? Math.round((1 - p.salePrice / p.originalPrice) * 100) : 0;
        h += '<a class="rj-card" href="' + esc(location.pathname) + '?product=' + esc(p.code) + '">' +
          '<img src="' + esc(p.image || '') + '" alt="' + esc(p.name) + '" loading="lazy">' +
          '<div class="rj-card-b"><div class="rj-name">' + esc(p.name) + '</div>' +
          '<div class="rj-flag">' + esc(p.countryFlag || '') + ' ' + esc(p.countryName || '') + ' \u00B7 ' + esc(p.code) + '</div>' +
          '<div class="rj-price"><span class="rj-sale">' + money(p.salePrice) + '</span>' +
          (off ? '<span class="rj-orig">' + money(p.originalPrice) + '</span><span class="rj-off">' + off + '% OFF</span>' : '') +
          '</div></div></a>';
      });
      row.innerHTML = h;
    }

    function loadData() {
      if (fetching) return;
      fetching = true;
      var pFetch = fetch(API).then(function (r) { return r.json(); }).then(function (d) {
        cachedProducts = unwrap(d.fields.items) || [];
      });
      var cFetch = fetch(CATS_API).then(function (r) { return r.json(); }).then(function (d) {
        cachedCats = unwrap(d.fields.items) || [];
      }).catch(function () { cachedCats = null; });
      Promise.all([pFetch, cFetch]).then(function () {
        fetching = false;
        if (!cachedCats || !cachedCats.length) {
          var seen = {}, list = [];
          (cachedProducts || []).forEach(function (p) {
            if (p.category && !seen[p.category]) { seen[p.category] = 1; list.push(p.category); }
          });
          cachedCats = list;
        }
        renderCats(cachedProducts);
        renderProds(cachedProducts);
        if (ovlOpen) renderAllCats();
      }).catch(function () {
        fetching = false;
        var c = document.getElementById('rj-cats-row'); if (c) c.style.display = 'none';
        var p = document.getElementById('rj-prods-row'); if (p) p.style.display = 'none';
        if (ovlOpen) {
          var g = document.getElementById('rj-ovl-grid');
          if (g) g.innerHTML = '<div class="rj-ovl-msg">Could not load categories. Please try again.</div>';
        }
      });
    }

    function build() {
      if (built) return true;
      var a = findAnchors();
      if (!a.hero || !a.deals || !a.hero.parentNode || !a.deals.parentNode) return false;
      var trust = document.createElement('div');
      trust.id = 'raja-trust';
      trust.innerHTML = trustHTML();
      a.hero.parentNode.insertBefore(trust, a.hero.nextSibling);
      var show = document.createElement('div');
      show.id = 'raja-showcase';
      show.innerHTML = showcaseHTML();
      a.deals.parentNode.insertBefore(show, a.deals.nextSibling);
      var ca = document.getElementById('rj-cats-all'); if (ca) ca.addEventListener('click', openAllCategories);
      var pa = document.getElementById('rj-prods-all'); if (pa) pa.addEventListener('click', gotoAllProducts);
      built = true;
      loadData();
      return true;
    }

    var tries = 0;
    var iv = setInterval(function () { if (build() || ++tries > 80) clearInterval(iv); }, 400);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { build(); });

    var mo = new MutationObserver(function () {
      if (built && (!document.getElementById('raja-trust') || !document.getElementById('raja-showcase'))) {
        built = false;
        build();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) { /* never break the shop */ }
})();
