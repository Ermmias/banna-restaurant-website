/* Banna — order handoff to Clover.
 *
 * This file used to be a full in-house cart: line items, drinks, sides, card
 * form, the lot. It was retired on purpose. Keeping prices in sync between the
 * website and the Clover POS proved to be a standing source of failed checkouts
 * — every drift surfaced as a guest being refused at the pay button — and a
 * restaurant should not be running two menus.
 *
 * Clover now owns ordering end to end. This script's only job is the handoff:
 * turn every "Add to cart" button into a link to that exact dish on Clover, and
 * remove what is left of the old cart UI. Photos, descriptions and prices on
 * this site are a menu; the transaction happens where the inventory lives.
 *
 * Each dish card carries its own Clover URL in data-dish ("u"). Cards without
 * one fall back to the full Clover menu rather than a dead link.
 */
(function () {
  var CLOVER_MENU = "https://banna-restaurant.cloveronline.com/menu/all";

  function dishData(card) {
    try { return JSON.parse(card.getAttribute("data-dish") || "{}"); }
    catch (e) { return {}; }
  }

  /* The button and the link must be visually identical — this is a change of
     destination, not a restyle. Copy the styling across and swap the tag. */
  function toCloverLink(btn) {
    var card = btn.closest("[data-dish]");
    var d = card ? dishData(card) : {};
    var href = d.u || CLOVER_MENU;
    var price = d.p || "";

    var a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = btn.className;
    a.setAttribute("style", btn.getAttribute("style") || "");
    a.style.textDecoration = "none";
    a.setAttribute("aria-label", "Order " + (d.n || "this dish") + " on Clover");

    a.textContent = "Order on Clover";
    if (price) {
      var span = document.createElement("span");
      span.setAttribute("style", "font:700 15px 'Archivo'");
      span.textContent = "\u00b7 " + price;
      a.appendChild(span);
    }
    if (btn.parentNode) btn.parentNode.replaceChild(a, btn);
  }

  function convert(root) {
    var btns = (root || document).querySelectorAll("button[data-add]");
    for (var i = 0; i < btns.length; i++) toCloverLink(btns[i]);
  }

  /* Whatever the old cart left on the page: the custom element itself, the
     floating total bar, and any checkout sheet still in the DOM. */
  function removeCartUI() {
    var gone = document.querySelectorAll("banna-cart, [data-banna-cart], .banna-cart-bar");
    for (var i = 0; i < gone.length; i++) {
      if (gone[i].parentNode) gone[i].parentNode.removeChild(gone[i]);
    }
  }

  function init() {
    convert(document);
    removeCartUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* Cards can be re-rendered by the menu filters, which would restore the old
     buttons. Catch those as they appear rather than only converting once. */
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) convert(added[j]);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  /* Anything on the pages that still calls the old API gets sent to Clover
     instead of throwing. */
  window.BannaCart = {
    add: function (item) {
      window.open((item && item.link) || CLOVER_MENU, "_blank", "noopener");
    },
    open: function () { window.open(CLOVER_MENU, "_blank", "noopener"); },
    count: function () { return 0; }
  };
})();
