/* Banna — turns each dish card's Clover link back into an "Add to cart" button.
 *
 * The pages are generated, so this conversion lives in a script rather than in
 * the markup: a rebuild of site/ would wipe hand-edited buttons, but this file
 * survives it. It is the exact mirror of banna-cart-clover-handoff.js, which
 * did the opposite when ordering was handed to Clover.
 *
 * A card whose dish has no price keeps its Clover link — a cart line with no
 * amount cannot be charged, so sending those guests to Clover is the honest
 * outcome rather than a button that fails at the pay step.
 *
 * Load order (all defer, so source order holds):
 *   banna.js  →  banna-cart.js  →  banna-pay.js  →  this file
 */
(function () {
  function dish(card) {
    try { return JSON.parse(card.getAttribute("data-dish") || "{}"); }
    catch (e) { return {}; }
  }
  function priceNum(p) {
    var n = parseFloat(String(p || "").replace(/[^0-9.]/g, ""));
    return isFinite(n) && n > 0 ? n : 0;
  }

  /* Same box, same styling — a change of behaviour, not a restyle. */
  function toAddButton(link, card) {
    var d = dish(card);
    if (!priceNum(d.p)) return;

    var b = document.createElement("button");
    b.type = "button";
    b.className = link.className;
    b.setAttribute("style", link.getAttribute("style") || "");
    b.style.cursor = "pointer";
    b.style.font = b.style.font || "700 15px 'Archivo',system-ui,sans-serif";
    b.setAttribute("data-add", "");
    b.setAttribute("aria-label", "Add " + (d.n || "this dish") + " to your order");

    b.textContent = "Add to cart";
    var span = document.createElement("span");
    span.setAttribute("style", "opacity:.8;font-weight:600");
    span.textContent = "\u00B7 " + d.p;
    b.appendChild(span);

    /* Bound here rather than left to banna.js: that wiring runs once at load,
       before these buttons exist. */
    b.addEventListener("click", function () {
      if (!window.BannaCart) { location.href = link.href; return; }
      window.BannaCart.add({
        name: d.n,
        price: d.p,
        img: String(d.s || "").split("/").pop()
      });
    });

    link.parentNode.replaceChild(b, link);
  }

  function convert() {
    var cards = document.querySelectorAll("[data-dish]");
    for (var i = 0; i < cards.length; i++) {
      var link = cards[i].querySelector('a[href*="cloveronline.com"]');
      if (link) toAddButton(link, cards[i]);
    }
  }

  /* The cart's own bottom bar appears the moment something is in it, in the same
     place as the mobile quick-action bar. Two stacked bars is worse than either:
     while there is an order in progress, the cart bar wins. */
  function watchBars() {
    var mbar = document.querySelector(".m-bar");
    if (!mbar || !window.BannaCart) return;
    var shown = "";
    setInterval(function () {
      var busy = window.BannaCart.count() > 0;
      var want = busy ? "none" : "";
      if (want !== shown) { mbar.style.display = want; shown = want; }
    }, 400);
  }

  function start() { convert(); watchBars(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
