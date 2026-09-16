/* Banna site config — the two values Ermmias pastes in once, used by banna-cart.js.

   BANNA_GAS_URL: the Apps Script web-app URL from /orders-sheet/README.md.
     Until it is a real /exec URL the site stores nothing and nothing breaks.

   BANNA_ADS_CONVERSION: the Google Ads conversion label for a completed order,
     in the form "AW-16929805337/AbC-D_efGh". Create it in Google Ads →
     Goals → Conversions → New → Website → "Submit lead form"/"Purchase",
     then copy the send_to value. Empty = no Ads conversion fired (the
     purchase / order_confirmed events still reach GA4). */
window.BANNA_GAS_URL = "GAS_WEBAPP_URL_PLACEHOLDER";
window.BANNA_ADS_CONVERSION = "";
