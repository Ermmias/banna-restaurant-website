/* <banna-cart> — shared order cart for every page of bannarestaurant.com.
   Public API:  window.BannaCart.add({name, price, img})  |  .open()  |  .count()
   State persists in localStorage so the cart follows the guest across pages. */
(function () {
  var KEY = "banna-cart-v1", ACK = "banna-pickup-ack-v1";
  var TAX = 0.0825;
  var INK = "#1B1512", CREAM = "#FAF7F3", PANEL = "#F2EBE1", RED = "#C7452B", RED_D = "#A93720", GOLD = "#9C6B15", BROWN = "#3E2A15", SAND = "#F6EBD9";

  /* ---------- Beverages: live from Clover ----------
     The drink chips are populated from the Beverages category in the Clover
     inventory, through the Worker in /api/banna-menu-worker.js. The Clover token
     stays server-side; this file only ever sees names and prices.

     Point MENU_API at the deployed Worker (or set window.BANNA_MENU_API before
     this script loads) and the list becomes live. Until then FALLBACK_DRINKS is
     shown behind a visible warning — those names and prices are placeholders and
     have NOT been checked against Clover. Alcohol is excluded on purpose: beer,
     Tej and cocktails stay dine-in/bar. */
  var MENU_API = window.BANNA_MENU_API || "";

  /* ---------- Order capture: name, phone, items -> Google Sheet ----------
     Posts the order to the Apps Script web app in /orders-sheet/. Until the URL
     is set (banna.js -> window.BANNA_GAS_URL) nothing is sent and nothing breaks.
     Fire-and-forget by design: a logging failure must never block a guest. */
  function ordersUrl() {
    var u = window.BANNA_GAS_URL || "";
    return (!u || /PLACEHOLDER/.test(u)) ? "" : u;
  }
  function gclid() {
    try {
      var fromUrl = new URLSearchParams(location.search).get("gclid");
      if (fromUrl) return fromUrl;
      var m = document.cookie.match(/(?:^|;\s*)_gcl_aw=([^;]+)/);
      if (m) { var parts = decodeURIComponent(m[1]).split("."); return parts.length >= 3 ? parts[2] : ""; }
    } catch (e) {}
    return "";
  }
  function logOrder(o) {
    var url = ordersUrl();
    if (!url) return;
    var payload = JSON.stringify({
      kind: "order",
      status: o.status || "started",
      id: o.id || "",
      name: o.name || "",
      phone: o.phone || "",
      items: o.items || [],
      count: o.count || 0,
      total: o.total || 0,
      eta: String(o.eta || "").replace(/&ndash;/g, "\u2013").replace(/&[a-z]+;/g, " ").trim(),
      page: location.pathname,
      gclid: gclid()
    });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([payload], { type: "text/plain" }))) return;
    } catch (e) {}
    try {
      fetch(url, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain" }, body: payload });
    } catch (e) {}
  }
  /* Confirmed against the Clover Beverages category by Ermmias, Sep 2026.
     Grouped hot drinks first, then water and sodas, then juice. */
  var FALLBACK_DRINKS = [
    { name: "Traditional Eritrean/Ethiopian Tea", price: 2.49 },
    { name: "Traditional Eritrean/Ethiopian Coffee", price: 3.99 },
    { name: "Classic Cappuccino", price: 3.99 },
    { name: "Creamy Caf\u00e9 Latte", price: 4.99 },
    { name: "Espresso Macchiato", price: 3.99 },
    { name: "Shakiato (Espresso & Spiced Tea Fusion)", price: 4.99 },
    { name: "Double Shot Espresso", price: 5.49 },
    { name: "Fresh Ginger Tea", price: 4.99 },
    { name: "Korent Herbal Tea", price: 4.99 },
    { name: "Sparkling Mineral Water (Large)", price: 3.99 },
    { name: "Sparkling Mineral Water (Small)", price: 2.99 },
    { name: "Topo Chico (Glass Bottle)", price: 3.99 },
    { name: "Coke (Glass Bottle)", price: 3.50 },
    { name: "Coke (Can)", price: 1.99 },
    { name: "Sprite (Can)", price: 1.99 },
    { name: "Apple Juice", price: 1.99 }
  ];
  /* Extra sides, confirmed against the Clover menu by Ermmias, Sep 2026. */
  var SIDES = [
    { name: "Egg", price: 0.79 },
    { name: "Bread", price: 1.39 },
    { name: "Injera (Regular)", price: 1.99 },
    { name: "Injera (Teff)", price: 2.49 },
    { name: "Gomen", price: 4.99 },
    { name: "Shiro", price: 4.99 },
    { name: "Salad", price: 4.99 },
    { name: "Rice", price: 4.99 },
    { name: "Defen Misir", price: 4.99 },
    { name: "Atter", price: 4.99 },
    { name: "Cabbage", price: 4.99 },
    { name: "Misir Wot", price: 6.99 },
    { name: "Fosolia", price: 9.99 }
  ];

  var DRINKS = FALLBACK_DRINKS, DRINKS_LIVE = false, DRINKS_STATE = MENU_API ? "loading" : "fallback";
  var drinkWaiters = [];

  function loadDrinks() {
    if (!MENU_API) return;
    fetch(MENU_API.replace(/\/$/, "") + "/beverages", { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) {
        var items = (d && d.items) || [];
        if (!items.length) throw new Error("empty");
        DRINKS = items.map(function (i) { return { name: i.name, price: i.price }; });
        DRINKS_LIVE = true; DRINKS_STATE = "live";
      })
      .catch(function () { DRINKS_STATE = "fallback"; })
      .then(function () { drinkWaiters.forEach(function (f) { f(); }); });
  }

  /* Pickup ETA. Standard 25–30 minutes; from 7 PM to close it's 30–40, because the
     kitchen is deep in the dinner rush. Both windows are measured from the moment
     the guest hits Checkout, so the time shown is a real clock time, not a guess. */
  function etaWindow(now) {
    var h = now.getHours();
    var rush = (h >= 19 || h < 2);
    var lo = rush ? 30 : 25, hi = rush ? 40 : 30;
    return {
      rush: rush,
      from: new Date(now.getTime() + lo * 60000),
      to: new Date(now.getTime() + hi * 60000),
      lo: lo, hi: hi
    };
  }
  function clock(d) {
    var h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? "PM" : "AM";
    h = h % 12; if (!h) h = 12;
    return h + ":" + (m < 10 ? "0" + m : m) + " " + ap;
  }
  function etaLine(e) { return clock(e.from) + " &ndash; " + clock(e.to); }

  /* Short human-readable ticket number the guest reads out at the counter. */
  function ticket() {
    var d = new Date();
    return "B" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") +
      "-" + String(Math.floor(Math.random() * 90) + 10);
  }

  /* Where the dish photos live, relative to THIS page. The live site serves the
     home page from / and every other page from a subfolder (/menu/, /vegan/ …),
     so a hardcoded "img/" breaks everywhere but the home page. Derive it from a
     photo already on the page instead. */
  var IMG_BASE = (function () {
    try {
      var el = document.querySelector('img[src*="img/"]');
      if (el) {
        var m = el.getAttribute("src").match(/^(.*?)img\//);
        if (m) return m[1] + "img/";
      }
    } catch (e) {}
    return "img/";
  })();

  /* The pay button is a STUB — no card is charged and nothing reaches Clover or the
     kitchen. It exists so the flow can be reviewed, so it renders only in preview:
     localhost, the design preview host, or ?preview=1. On bannarestaurant.com the
     payment step ends at the card placeholder, which is the honest state until
     POST /order is written. */
  var PREVIEW = /(^localhost$|^127\.|\.claudeusercontent\.com$)/.test(location.hostname) ||
    /[?&]preview=1/.test(location.search);

  /* Real card payment is live only when banna-pay.js loaded AND both the public
     Clover key and the Worker URL are configured. Anything less and we fall back
     to the call-to-order button: a checkout that cannot charge must never look
     like one that can. */
  function LIVE_PAY_NOW() {
    return !!(window.BannaPay && window.BannaPay.ready());
  }

  /* ---------- Online ordering window ----------
     Orders are only taken 11:00 AM - 9:00 PM Dallas time, every day, even though
     the dining room stays open later. Checked in America/Chicago so it is right
     for a guest browsing from another timezone. */
  var ORDER_OPEN_MIN = 11 * 60;      // 11:00 AM
  var ORDER_CLOSE_MIN = 21 * 60;     // 9:00 PM
  var ORDER_HOURS_LABEL = "11am to 9pm";
  function dallasMinutes() {
    try {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago", hour: "numeric", minute: "numeric", hour12: false
      }).formatToParts(new Date());
      var h = 0, m = 0;
      parts.forEach(function (p) {
        if (p.type === "hour") h = parseInt(p.value, 10) % 24;
        if (p.type === "minute") m = parseInt(p.value, 10);
      });
      return h * 60 + m;
    } catch (e) {
      var d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    }
  }
  function orderingOpen() {
    var n = dallasMinutes();
    return n >= ORDER_OPEN_MIN && n < ORDER_CLOSE_MIN;
  }
  function closedNotice() {
    var n = dallasMinutes();
    var when = n < ORDER_OPEN_MIN ? "Online ordering opens at 11am." : "Online ordering closed at 9pm.";
    return '<div class="closed"><strong>' + when + '</strong>' +
      '<span>We take online orders daily ' + ORDER_HOURS_LABEL + ' (Dallas time). ' +
      'The dining room is open later &mdash; call us and we will take care of you.</span>' +
      '<a class="primary" href="tel:+12147580752">Call (214) 758-0752</a></div>';
  }

  function money(n) { return "$" + (Math.round(n * 100) / 100).toFixed(2); }
  function num(p) { if (typeof p === "number") return p; return parseFloat(String(p || "").replace(/[^0-9.]/g, "")) || 0; }
  function read() { try { var r = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(r) ? r : []; } catch (e) { return []; } }
  function write(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  function track(name, params) { try { if (typeof window.gtag === "function") window.gtag("event", name, params || {}); } catch (e) {} }
  function acked() { try { return localStorage.getItem(ACK) === "1"; } catch (e) { return false; } }
  function ack() { try { localStorage.setItem(ACK, "1"); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var instances = [];

  class BannaCart extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      this.cart = read();
      this.step = "cart";
      this.addon = "sides";
      this.openState = false;
      this.name = "";
      this.phone = "";
      this.root = this.attachShadow({ mode: "open" });
      instances.push(this);
      drinkWaiters.push(() => this.render());
      this.render();
      this._sync = (e) => { if (e.key === KEY) { this.cart = read(); this.render(); } };
      window.addEventListener("storage", this._sync);
    }
    disconnectedCallback() {
      window.removeEventListener("storage", this._sync);
      var i = instances.indexOf(this); if (i > -1) instances.splice(i, 1);
    }

    hasDrink() { return this.cart.some(function (l) { return l.drink; }); }
    addonStrip() {
      var tab = this.addon || "sides";
      var loading = tab === "drinks" && DRINKS_STATE === "loading";
      var list = tab === "drinks" ? DRINKS : SIDES;
      var sub = tab === "drinks"
        ? "Coffee, tea, water and sodas"
        : "Injera, gomen, shiro and more &mdash; tap to add";
      return '<div class="drinks">' +
        '<div class="dtabs">' +
        '<button type="button" class="dtab" data-tab="sides" data-on="' + (tab === "sides") + '">Extra sides</button>' +
        '<button type="button" class="dtab" data-tab="drinks" data-on="' + (tab === "drinks") + '">Drinks</button>' +
        '</div>' +
        '<div class="dhead"><span>' + (loading ? "Loading today&rsquo;s beverages&hellip;" : sub) + '</span></div>' +
        '<div class="drow">' + (loading
          ? '<span class="dskel"></span><span class="dskel"></span><span class="dskel"></span>'
          : list.map(function (d) {
              return '<button type="button" class="dchip" data-addon="' + esc(d.name) + '" data-kind="' + tab + '">' +
                '<span class="dn">' + esc(d.name) + '</span>' +
                '<span class="dp">' + money(d.price) + '</span>' +
                '<span class="dplus" aria-hidden="true">+</span></button>';
            }).join("")) +
        '</div></div>';
    }
    count() { return this.cart.reduce(function (n, l) { return n + l.qty; }, 0); }
    subtotal() { return this.cart.reduce(function (n, l) { return n + l.price * l.qty; }, 0); }

    commit(open) {
      write(this.cart);
      if (open != null) this.openState = open;
      if (!this.count() && this.step !== "done") { this.openState = false; this.step = "cart"; }
      instances.forEach(function (el) { if (el !== this) { el.cart = read(); el.render(); } }, this);
      this.render();
    }

    add(item) {
      /* Nothing enters the cart without the guest seeing the animated TO GO ONLY
         strip at the top of the sheet this add opens. */
      this.place(item);
    }
    place(item) {
      var name = item.name, price = num(item.price);
      var found = null;
      for (var i = 0; i < this.cart.length; i++) if (this.cart[i].name === name) found = this.cart[i];
      if (found) found.qty += 1;
      else this.cart.push({ name: name, price: price, img: item.img || "", qty: 1, drink: !!item.drink });
      this.step = "cart";
      track("add_to_cart", { currency: "USD", value: price, items: [{ item_name: name, price: price, quantity: 1 }] });
      this.commit(true);
    }
    bump(name, d) {
      this.cart = this.cart.filter(function (l) {
        if (l.name === name) l.qty += d;
        return l.qty > 0;
      });
      this.commit();
    }
    clear() { this.cart = []; this.commit(false); }
    open() { if (this.count()) { this.step = "cart"; this.commit(true); } }
    close() {
      if (this.step === "done") { this.order = null; this.eta = null; this.step = "cart"; }
      this.commit(false);
    }

    lines() {
      var self = this;
      return this.cart.map(function (l) {
        return '<div class="line">' +
          (l.img ? '<img src="' + IMG_BASE + esc(l.img) + '" alt="" width="56" height="56" loading="lazy">' : '<div class="noimg"></div>') +
          '<div class="lmeta"><span class="lname">' + esc(l.name) + '</span><span class="leach">' + money(l.price) + ' each</span></div>' +
          '<div class="qty"><button type="button" data-dec="' + esc(l.name) + '" aria-label="Remove one ' + esc(l.name) + '">&minus;</button>' +
          '<span>' + l.qty + '</span>' +
          '<button type="button" data-inc="' + esc(l.name) + '" aria-label="Add one ' + esc(l.name) + '">+</button></div>' +
          '<span class="ltot">' + money(l.price * l.qty) + '</span></div>';
      }).join("");
    }

    body() {
      var sub = this.subtotal(), tax = sub * TAX, tot = sub + tax;
      if (this.step === "done") return this.doneBody();
      if (this.step === "cart") {
        return '<div class="lines">' + this.lines() + '</div>' +
          this.addonStrip() +
          '<div class="totals">' +
          '<div class="row"><span>Subtotal</span><span>' + money(sub) + '</span></div>' +
          '<div class="row"><span>Estimated tax</span><span>' + money(tax) + '</span></div>' +
          '<div class="row grand"><span>Total</span><span>' + money(tot) + '</span></div></div>' +
          (orderingOpen()
            ? '<button type="button" class="primary" data-go>Checkout <span aria-hidden="true">&#8594;</span></button>'
            : closedNotice()) +
          '<button type="button" class="quiet" data-clear>Empty cart</button>';
      }
      if (this.step === "details") {
        return '<form data-details>' +
          '<label>Name for the order<input name="cname" required placeholder="First and last name" value="' + esc(this.name) + '"></label>' +
          '<label>Mobile number<input name="cphone" type="tel" required placeholder="(214) 555-0123" value="' + esc(this.phone) + '"></label>' +
          (this.eta ? '<div class="eta"><span class="elab">Ready for pickup</span>' +
            '<span class="etime">' + etaLine(this.eta) + '</span>' +
            '<span class="enote">' + this.eta.lo + '&ndash;' + this.eta.hi + ' minutes' +
            (this.eta.rush ? ' &middot; dinner rush, so a little longer than usual' : '') +
            '</span></div>' : "") +
          '<p class="note">Pickup at 9560 Skillman St #120 &mdash; come to the counter and give your name. No need to wait around: we hold your order hot. We call your number if anything changes.</p>' +
          (orderingOpen()
            ? '<button type="submit" class="primary">Continue to payment &middot; ' + money(tot) + '</button>'
            : closedNotice()) +
          '<button type="button" class="quiet" data-back>Back to cart</button></form>';
      }
      return '<div class="paybox"><div class="payfor">Pickup order for ' + esc(this.name || "you") + '</div><div class="paytot">' + money(tot) + '</div>' +
        (this.eta ? '<div class="payeta">Ready <strong>' + etaLine(this.eta) + '</strong> &middot; ' +
          this.eta.lo + '&ndash;' + this.eta.hi + ' min</div>' : "") + '</div>' +
        (LIVE_PAY_NOW()
          /* Real card fields. The inputs are Clover's own iframes, so no card
             number ever exists in this page's DOM or reaches our server. */
          ? (window.BannaPay.sandbox
              ? '<div class="stub">Clover sandbox &mdash; test cards only. No real money moves.</div>' : '') +
            window.BannaPay.fieldsHtml() +
            '<button type="button" class="primary" data-realpay>Pay ' + money(tot) + '</button>' +
            '<div class="bp-secure"><span aria-hidden="true">&#128274;</span> Card handled by Clover. We never see or store your card number.</div>'
          : '<div class="cardslot"><div class="slotlabel">SECURE CARD FIELD</div>' +
            '<p>Clover&rsquo;s hosted card form drops in here once the backend is connected. The order then lands in your Clover POS and prints in the kitchen.</p></div>' +
            (PREVIEW
              ? '<div class="stub">Preview mode &mdash; the button below takes no payment and sends nothing to the kitchen.</div>' +
                '<button type="button" class="primary" data-pay>Pay ' + money(tot) + ' &middot; preview only</button>'
              : '<a class="primary" href="tel:+12147580752" style="margin-top:16px">Call to place this order &middot; (214) 758-0752</a>')) +
        '<button type="button" class="quiet" data-back>Back to cart</button>';
    }

    doneBody() {
      var o = this.order || {};
      return (o.preview ? '<div class="stub">Preview &mdash; no payment was taken, and the kitchen has no ticket for this. Nothing below is a real order.</div>' : "") +
        '<div class="ok"><div class="okmark" aria-hidden="true">&#10003;</div>' +
        '<h3>Thank you, ' + esc((o.name || "friend").split(" ")[0]) + '</h3>' +
        '<p>' + (o.preview ? "This is what your guest sees once payment is live." : "Your order is in and the kitchen has it.") + '</p></div>' +
        '<div class="rcpt">' +
        '<div class="rrow"><span>Order number</span><strong>' + esc(o.id || "") + '</strong></div>' +
        '<div class="rrow"><span>' + (o.preview ? "Total (not charged)" : "Paid") + '</span><strong>' + money(o.total || 0) + '</strong></div>' +
        (o.last4 ? '<div class="rrow"><span>Card</span><strong>&middot;&middot;&middot;&middot; ' + esc(o.last4) + '</strong></div>' : "") +
        '<div class="rrow"><span>Items</span><strong>' + (o.count || 0) + '</strong></div>' +
        '</div>' +
        (o.eta ? '<div class="eta"><span class="elab">Ready for pickup</span>' +
          '<span class="etime">' + etaLine(o.eta) + '</span>' +
          '<span class="enote">Give the name <strong>' + esc(o.name || "") + '</strong> at the counter. ' +
          'We hold it hot &mdash; no need to arrive early.</span></div>' : "") +
        '<div class="addr"><strong>Banna Restaurant &amp; Bar</strong>' +
        '<span>9560 Skillman St #120, Dallas, TX 75243</span></div>' +
        '<a class="primary" href="https://www.google.com/maps/dir/?api=1&destination=Banna+Restaurant+%26+Bar%2C+9560+Skillman+St+%23120%2C+Dallas%2C+TX+75243" target="_blank" rel="noopener">Get Directions</a>' +
        '<a class="callus" href="tel:+12147580752">Questions? Call (214) 758-0752</a>' +
        '<button type="button" class="quiet" data-close>Done</button>';
    }

    render() {
      var n = this.count(), sub = this.subtotal();
      var done = this.step === "done";
      var titles = { cart: "Your order", details: "Pickup details", pay: "Payment", done: "Order confirmed" };
      var steps = { cart: "STEP 1 OF 3 &middot; REVIEW", details: "STEP 2 OF 3 &middot; YOUR INFO", pay: "STEP 3 OF 3 &middot; PAY", done: "" };
      this.root.innerHTML = '<style>' + BannaCart.css +
        (LIVE_PAY_NOW() ? window.BannaPay.css : "") + '</style>' + (!n && !done ? "" : (!n ? "" :
        '<div class="spacer" aria-hidden="true"></div>' +
        '<div class="bar"><div class="bmeta"><span class="bcount">' + n + (n === 1 ? " item" : " items") + '</span>' +
        '<span class="bsub">Pickup &middot; <strong>TO GO ONLY</strong></span></div>' +
        '<button type="button" class="bview" data-open>View cart <span>' + money(sub) + '</span></button></div>') +
        (!this.openState ? "" :
          '<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-label="Your order">' +
          '<div class="shead"><h2>' + titles[this.step] + '</h2>' +
          '<button type="button" class="x" data-close aria-label="Close cart">&times;</button></div>' +
          (done ? "" : '<div class="steplabel">' + steps[this.step] + '</div>' +
          '<div class="togo">' +
          '<div class="bagwrap" aria-hidden="true">' +
          '<div class="steam"><i></i><i></i><i></i></div>' +
          '<div class="bag"><span class="handle"></span><span class="fold"></span></div>' +
          '<div class="shadow"></div></div>' +
          '<div class="tgtext"><strong>TO GO ONLY</strong>' +
          '<span>Not for dining in. Eating with us today? Your server takes your order at the table.</span></div></div>') +
          this.body() + '</div>'));

      var self = this;
      this.root.querySelectorAll("[data-open]").forEach(function (b) { b.onclick = function () { self.open(); }; });
      this.root.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { self.close(); }; });
      this.root.querySelectorAll("[data-inc]").forEach(function (b) { b.onclick = function () { self.bump(b.getAttribute("data-inc"), 1); }; });
      this.root.querySelectorAll("[data-dec]").forEach(function (b) { b.onclick = function () { self.bump(b.getAttribute("data-dec"), -1); }; });
      this.root.querySelectorAll("[data-tab]").forEach(function (b) {
        b.onclick = function () { self.addon = b.getAttribute("data-tab"); self.render(); };
      });
      this.root.querySelectorAll("[data-addon]").forEach(function (b) {
        b.onclick = function () {
          var nm = b.getAttribute("data-addon"), kind = b.getAttribute("data-kind");
          var src = kind === "drinks" ? DRINKS : SIDES;
          for (var i = 0; i < src.length; i++) if (src[i].name === nm) {
            self.place({ name: src[i].name, price: src[i].price, drink: kind === "drinks" });
          }
        };
      });
      var clear = this.root.querySelector("[data-clear]"); if (clear) clear.onclick = function () { self.clear(); };
      var back = this.root.querySelector("[data-back]"); if (back) back.onclick = function () { self.step = "cart"; self.render(); };
      var pay = this.root.querySelector("[data-pay]");
      if (pay) pay.onclick = function () {
        var sub2 = self.subtotal(), tot2 = Math.round(sub2 * (1 + TAX) * 100) / 100;
        self.order = {
          id: self.orderId || ticket(), name: self.name, phone: self.phone, total: tot2,
          count: self.count(), eta: self.eta || etaWindow(new Date())
        };
        logOrder({
          status: "reached payment",
          id: self.order.id,
          name: self.name,
          phone: self.phone,
          items: self.cart.map(function (l) { return { name: l.name, price: l.price, qty: l.qty }; }),
          count: self.count(),
          total: tot2,
          eta: etaLine(self.order.eta)
        });
        self.order.preview = true;
        /* NOT "purchase": a stub must never land in Google Ads as revenue. The real
           purchase event belongs in the Clover payment-success path. */
        track("purchase_preview", {
          transaction_id: self.order.id, currency: "USD", value: tot2,
          items: self.cart.map(function (l) {
            return { item_name: l.name, price: l.price, quantity: l.qty };
          })
        });
        /* Google Ads conversion for orders taken by our own system. Guarded on
           preview so stub orders never count; fires once real payment is live. */
        if (!self.order.preview && typeof window.bannaConversion === "function") {
          window.bannaConversion((window.BANNA_ADS || {}).internalLabel, {
            value: tot2, currency: "USD", transaction_id: self.order.id
          });
        }
        self.cart = []; self.step = "done"; self.commit(true);
      };
      var go = this.root.querySelector("[data-go]");
      if (go) go.onclick = function () {
        if (!orderingOpen()) { self.render(); return; }
        track("begin_checkout", { currency: "USD", value: Math.round(self.subtotal() * (1 + TAX) * 100) / 100 });
        self.eta = etaWindow(new Date());
        self.step = "details"; self.render();
      };
      /* ---------- Real card payment ---------- */
      if (this.step === "pay" && LIVE_PAY_NOW()) {
        var mroot = this.root;
        window.BannaPay.mount(mroot).catch(function (e) {
          window.BannaPay.showError(mroot, "The card form didn't load. Refresh the page, or call us and we'll take your order by phone.");
          console.error("clover mount failed:", e);
        });
      }

      var realpay = this.root.querySelector("[data-realpay]");
      if (realpay) realpay.onclick = function () {
        if (!orderingOpen()) { self.render(); return; }
        var rootEl = self.root;
        var sub3 = self.subtotal(), tot3 = Math.round(sub3 * (1 + TAX) * 100) / 100;
        var lines = self.cart.map(function (l) { return { name: l.name, price: l.price, qty: l.qty }; });
        var eta = self.eta || etaWindow(new Date());
        var tk = self.orderId || ticket();
        self.orderId = tk;

        /* Locked while the charge is in flight: a second tap is a second charge
           attempt, and the guest cannot tell whether the first one landed. */
        realpay.disabled = true;
        realpay.textContent = "Charging your card\u2026";
        window.BannaPay.showError(rootEl, "");

        window.BannaPay.pay(rootEl, {
          items: lines, name: self.name, phone: self.phone,
          total: tot3, ticket: tk, eta: etaLine(eta)
        }).then(function (res) {
          self.order = {
            id: res.ticket || tk, name: self.name, phone: self.phone,
            total: res.total != null ? res.total : tot3,
            count: self.count(), eta: eta, last4: res.last4 || null,
            preview: false, inPos: res.inPos !== false
          };
          logOrder({
            status: res.inPos === false ? "PAID - not in POS" : "paid",
            id: self.order.id, name: self.name, phone: self.phone,
            items: lines, count: self.order.count, total: self.order.total,
            eta: etaLine(eta)
          });
          /* The real purchase at last: a captured card and a ticket in the POS. */
          track("purchase", {
            transaction_id: self.order.id, currency: "USD", value: self.order.total,
            items: lines.map(function (l) {
              return { item_name: l.name, price: l.price, quantity: l.qty };
            })
          });
          if (typeof window.bannaConversion === "function") {
            window.bannaConversion((window.BANNA_ADS || {}).internalLabel, {
              value: self.order.total, currency: "USD", transaction_id: self.order.id
            });
          }
          self.cart = []; self.step = "done"; self.commit(true);
        }).catch(function (err) {
          /* Nothing is charged on any path that lands here, and the cart is left
             exactly as it was so the guest can retry without rebuilding it. */
          window.BannaPay.showError(rootEl, (err && err.guest) ||
            "We couldn't take the payment. Nothing was charged \u2014 please try again or call (214) 758-0752.");
          realpay.disabled = false;
          realpay.textContent = "Pay " + money(tot3);
          console.error("payment failed:", err);
        });
      };

      var form = this.root.querySelector("[data-details]");
      if (form) form.onsubmit = function (e) {
        e.preventDefault();
        if (!orderingOpen()) { self.render(); return; }
        self.name = form.cname.value; self.phone = form.cphone.value;
        self.orderId = self.orderId || ticket();
        logOrder({
          status: "started",
          id: self.orderId,
          name: self.name,
          phone: self.phone,
          items: self.cart.map(function (l) { return { name: l.name, price: l.price, qty: l.qty }; }),
          count: self.count(),
          total: Math.round(self.subtotal() * (1 + TAX) * 100) / 100,
          eta: self.eta ? etaLine(self.eta) : ""
        });
        /* Reaching the payment step counted as the order conversion only while
           payment was a stub. With real payment live, the conversion fires on the
           confirmed charge instead (see [data-realpay]) — firing in both places
           would double-count every order in Google Ads. */
        if (!LIVE_PAY_NOW() && typeof window.bannaConversion === "function") {
          window.bannaConversion((window.BANNA_ADS || {}).internalLabel, {
            value: Math.round(self.subtotal() * (1 + TAX) * 100) / 100,
            currency: "USD",
            transaction_id: ""
          });
        }
        self.step = "pay"; self.render();
      };
    }
  }

  BannaCart.css = [
    ":host{font-family:'Archivo',system-ui,sans-serif}",
    "*{box-sizing:border-box}",
    ".spacer{height:96px}",
    ".closed{display:flex;flex-direction:column;gap:8px;margin-top:16px;padding:16px 18px;border-radius:16px;background:" + PANEL + ";border:1px solid rgba(27,21,18,.14)}",
    ".closed strong{font:800 15px 'Archivo',system-ui,sans-serif;color:" + INK + "}",
    ".closed span{font:600 13px/1.55 'Archivo',system-ui,sans-serif;color:rgba(27,21,18,.66)}",
    ".closed .primary{margin-top:6px}",
    ".bar{position:fixed;left:0;right:0;bottom:0;z-index:80;display:flex;align-items:center;gap:14px;padding:12px clamp(12px,4vw,20px);padding-bottom:calc(12px + env(safe-area-inset-bottom));background:" + INK + ";box-shadow:0 -8px 24px rgba(27,21,18,.25)}",
    ".bmeta{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
    ".bcount{font-weight:800;font-size:15px;color:" + SAND + ";white-space:nowrap}",
    ".bsub{font-weight:600;font-size:12px;color:rgba(246,235,217,.7);white-space:nowrap}",
    ".bsub strong{font-weight:800;letter-spacing:.08em;color:#F6EBD9}",
    ".bagwrap{position:relative;flex-shrink:0;width:50px;height:58px}",
    ".bag{position:absolute;left:7px;bottom:5px;width:36px;height:40px;border-radius:3px 3px 5px 5px;background:linear-gradient(160deg," + SAND + " 0%,#E8D6B8 100%);box-shadow:inset -6px 0 0 rgba(27,21,18,.07);animation:bagBob 2.6s ease-in-out infinite}",
    ".bag .fold{position:absolute;left:0;right:0;top:0;height:8px;background:#EFDCBC;border-bottom:1px solid rgba(27,21,18,.18);border-radius:2px 2px 0 0}",
    ".bag .handle{position:absolute;left:50%;top:-9px;transform:translateX(-50%);width:19px;height:13px;border:2.5px solid " + SAND + ";border-bottom:none;border-radius:14px 14px 0 0}",
    ".shadow{position:absolute;left:10px;bottom:0;width:30px;height:5px;border-radius:50%;background:rgba(0,0,0,.5);filter:blur(2px);animation:bagShadow 2.6s ease-in-out infinite}",
    ".steam{position:absolute;left:0;right:0;top:0;height:17px;display:flex;justify-content:center;align-items:flex-end;gap:5px}",
    ".steam i{width:3px;height:9px;border-radius:100px;background:rgba(199,69,43,.9);animation:steamUp 2.2s ease-in-out infinite}",
    ".steam i:nth-child(2){height:13px;animation-delay:.35s}",
    ".steam i:nth-child(3){animation-delay:.7s}",
    "@keyframes bagBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}",
    "@keyframes bagShadow{0%,100%{transform:scaleX(1);opacity:.5}50%{transform:scaleX(.82);opacity:.28}}",
    "@keyframes steamUp{0%{transform:translateY(4px) scaleY(.6);opacity:0}40%{opacity:.9}100%{transform:translateY(-9px) scaleY(1.1);opacity:0}}",
    ".togo{display:flex;align-items:center;gap:14px;background:#1B1512;border-radius:14px;padding:12px 16px 12px 12px;margin-bottom:16px}",
    ".tgtext{display:flex;flex-direction:column;gap:3px;min-width:0}",
    ".togo strong{font-weight:800;font-size:13px;letter-spacing:.12em;color:#F6EBD9}",
    ".togo span{font-weight:600;font-size:12.5px;line-height:1.5;color:rgba(246,235,217,.72)}",
    ".bview{display:flex;align-items:center;gap:10px;min-height:48px;padding:13px 22px;border-radius:100px;border:1px solid " + RED_D + ";background:" + RED + ";color:#fff;font:800 15px 'Archivo',system-ui,sans-serif;white-space:nowrap;cursor:pointer}",
    ".bview:hover{background:" + RED_D + "}",
    ".bview span{opacity:.85}",
    ".scrim{position:fixed;inset:0;z-index:90;background:rgba(27,21,18,.55)}",
    ".sheet{position:fixed;left:50%;transform:translateX(-50%);bottom:0;z-index:91;width:min(560px,100%);max-height:90vh;overflow:auto;background:" + CREAM + ";border:1px solid rgba(27,21,18,.14);border-radius:24px 24px 0 0;box-shadow:0 -12px 40px rgba(27,21,18,.3);padding:22px clamp(18px,5vw,26px) calc(24px + env(safe-area-inset-bottom))}",
    ".shead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}",
    ".shead h2{font:700 24px 'Baloo 2',system-ui,sans-serif;margin:0;color:" + INK + "}",
    ".x{width:38px;height:38px;flex-shrink:0;border-radius:50%;border:1px solid rgba(27,21,18,.14);background:#fff;color:" + INK + ";font:700 16px 'Archivo',system-ui,sans-serif;cursor:pointer}",
    ".x:hover{background:" + PANEL + "}",
    ".steplabel{font-weight:600;font-size:12px;letter-spacing:1.4px;color:rgba(27,21,18,.5);margin-bottom:18px}",
    ".lines{display:flex;flex-direction:column;gap:12px;margin-bottom:20px}",
    ".line{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid rgba(27,21,18,.12);border-radius:16px;padding:10px 12px}",
    ".line img,.noimg{width:56px;height:56px;flex-shrink:0;border-radius:12px;object-fit:cover;background:#EFE7DC}",
    ".lmeta{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
    ".lname{font:700 15px 'Baloo 2',system-ui,sans-serif;color:" + INK + ";text-wrap:pretty}",
    ".leach{font-weight:600;font-size:12px;color:rgba(27,21,18,.55)}",
    ".qty{display:flex;align-items:center;gap:6px;flex-shrink:0}",
    ".qty button{width:36px;height:36px;border-radius:50%;border:1px solid rgba(27,21,18,.16);background:" + CREAM + ";color:" + INK + ";font:700 18px 'Archivo',system-ui,sans-serif;line-height:1;cursor:pointer}",
    ".qty button:hover{background:" + PANEL + "}",
    ".qty span{min-width:22px;text-align:center;font-weight:800;font-size:15px;color:" + INK + "}",
    ".ltot{font-weight:800;font-size:15px;color:" + GOLD + ";white-space:nowrap;flex-shrink:0;min-width:64px;text-align:right}",
    ".drinks{background:#fff;border:1px solid rgba(27,21,18,.12);border-radius:16px;padding:14px 15px;margin-bottom:16px}",
    ".dskel{flex:0 0 auto;width:100%;height:46px;border-radius:100px;background:linear-gradient(90deg," + PANEL + " 0%,#E7DDCF 50%," + PANEL + " 100%);background-size:200% 100%;animation:dskel 1.3s linear infinite}",
    "@keyframes dskel{0%{background-position:100% 0}100%{background-position:-100% 0}}",
    ".dwarn{background:#FBF0D6;border:1px solid #E0C078;border-radius:10px;padding:8px 11px;margin-bottom:11px;font-weight:700;font-size:11.5px;line-height:1.45;color:#6B4E12}",
    ".dtabs{display:flex;gap:7px;margin-bottom:9px}",
    ".dtab{flex:1;min-height:40px;padding:10px 12px;border-radius:100px;border:1px solid rgba(27,21,18,.18);background:" + CREAM + ";color:rgba(27,21,18,.6);font:700 13.5px 'Archivo',system-ui,sans-serif;cursor:pointer}",
    ".dtab:hover{background:" + PANEL + "}",
    ".dtab[data-on=\"true\"]{background:" + INK + ";border-color:" + INK + ";color:#F6EBD9}",
    ".dhead{display:flex;flex-direction:column;gap:2px;margin-bottom:10px}",
    ".dhead span{font-weight:600;font-size:12px;color:rgba(27,21,18,.55)}",
    ".drow{display:flex;flex-direction:column;gap:7px;max-height:232px;overflow-y:auto;padding-right:3px;-webkit-overflow-scrolling:touch}",
    ".dchip{display:flex;align-items:center;gap:10px;width:100%;text-align:left;min-height:46px;padding:9px 10px 9px 15px;border-radius:100px;border:1px solid rgba(27,21,18,.18);background:" + CREAM + ";cursor:pointer;font-family:'Archivo',system-ui,sans-serif}",
    ".dchip:hover{background:" + PANEL + ";border-color:rgba(27,21,18,.32)}",
    ".dn{font-weight:700;font-size:13.5px;line-height:1.3;color:" + INK + ";flex:1;min-width:0;text-wrap:pretty}",
    ".dp{font-weight:700;font-size:13.5px;color:" + GOLD + ";white-space:nowrap;flex-shrink:0}",
    ".dplus{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:26px;height:26px;border-radius:50%;background:" + RED + ";color:#fff;font-weight:800;font-size:14px;line-height:1}",
    ".totals{display:flex;flex-direction:column;gap:8px;background:" + PANEL + ";border:1px solid rgba(27,21,18,.12);border-radius:16px;padding:16px 18px;margin-bottom:16px}",
    ".row{display:flex;justify-content:space-between;font-weight:600;font-size:14px;color:" + BROWN + "}",
    ".row.grand{font-weight:800;font-size:18px;color:" + INK + ";border-top:1px solid rgba(27,21,18,.14);padding-top:10px;margin-top:2px}",
    ".primary{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:54px;border-radius:100px;border:1px solid " + RED_D + ";background:" + RED + ";color:#fff;font:800 16px 'Archivo',system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 20px -8px rgba(199,69,43,.75)}",
    ".primary:hover{background:" + RED_D + "}",
    ".quiet{display:block;margin:12px auto 0;background:none;border:none;font:600 13px 'Archivo',system-ui,sans-serif;color:rgba(27,21,18,.5);text-decoration:underline;cursor:pointer}",
    "form{display:flex;flex-direction:column;gap:14px}",
    "label{display:flex;flex-direction:column;gap:6px;font-weight:700;font-size:13px;color:" + INK + "}",
    "input{width:100%;min-height:50px;padding:13px 16px;border-radius:14px;border:1px solid rgba(27,21,18,.2);background:#fff;font:600 15px 'Archivo',system-ui,sans-serif;color:" + INK + "}",
    ".eta{display:flex;flex-direction:column;gap:3px;background:" + INK + ";border-radius:16px;padding:15px 18px}",
    ".enote strong{font-weight:800;color:#F6EBD9}",
    ".elab{font-weight:800;font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(246,235,217,.72)}",
    ".etime{font-weight:800;font-size:26px;letter-spacing:-.01em;color:#F6EBD9}",
    ".enote{font-weight:600;font-size:12.5px;line-height:1.5;color:rgba(246,235,217,.72)}",
    ".payeta{margin-top:10px;padding-top:10px;border-top:1px solid rgba(27,21,18,.12);font-weight:600;font-size:13.5px;color:" + BROWN + "}",
    ".payeta strong{font-weight:800;color:" + INK + "}",
    ".note{font-weight:600;font-size:13px;line-height:1.6;color:rgba(27,21,18,.6);margin:0;text-wrap:pretty}",
    ".stub{background:#FBF0D6;border:1px solid #E0C078;border-radius:12px;padding:11px 13px;margin-bottom:14px;font-weight:700;font-size:12.5px;line-height:1.5;color:#6B4E12;text-wrap:pretty}",
    ".ok{text-align:center;padding:6px 0 18px}",
    ".okmark{width:62px;height:62px;margin:0 auto 14px;border-radius:50%;background:#3E6B2E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:31px;font-weight:800}",
    ".ok h3{font:700 26px 'Baloo 2',system-ui,sans-serif;margin:0 0 5px;color:" + INK + "}",
    ".ok p{font-weight:600;font-size:14.5px;color:rgba(27,21,18,.6);margin:0}",
    ".rcpt{display:flex;flex-direction:column;gap:9px;background:#fff;border:1px solid rgba(27,21,18,.12);border-radius:16px;padding:15px 17px;margin-bottom:12px}",
    ".rrow{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-weight:600;font-size:13.5px;color:rgba(27,21,18,.6)}",
    ".rrow strong{font-weight:800;font-size:15px;color:" + INK + ";letter-spacing:.01em}",
    ".addr{display:flex;flex-direction:column;gap:2px;background:" + PANEL + ";border-radius:14px;padding:13px 16px;margin:12px 0 14px}",
    ".addr strong{font:700 15px 'Baloo 2',system-ui,sans-serif;color:" + INK + "}",
    ".addr span{font-weight:600;font-size:13px;color:" + BROWN + "}",
    "a.primary{text-decoration:none}",
    ".callus{display:block;text-align:center;margin-top:13px;font-weight:700;font-size:13.5px;color:" + GOLD + "}",
    ".paybox{background:#fff;border:1px solid rgba(27,21,18,.14);border-radius:16px;padding:18px;margin-bottom:16px}",
    ".payfor{font:700 15px 'Baloo 2',system-ui,sans-serif;color:" + INK + ";margin-bottom:6px}",
    ".paytot{font-weight:800;font-size:30px;color:" + INK + ";letter-spacing:-.02em}",
    ".cardslot{background:" + PANEL + ";border:1px dashed rgba(27,21,18,.28);border-radius:16px;padding:22px;text-align:center}",
    ".slotlabel{font-weight:800;font-size:13px;letter-spacing:1.4px;color:" + GOLD + ";margin-bottom:8px}",
    ".cardslot p{font-weight:600;font-size:13.5px;line-height:1.6;color:" + BROWN + ";margin:0;text-wrap:pretty}"
  ].join("");

  loadDrinks();

  if (!window.customElements.get("banna-cart")) window.customElements.define("banna-cart", BannaCart);



  window.BannaCart = {
    add: function (item) { var el = instances[0]; if (el) el.add(item); },
    open: function () { var el = instances[0]; if (el) el.open(); },
    count: function () { var el = instances[0]; return el ? el.count() : read().reduce(function (n, l) { return n + l.qty; }, 0); }
  };
})();
