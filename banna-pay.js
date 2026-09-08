/* Banna — Clover hosted card field + real order submission.
 *
 * Loads Clover's SDK, mounts its iframe card fields into the payment step, turns
 * the card into a one-time token, and posts that token plus the cart to the Worker
 * in /api/banna-order-worker.js. Card data never touches this file, this site, or
 * our server: the inputs the guest types into are Clover's own iframes.
 *
 * Activates only when BOTH are set (in each page's <helmet>, before this script):
 *   window.BANNA_CLOVER_KEY = "pk_...";                  // public PAKMS key
 *   window.BANNA_ORDER_API  = "https://....workers.dev"; // the Worker
 * Until then window.BannaPay.ready() is false and the cart keeps showing the
 * call-to-order button — an unconfigured checkout must never look like it works.
 */
(function () {
  "use strict";

  var KEY = window.BANNA_CLOVER_KEY || "";
  var MID = window.BANNA_CLOVER_MID || "";
  var API = (window.BANNA_ORDER_API || "").replace(/\/$/, "");
  var SDK = "https://checkout.clover.com/sdk.js";
  var SDK_SANDBOX = "https://checkout.sandbox.dev.clover.com/sdk.js";
  /* A key issued in sandbox cannot charge in production and vice versa; the SDK
     origin has to match the key. Sandbox keys are the ones marked as such. */
  var SANDBOX = /sandbox/i.test(KEY) || window.BANNA_CLOVER_SANDBOX === true;

  var sdkPromise = null;
  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      if (window.Clover) return resolve(window.Clover);
      var s = document.createElement("script");
      s.src = SANDBOX ? SDK_SANDBOX : SDK;
      s.async = true;
      s.onload = function () {
        window.Clover ? resolve(window.Clover) : reject(new Error("SDK loaded but Clover missing"));
      };
      s.onerror = function () { reject(new Error("could not load Clover SDK")); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  /* Clover styles its iframes from a style object we pass in, so the card fields
     have to be re-declared here to match the cart's own inputs. */
  var FIELD_STYLES = {
    body: { fontFamily: "'Archivo', system-ui, sans-serif", fontSize: "16px" },
    input: {
      fontFamily: "'Archivo', system-ui, sans-serif",
      fontSize: "16px",
      color: "#1B1512",
      padding: "13px 14px",
      background: "#FFFFFF",
      border: "1.5px solid rgba(27,21,18,.18)",
      borderRadius: "12px",
      lineHeight: "1.3"
    },
    "input:focus": { border: "1.5px solid #C7452B", outline: "none" },
    "input::placeholder": { color: "rgba(27,21,18,.38)" },
    img: { display: "none" }
  };

  /* Clover's mount() takes a CSS SELECTOR and resolves it with
     document.querySelector — it cannot see into a shadow root. The cart's modal
     lives in one, so the fields are built in the light DOM (where Clover can find
     them) and projected into the modal through a <slot>. Their styles have to go
     in the document too: shadow CSS does not cross a slot boundary. */
  var LIGHT_ID = "banna-card-fields";
  var SEL = {
    CARD_NUMBER: "#bp-number", CARD_DATE: "#bp-date",
    CARD_CVV: "#bp-cvv", CARD_POSTAL_CODE: "#bp-zip"
  };

  var FIELDS = [
    { key: "CARD_NUMBER", label: "Card number" },
    { key: "CARD_DATE", label: "Expiry" },
    { key: "CARD_CVV", label: "CVC" },
    { key: "CARD_POSTAL_CODE", label: "ZIP" }
  ];

  var state = { clover: null, elements: null, mounted: false, errors: {} };

  /* The markup the cart drops into its payment step. Clover mounts an iframe into
     each empty div; we own the labels and the layout around them. */
  function fieldsHtml() {
    return '<div class="bp-fields">' +
      '<div class="bp-row"><label for="bp-number">Card number</label><div id="bp-number" class="bp-slot"></div></div>' +
      '<div class="bp-grid">' +
      '<div class="bp-row"><label for="bp-date">Expiry</label><div id="bp-date" class="bp-slot"></div></div>' +
      '<div class="bp-row"><label for="bp-cvv">CVC</label><div id="bp-cvv" class="bp-slot"></div></div>' +
      '<div class="bp-row"><label for="bp-zip">ZIP</label><div id="bp-zip" class="bp-slot"></div></div>' +
      '</div>' +
      '<div class="bp-err" data-bp-error role="alert" aria-live="polite"></div>' +
      '</div>';
  }

  var CSS = [
    ".bp-fields{display:flex;flex-direction:column;gap:12px;margin-top:14px}",
    ".bp-row{display:flex;flex-direction:column;gap:6px;min-width:0}",
    ".bp-row label{font:700 12px 'Archivo',system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:rgba(27,21,18,.6)}",
    /* Clover's iframes default to 150px tall — they reserve room for their own
       inline error text, which we don't use (field errors surface in .bp-err
       instead, from the change events). Clamp them to input height so the form
       reads as four fields rather than four empty panels. */
    ".bp-slot{height:50px;overflow:hidden}",
    ".bp-slot iframe{width:100%!important;height:50px!important;border:0;display:block}",
    ".bp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}",
    ".bp-err{display:none;font:600 13px/1.5 'Archivo',system-ui,sans-serif;color:#A93720}",
    ".bp-err.on{display:block}",
    ".bp-secure{display:flex;align-items:center;gap:7px;margin-top:10px;font:600 12px 'Archivo',system-ui,sans-serif;color:rgba(27,21,18,.55)}",
    "@media (max-width:400px){.bp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}"
  ].join("");

  /* Mount into the light DOM, once. The container is a child of the <banna-cart>
     element rather than its shadow root, so it survives the cart re-rendering its
     own markup and the iframes are never torn down mid-payment. */
  function injectCss() {
    if (document.getElementById("banna-pay-css")) return;
    var s = document.createElement("style");
    s.id = "banna-pay-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function container(hostEl) {
    var c = document.getElementById(LIGHT_ID);
    if (!c) {
      c = document.createElement("div");
      c.id = LIGHT_ID;
      c.setAttribute("slot", "cardfields");
      c.innerHTML = fieldsHtml();
      hostEl.appendChild(c);
    } else if (c.parentNode !== hostEl) {
      hostEl.appendChild(c);
    }
    return c;
  }

  function mount(hostEl) {
    injectCss();
    var box = container(hostEl);
    if (state.mounted) return Promise.resolve(box);
    return loadSdk().then(function (Clover) {
      if (!state.clover) {
        /* The merchant id is required whenever reCAPTCHA is switched on for the
           iframe token (Ecommerce API Tokens > Recaptcha Settings). Without it
           createToken() fails the captcha check and no card can be entered. */
        state.clover = MID ? new Clover(KEY, { merchantId: MID }) : new Clover(KEY);
      }
      var elements = state.clover.elements();
      FIELDS.forEach(function (f) {
        var el = elements.create(f.key, FIELD_STYLES);
        el.mount(SEL[f.key]);
        el.addEventListener("change", function (ev) {
          state.errors[f.key] = (ev && ev.error) || "";
          showError(hostEl, "");
        });
      });
      state.elements = elements;
      state.mounted = true;
      return box;
    });
  }

  function showError(hostEl, msg) {
    var box = document.querySelector("#" + LIGHT_ID + " [data-bp-error]");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("on", !!msg);
  }

  /* Turn the card into a token. Clover validates the fields and hands back either
     a token or per-field errors. */
  function token(root) {
    if (!state.clover) return Promise.reject(new Error("card field not ready"));
    return state.clover.createToken().then(function (res) {
      if (res && res.errors) {
        var first = Object.keys(res.errors).map(function (k) { return res.errors[k]; })[0];
        throw Object.assign(new Error(first || "Check your card details."), { guest: first || "Check your card details." });
      }
      if (!res || !res.token) throw Object.assign(new Error("no token"), { guest: "Check your card details." });
      return res.token;
    });
  }

  /* Post the order. The idempotency key is stable for a given cart + ticket, so a
     double-tap or a retry on a bad connection cannot charge the guest twice. */
  function submit(payload) {
    if (!API) return Promise.reject(Object.assign(new Error("no order API"), { guest: "Online payment isn't switched on yet. Please call us to order." }));
    return fetch(API + "/order", {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": (payload.ticket || "") + ":" + Math.round(Number(payload.total) * 100)
      },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok || !body.ok) {
          throw Object.assign(new Error(body.error || "order failed " + r.status), {
            guest: body.error || "We couldn't complete the order. Nothing was charged \u2014 please try again or call us."
          });
        }
        return body;
      });
    }, function () {
      throw Object.assign(new Error("network"), { guest: "You look offline. Nothing was charged \u2014 check your connection and try again." });
    });
  }

  window.BannaPay = {
    ready: function () { return !!(KEY && API); },
    sandbox: SANDBOX,
    css: CSS,
    fieldsHtml: fieldsHtml,
    mount: mount,
    token: token,
    submit: submit,
    showError: showError,
    /* One call for the cart: tokenize, then charge. Rejects with .guest set to a
       message that is safe and useful to show a customer. */
    pay: function (root, payload) {
      return token(root).then(function (t) {
        return submit(Object.assign({}, payload, { cardToken: t }));
      });
    }
  };
})();
