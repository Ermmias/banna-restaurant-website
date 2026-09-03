/* Banna Restaurant & Bar — static site runtime.
   Small vanilla helpers: language switch, dish filters, photo lightbox, stat counters.
   No frameworks, no CDN dependencies. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- language ---------- */
  (function () {
    var node = document.getElementById('i18n');
    var btns = $$('[data-setlang]');
    if (!btns.length) return;
    var dict = {};
    try { dict = node ? JSON.parse(node.textContent) : {}; } catch (e) {}
    var spans = $$('[data-t]');
    var base = {};
    spans.forEach(function (el) { base[el.getAttribute('data-t')] = el.textContent; });

    function apply(lang) {
      var table = lang === 'en' ? null : dict[lang];
      spans.forEach(function (el) {
        var k = el.getAttribute('data-t');
        el.textContent = table && table[k] != null ? table[k] : base[k];
      });
      btns.forEach(function (b) {
        if (b.getAttribute('data-setlang') === lang) b.setAttribute('data-lang-active', 'true');
        else b.removeAttribute('data-lang-active');
      });
      document.documentElement.lang = lang === 'am' ? 'am' : lang === 'ti' ? 'ti' : lang;
      try { localStorage.setItem('banna-lang', lang); } catch (e) {}
    }

    btns.forEach(function (b) {
      b.addEventListener('click', function () { apply(b.getAttribute('data-setlang')); });
    });

    var saved = null;
    try { saved = localStorage.getItem('banna-lang'); } catch (e) {}
    if (saved && saved !== 'en' && dict[saved]) apply(saved);
  })();

  /* ---------- dish filters ---------- */
  (function () {
    var bar = $('.dish-filters');
    if (!bar) return;
    var btns = $$('button[data-cat]', bar);
    var cards = $$('.dish-card[data-cat]');
    var countNode = null;
    (function () {
      var walker = document.createTreeWalker(bar.parentNode || document.body, NodeFilter.SHOW_TEXT);
      var n;
      while ((n = walker.nextNode())) {
        if (/^\s*\d+\s+dish(es)?\s+shown/.test(n.nodeValue)) { countNode = n; break; }
      }
    })();
    if (!btns.length || !cards.length) return;

    function show(cat, btn) {
      var n = 0;
      cards.forEach(function (c) {
        var on = cat === 'all' || c.getAttribute('data-cat') === cat;
        c.hidden = !on;
        c.style.display = on ? '' : 'none';
        if (on) n++;
      });
      btns.forEach(function (b) { b.classList.toggle('filter-on', b === btn); });
      if (countNode) countNode.nodeValue = countNode.nodeValue.replace(/^\s*\d+\s+dish(es)?\s+shown/, n + (n === 1 ? ' dish' : ' dishes') + ' shown');
    }

    btns.forEach(function (b) {
      b.addEventListener('click', function () { show(b.getAttribute('data-cat'), b); });
    });
    if (btns[0]) btns[0].classList.add('filter-on');
  })();

  /* ---------- photo lightbox ---------- */
  (function () {
    var triggers = $$('[data-zoom]');
    if (!triggers.length) return;
    var box = null;

    function close() {
      if (!box) return;
      box.remove();
      box = null;
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function open(d) {
      close();
      box = document.createElement('div');
      box.id = 'banna-lightbox';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', d.n);
      box.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(20,14,11,.9);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:clamp(16px,4vw,40px)';
      var price = d.p ? '<span style="font:800 17px Archivo,system-ui,sans-serif;color:#C7452B;white-space:nowrap">' + d.p + '</span>' : '';
      var heat = d.h ? '<span style="font:700 12px Archivo,system-ui,sans-serif;letter-spacing:.6px;color:#6B5D52;text-transform:uppercase">' + d.h + '</span>' : '';
      box.innerHTML =
        '<div style="position:relative;width:100%;max-width:820px;display:flex;flex-direction:column;gap:16px">' +
          '<button type="button" data-close aria-label="Close" style="position:absolute;top:12px;right:12px;z-index:2;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(20,14,11,.55);color:#fff;font-size:22px;line-height:1;cursor:pointer">&times;</button>' +
          '<img class="zoom-frame" src="' + d.s + '" alt="' + d.n.replace(/"/g, '&quot;') + '" style="width:100%;aspect-ratio:1000/512;max-height:62vh;object-fit:cover;border-radius:22px;background:#1B1512;box-shadow:0 26px 60px rgba(0,0,0,.55)">' +
          '<div style="background:#FAF7F3;border-radius:20px;padding:20px 22px;display:flex;flex-wrap:wrap;align-items:center;gap:14px 20px">' +
            '<div style="flex:1 1 240px;min-width:0">' +
              '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">' +
                '<h2 style="font:700 22px \'Baloo 2\',cursive;margin:0;color:#1B1512">' + d.n + '</h2>' + price +
              '</div>' +
              (heat ? '<div style="margin-top:4px">' + heat + '</div>' : '') +
              '<p style="font:400 14px/1.6 Archivo,system-ui,sans-serif;color:#6B5D52;margin:8px 0 0;text-wrap:pretty">' + d.d + '</p>' +
            '</div>' +
            '<a href="' + d.u + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;min-height:48px;padding:0 26px;border-radius:999px;background:#C7452B;color:#fff;font:700 15px Archivo,system-ui,sans-serif;text-decoration:none;white-space:nowrap">' + d.c + '</a>' +
          '</div>' +
        '</div>';
      box.addEventListener('click', function (e) {
        if (e.target === box || e.target.hasAttribute('data-close')) close();
      });
      document.body.appendChild(box);
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
    }

    triggers.forEach(function (t) {
      var card = t.closest('[data-dish]');
      if (!card) return;
      t.addEventListener('click', function () {
        try { open(JSON.parse(card.getAttribute('data-dish'))); } catch (e) {}
      });
    });
  })();

  /* ---------- stat count-up ---------- */
  (function () {
    var sec = $('[data-screen-label="stats-counter"]');
    if (!sec || !('IntersectionObserver' in window)) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var nodes = $$('div', sec).filter(function (el) {
      return el.children.length === 0 && /[0-9]/.test(el.textContent);
    });
    if (!nodes.length) return;

    var targets = [];
    nodes.forEach(function (el) {
      var raw = el.textContent.trim();
      var m = raw.match(/[0-9][0-9.,]*/);
      if (!m) return;
      var numStr = m[0];
      var dot = numStr.indexOf('.');
      targets.push({
        el: el, raw: raw,
        num: parseFloat(numStr.replace(/,/g, '')) || 0,
        dec: dot === -1 ? 0 : numStr.length - dot - 1,
        pre: raw.slice(0, m.index),
        suf: raw.slice(m.index + numStr.length)
      });
    });
    if (!targets.length) return;
    function fmt(t, v) {
      return t.pre + (t.dec ? v.toFixed(t.dec) : Math.floor(v).toLocaleString()) + t.suf;
    }
    targets.forEach(function (t) { t.el.textContent = fmt(t, 0); });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.disconnect();
        var start = performance.now(), dur = 2200;
        (function step(now) {
          var p = Math.min((now - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          targets.forEach(function (t) { t.el.textContent = fmt(t, eased * t.num); });
          if (p < 1) requestAnimationFrame(step);
          else targets.forEach(function (t) { t.el.textContent = t.raw; });
        })(performance.now());
      });
    }, { threshold: 0.3 });
    io.observe(sec);
  })();

  /* ---------- FAQ accordion (collapses on small screens) ---------- */
  (function () {
    var cards = $$('.faq-card');
    if (!cards.length) return;
    cards.forEach(function (card) {
      var head = card.firstElementChild;
      var ans = $('.faq-answer', card);
      var chev = head && head.lastElementChild;
      if (!ans || !head) return;
      head.setAttribute('role', 'button');
      head.setAttribute('tabindex', '0');
      head.setAttribute('aria-expanded', ans.classList.contains('faq-open') ? 'true' : 'false');
      function toggle() {
        var open = !ans.classList.contains('faq-open');
        cards.forEach(function (c) {
          var a = $('.faq-answer', c), hd = c.firstElementChild;
          if (!a) return;
          a.classList.remove('faq-open');
          if (hd) {
            hd.setAttribute('aria-expanded', 'false');
            if (hd.lastElementChild) hd.lastElementChild.style.transform = 'rotate(0deg)';
          }
        });
        if (open) {
          ans.classList.add('faq-open');
          head.setAttribute('aria-expanded', 'true');
          if (chev) chev.style.transform = 'rotate(180deg)';
        }
      }
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  })();

  /* ---------- Google Ads: outbound order-click conversions ----------
     Checkout happens on Clover, a domain we don't control, so the real
     Purchase event can't fire here. We count the click through to the
     ordering page instead. Uber Eats / DoorDash are tracked automatically
     by Google Ads, so they're left alone. */
  (function () {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || !/cloveronline\.com/.test(a.href)) return;
      if (typeof gtag !== 'function') return;
      var card = a.closest('[data-dish]');
      var dish = '';
      try { dish = card ? JSON.parse(card.getAttribute('data-dish')).n : ''; } catch (err) {}
      gtag('event', 'conversion', {
        send_to: 'AW-16929805337/LSGDCISaj-ocEJmo4Yg_',
        value: 1.0,
        currency: 'USD',
        transaction_id: '',
        items: dish ? [{ item_name: dish }] : undefined
      });
    }, true);
  })();

  /* ---------- True purchase matching: log click + gclid for offline conversion import ----------
     Logs {gclid, dish, uid, timestamp} to a Google Sheet via Apps Script web app,
     so a later Clover order can be matched to this click and uploaded to Google Ads
     as a real Purchase conversion. See /banna-conversion-tracking/README.md. */
  (function () {
    var GAS_WEBAPP_URL = 'GAS_WEBAPP_URL_PLACEHOLDER'; // replace after deploying the Apps Script web app

    function getGclid() {
      try {
        var fromUrl = new URLSearchParams(window.location.search).get('gclid');
        if (fromUrl) return fromUrl;
        var m = document.cookie.match(/(?:^|;\s*)_gcl_aw=([^;]+)/);
        if (m) {
          var parts = decodeURIComponent(m[1]).split('.');
          return parts.length >= 3 ? parts[2] : '';
        }
      } catch (err) {}
      return '';
    }

    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || !/cloveronline\.com/.test(a.href)) return;
      if (!GAS_WEBAPP_URL || GAS_WEBAPP_URL === 'GAS_WEBAPP_URL_PLACEHOLDER') return;

      var gclid = getGclid();
      if (!gclid) return; // not an ad-attributable visit, skip logging

      var card = a.closest('[data-dish]');
      var dish = '';
      try { dish = card ? JSON.parse(card.getAttribute('data-dish')).n : ''; } catch (err) {}
      var uid = Date.now() + '-' + Math.random().toString(36).slice(2, 8);

      try {
        navigator.sendBeacon(GAS_WEBAPP_URL, new Blob(
          [JSON.stringify({ gclid: gclid, dish: dish, uid: uid })],
          { type: 'text/plain' }
        ));
      } catch (err) {}
    }, true);
  })();

  /* ---------- close the nav dropdown on outside click ---------- */
  document.addEventListener('click', function (e) {
    $$('details[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });
})();
