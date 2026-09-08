/* Restores the Get Directions button in the sticky header, which the exported
   static HTML dropped. Dish cards keep their existing "Order this dish"
   Clover link as the only CTA. Additive and idempotent, so a re-export
   can't double it up. */
(function () {
  var MAPS = "https://www.google.com/maps/dir/?api=1&destination=Banna+Restaurant+%26+Bar%2C+9560+Skillman+St+%23120%2C+Dallas%2C+TX+75243";
  var INK = "#1B1512";

  function directions() {
    var nav = document.querySelector("nav");
    if (!nav || nav.querySelector("[data-directions]")) return;
    var a = document.createElement("a");
    a.href = MAPS;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("data-directions", "1");
    a.style.cssText = "display:inline-flex;align-items:center;gap:7px;background:#FFFFFF;color:" + INK +
      ";font:600 13px 'Archivo';padding:9px 16px;border-radius:100px;border:1px solid rgba(27,21,18,0.22);white-space:nowrap;text-decoration:none";
    a.innerHTML = '<span aria-hidden="true" style="font-size:14px;line-height:1">\u27A4</span><span>Get Directions</span>';
    a.addEventListener("click", function () {
      try { if (typeof window.gtag === "function") window.gtag("event", "get_directions", { source: "header" }); } catch (e) {}
    });
    var lang = nav.querySelector(".lang-switch");
    if (lang && lang.parentNode) lang.parentNode.insertBefore(a, lang);
    else nav.appendChild(a);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", directions);
  else directions();
})();
