/* Banna — cart wiring the static build cannot carry over.
 *
 * The generated pages come from the .dc.html designs, where every "Add to cart"
 * button has a React onClick. Those handlers do not survive the build, so the
 * markup arrives inert. banna.js already binds dish cards ([data-dish]
 * [data-add]); this file covers the two cases it does not:
 *
 *   1. drink cards — plain <article> elements with no data-dish payload, so the
 *      name, price and photo are read off the card itself.
 *   2. the photo lightbox — its Add button is cloned from the card, so it is
 *      bound when the box opens rather than at load.
 *
 * Load order (all defer, so source order holds):
 *   banna.js  →  banna-cart.js  →  banna-pay.js  →  this file
 */
(function () {
  function txt(el) { return el ? (el.textContent || "").trim() : ""; }
  function hasPrice(s) { return /[0-9]/.test(s || ""); }

  function wireDrinks() {
    var grid = document.querySelector(".drink-grid");
    if (!grid) return;
    var cards = grid.querySelectorAll("article");
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var btn = card.querySelector("button[data-add]");
        if (!btn || btn.getAttribute("data-wired")) return;
        var spans = card.querySelectorAll("span");
        var name = txt(spans[0]);
        var price = txt(spans[1]);
        var img = card.querySelector("img");
        var file = img ? String(img.getAttribute("src") || "").split("/").pop() : "";
        if (!name) return;
        btn.setAttribute("data-wired", "1");
        btn.addEventListener("click", function () {
          if (!window.BannaCart) return;
          window.BannaCart.add({
            name: name,
            price: hasPrice(price) ? price : "",
            img: file,
            drink: true
          });
        });
      })(cards[i]);
    }
  }

  /* banna.js opens the lightbox and looks for [data-lb-add]; the built markup
     has an unmarked button instead, so claim it once the box exists. */
  function wireLightbox() {
    document.addEventListener("click", function () {
      setTimeout(function () {
        var boxes = document.querySelectorAll("[data-lightbox], .lightbox, [role='dialog']");
        for (var i = 0; i < boxes.length; i++) {
          var btns = boxes[i].querySelectorAll("button");
          for (var j = 0; j < btns.length; j++) {
            var b = btns[j];
            if (b.getAttribute("data-wired")) continue;
            if (!/add to cart/i.test(b.textContent || "")) continue;
            b.setAttribute("data-wired", "1");
            b.setAttribute("data-lb-add", "");
          }
        }
      }, 60);
    }, true);
  }

  function start() { wireDrinks(); wireLightbox(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
