/* Banna order + payment API — Cloudflare Worker.
 *
 * Takes a card token from the browser, charges it through Clover's ecommerce API,
 * then writes the order into the Clover POS so it prints in the kitchen.
 *
 * NEITHER Clover token ever reaches the browser. Both live only in this Worker's
 * secret store. The browser sends a one-time card token (useless on its own) and
 * gets back an order number.
 *
 *   browser ──card──▶ Clover SDK ──token──▶ this Worker ──charge──▶ Clover
 *                                            (secrets)   ──order──▶ POS / kitchen
 *
 * Routes
 *   POST /order    -> { ok, orderId, ticket, total, last4 }
 *   GET  /health   -> { ok: true, configured: bool }
 *
 * Secrets / vars (see README.md)
 *   CLOVER_TOKEN         REST API token — inventory + order creation (secret)
 *   CLOVER_ECOMM_TOKEN   Ecommerce API private token — charges (secret)
 *   CLOVER_MERCHANT_ID   526627181880
 *   CLOVER_ENV           "sandbox" | "production"  (default sandbox — fail safe)
 *   TAX_RATE             optional, default 0.0825
 *   ALLOWED_ORIGINS      optional, comma-separated
 *
 * PRICE AUTHORITY: the browser's prices are never trusted. Every line is re-priced
 * from live Clover inventory and the total is recomputed here. If the client total
 * disagrees by more than a cent the order is REJECTED rather than charged — a guest
 * is never billed an amount they were not shown.
 */

const DEFAULT_ORIGINS = "https://bannarestaurant.com,https://www.bannarestaurant.com";
const DEFAULT_TAX = 0.0825;
const MAX_ITEMS = 40;
const MAX_QTY = 20;
/* Total units per order. The POS write is a single bulk call, so this is a
   sanity bound on one ticket, not a platform limit. */
const MAX_UNITS = 120;
const MAX_TOTAL_CENTS = 100000; /* $1,000 — a to-go order above this is a mistake or fraud */

const HOSTS = {
  sandbox: { api: "https://apisandbox.dev.clover.com", pay: "https://scl-sandbox.dev.clover.com" },
  production: { api: "https://api.clover.com", pay: "https://scl.clover.com" }
};

function hosts(env) {
  return HOSTS[env.CLOVER_ENV === "production" ? "production" : "sandbox"];
}

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim());
  const ok = origin && allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Idempotency-Key",
    "Vary": "Origin"
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {})
  });
}

function cents(n) { return Math.round(Number(n) * 100); }

/* A guest-facing message never leaks Clover internals. Everything else is logged. */
function fail(msg, status, head, detail) {
  if (detail) console.error("order failed:", detail);
  return json({ ok: false, error: msg }, status || 400, head);
}

/* ---------- Clover REST ---------- */

async function clover(env, path, init) {
  const res = await fetch(hosts(env).api + path, Object.assign({}, init, {
    headers: Object.assign({
      Authorization: "Bearer " + env.CLOVER_TOKEN,
      Accept: "application/json",
      "Content-Type": "application/json"
    }, (init && init.headers) || {})
  }));
  const text = await res.text();
  if (!res.ok) throw new Error("clover " + path + " " + res.status + " " + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}

/* Full inventory as a name -> {id, price} map. Cached 10 min at the edge: a busy
   Friday costs a handful of Clover calls, and a price change in the POS reaches
   the checkout within ten minutes. */
async function priceBook(env, ctx) {
  const key = new Request("https://banna.internal/pricebook", { method: "GET" });
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit.json();

  const data = await clover(env, "/v3/merchants/" + env.CLOVER_MERCHANT_ID + "/items?limit=1000");
  const book = {};
  for (const it of (data.elements || [])) {
    if (!it || !it.name || it.hidden || it.available === false) continue;
    if (it.priceType === "VARIABLE" || typeof it.price !== "number") continue;
    book[it.name.trim().toLowerCase()] = { id: it.id, price: it.price, name: it.name.trim() };
  }
  const res = json(book, 200, { "Cache-Control": "public, max-age=600" });
  if (ctx) ctx.waitUntil(cache.put(key, res.clone()));
  return book;
}

/* ---------- Charge ---------- */

async function charge(env, amountCents, cardToken, idemKey, meta) {
  const res = await fetch(hosts(env).pay + "/v1/charges", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.CLOVER_ECOMM_TOKEN,
      "Content-Type": "application/json",
      "Idempotency-Key": idemKey
    },
    body: JSON.stringify({
      amount: amountCents,
      currency: "usd",
      source: cardToken,
      /* "ecom" = card not present, keyed online. Wrong value here costs a higher
         interchange rate on every single order. */
      ecomind: "ecom",
      capture: true,
      description: "Banna online pickup order " + meta.ticket,
      metadata: { ticket: meta.ticket, name: meta.name, phone: meta.phone, channel: "website" }
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    /* Clover's decline messages are guest-safe and more useful than ours. */
    throw Object.assign(new Error(e.message || "charge failed " + res.status), {
      declined: true,
      guest: e.message || "Your card was declined. Try another card, or call us and we'll take the order by phone."
    });
  }
  return body;
}

/* ---------- POS order ---------- */

/* Attaching the payment needs a tender. We want the merchant's external-PAYMENT
   tender so the money shows in Clover reporting as already collected online and
   nobody at the counter charges the card twice. Matched in strict order: a loose
   /external/ match is not good enough, because accounts also carry "External
   Gift Card" and booking card sales against that corrupts reporting. */
async function externalTender(env) {
  const t = await clover(env, "/v3/merchants/" + env.CLOVER_MERCHANT_ID + "/tenders");
  const list = t.elements || [];
  const label = (x) => String(x.label || x.labelKey || "");
  const pick =
    list.find((x) => /^external\s*payment$/i.test(label(x).trim())) ||
    list.find((x) => /external/i.test(label(x)) && /payment/i.test(label(x))) ||
    list.find((x) => /external/i.test(label(x)) && !/gift|debit/i.test(label(x)));
  return pick ? pick.id : null;
}

async function writeOrder(env, lines, totals, meta, chargeInfo) {
  const mid = "/v3/merchants/" + env.CLOVER_MERCHANT_ID;

  const order = await clover(env, mid + "/orders", {
    method: "POST",
    body: JSON.stringify({
      state: "open",
      title: "WEB " + meta.ticket,
      note: [
        "ONLINE PICKUP — PAID",
        meta.ticket,
        meta.name,
        meta.phone,
        meta.eta ? "Ready " + meta.eta : ""
      ].filter(Boolean).join(" · ")
    })
  });

  /* Every unit in ONE bulk call. Posting line items one at a time would spend a
     subrequest per unit against the Worker's per-request cap, and a big family or
     catering order would throw partway — printing a ticket missing an
     unpredictable number of dishes, after the card was already charged. One call
     means the ticket is either complete or absent, never half. */
  const units = [];
  for (const l of lines) {
    for (let i = 0; i < l.qty; i++) {
      units.push(l.id ? { item: { id: l.id } } : { name: l.name, price: l.price });
    }
  }

  try {
    await clover(env, mid + "/orders/" + order.id + "/bulk_line_items", {
      method: "POST",
      body: JSON.stringify({ items: units })
    });
  } catch (e) {
    /* An order with no dishes on it is worse than no order: it prints a blank
       ticket and hides the problem. Remove it and let the caller log loudly. */
    try {
      await clover(env, mid + "/orders/" + order.id, { method: "DELETE" });
    } catch (e2) {
      console.error("could not delete empty order " + order.id + ":", String(e2.message || e2));
    }
    throw e;
  }

  /* Best effort: the money is already captured, so a failure here must never
     surface to the guest as a failed order. It surfaces in the logs instead. */
  try {
    const tender = await externalTender(env);
    if (tender) {
      await clover(env, mid + "/orders/" + order.id + "/payments", {
        method: "POST",
        body: JSON.stringify({
          amount: totals.total,
          tender: { id: tender },
          externalPaymentId: chargeInfo.id || meta.ticket
        })
      });
    } else {
      console.error("no external tender on merchant; order " + order.id + " left unpaid in POS");
    }
  } catch (e) {
    console.error("payment attach failed for order " + order.id + ":", String(e.message || e));
  }

  return order;
}

/* ---------- Route ---------- */

async function handleOrder(request, env, ctx, head) {
  let body;
  try { body = await request.json(); } catch (e) { return fail("Bad request.", 400, head); }

  const items = Array.isArray(body.items) ? body.items : [];
  const name = String(body.name || "").trim().slice(0, 80);
  const phone = String(body.phone || "").trim().slice(0, 32);
  const cardToken = String(body.cardToken || "").trim();

  if (!items.length) return fail("Your cart is empty.", 400, head);
  if (items.length > MAX_ITEMS) return fail("That's a large order — please call us so we can get it right.", 400, head);
  if (!name) return fail("We need a name for the order.", 400, head);
  if (phone.replace(/\D/g, "").length < 10) return fail("Please enter a mobile number we can reach you on.", 400, head);
  if (!cardToken) return fail("Card details are incomplete.", 400, head);

  /* Re-price every line from Clover. An unknown item is a hard stop: it means the
     website and the POS disagree, and guessing a price is worse than refusing. */
  const book = await priceBook(env, ctx);
  const lines = [];
  let subtotal = 0;
  let units = 0;
  for (const raw of items) {
    const nm = String((raw && raw.name) || "").trim();
    const qty = Math.max(1, Math.min(MAX_QTY, Math.round(Number(raw && raw.qty) || 1)));
    const found = book[nm.toLowerCase()];
    if (!found) return fail("\u201C" + nm + "\u201D isn't available right now. Please call us to order it.", 409, head, "unpriced item: " + nm);
    lines.push({ id: found.id, name: found.name, price: found.price, qty: qty });
    subtotal += found.price * qty;
    units += qty;
  }

  /* Checked BEFORE the charge: every refusal has to happen while the guest still
     has their money. */
  if (units > MAX_UNITS) return fail("That's a big order \u2014 please call us so we can get it right.", 400, head, "unit cap: " + units);

  const rate = Number(env.TAX_RATE || DEFAULT_TAX);
  const tax = Math.round(subtotal * rate);
  const total = subtotal + tax;

  if (total > MAX_TOTAL_CENTS) return fail("Please call us for an order this size.", 400, head);

  /* The guest must be charged exactly what the page showed them. */
  const claimed = cents(body.total);
  if (claimed && Math.abs(claimed - total) > 1) {
    return fail(
      "Our prices changed while you were ordering. Please reopen your cart to see the current total.",
      409, head, "total mismatch: client " + claimed + " vs server " + total
    );
  }

  const ticket = String(body.ticket || "").trim().slice(0, 24) || "WEB-" + Date.now().toString(36).toUpperCase();
  const meta = { ticket, name, phone, eta: String(body.eta || "").slice(0, 40) };

  /* Idempotency: a double-tap or a retry on a flaky phone connection must not
     charge twice. Same cart + same ticket = same key = one charge at Clover. */
  const idemKey = request.headers.get("Idempotency-Key") || (ticket + ":" + total);

  let paid;
  try {
    paid = await charge(env, total, cardToken, idemKey, meta);
  } catch (e) {
    if (e.declined) return fail(e.guest, 402, head, e.message);
    return fail("We couldn't process the payment. Nothing was charged — please try again or call us.", 502, head, String(e.message || e));
  }

  /* Money is captured from here on. The guest's order is real no matter what
     fails next, so we always return ok and log the rest. */
  let orderId = null;
  try {
    const order = await writeOrder(env, lines, { subtotal, tax, total }, meta, paid);
    orderId = order.id;
  } catch (e) {
    console.error("PAID BUT NOT IN POS — ticket " + ticket + " charge " + (paid.id || "?") + ":", String(e.message || e));
  }

  return json({
    ok: true,
    ticket: ticket,
    orderId: orderId,
    chargeId: paid.id || null,
    total: total / 100,
    subtotal: subtotal / 100,
    tax: tax / 100,
    last4: (paid.source && paid.source.last4) || null,
    inPos: !!orderId
  }, 200, head);
}

/* Temporary diagnostic. Reports whether each Clover call the order path depends on
   actually works, without revealing any secret or customer data. Remove once the
   first real order has gone through. */
async function selftest(env) {
  const mid = "/v3/merchants/" + env.CLOVER_MERCHANT_ID;
  const out = { env: env.CLOVER_ENV === "production" ? "production" : "sandbox", api: hosts(env).api, pay: hosts(env).pay };

  /* Shape only — never the values. Catches the common causes of a 401: a token
     pasted with stray whitespace, a truncated copy, or the two tokens swapped
     between the REST slot and the ecommerce slot. */
  const shape = (v) => {
    const s = String(v || "");
    return {
      length: s.length,
      trimmedLength: s.trim().length,
      hasWhitespace: s !== s.trim(),
      looksLikeUuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim()),
      isHex32: /^[0-9a-f]{32}$/i.test(s.trim())
    };
  };
  out.tokenShape = {
    rest: shape(env.CLOVER_TOKEN),
    ecomm: shape(env.CLOVER_ECOMM_TOKEN),
    identical: String(env.CLOVER_TOKEN || "") === String(env.CLOVER_ECOMM_TOKEN || "")
  };

  /* Cheapest possible REST call. If this 401s the token is simply not valid for
     this merchant; if it succeeds and /items 401s, it is a permissions problem. */
  try {
    const m = await clover(env, mid);
    out.merchant = { ok: true, name: m.name || null };
  } catch (e) {
    out.merchant = { ok: false, error: String(e.message || e).slice(0, 200) };
  }

  try {
    const d = await clover(env, mid + "/items?limit=1000");
    const all = d.elements || [];
    const priced = all.filter((i) => i && i.name && !i.hidden && i.available !== false &&
      i.priceType !== "VARIABLE" && typeof i.price === "number");
    out.inventory = { ok: true, total: all.length, sellable: priced.length,
      sample: priced.slice(0, 8).map((i) => i.name + " $" + (i.price / 100).toFixed(2)) };
  } catch (e) {
    out.inventory = { ok: false, error: String(e.message || e).slice(0, 300) };
  }

  try {
    const t = await clover(env, mid + "/tenders");
    const list = t.elements || [];
    const chosen = await externalTender(env);
    const match = list.find((x) => x.id === chosen);
    out.tenders = { ok: true, count: list.length,
      willUse: match ? (match.label || match.labelKey) : null,
      labels: list.map((x) => x.label || x.labelKey) };
  } catch (e) {
    out.tenders = { ok: false, error: String(e.message || e).slice(0, 300) };
  }

  /* Does the ecommerce token authenticate at all? A deliberately invalid card
     token: "declined/invalid source" proves the credential works, whereas 401
     means the token itself is wrong. No money can move either way. */
  try {
    const r = await fetch(hosts(env).pay + "/v1/charges", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.CLOVER_ECOMM_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100, currency: "usd", source: "clv_selftest_invalid", ecomind: "ecom" })
    });
    const b = await r.text();
    out.ecommToken = { httpStatus: r.status, authOk: r.status !== 401 && r.status !== 403,
      reply: b.slice(0, 300) };
  } catch (e) {
    out.ecommToken = { ok: false, error: String(e.message || e).slice(0, 300) };
  }

  return out;
}

/* Public price list: name -> price, for every sellable Clover item. The cart reads
   this so the price a guest sees is the price Clover will charge, and an item the
   POS doesn't have is shown as unavailable rather than failing at payment. Names
   and prices only — the same thing already printed on the menu. */
async function prices(env, ctx) {
  const book = await priceBook(env, ctx);
  const out = {};
  for (const k in book) out[book[k].name] = book[k].price / 100;
  return { items: out, count: Object.keys(out).length, fetchedAt: new Date().toISOString() };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const head = cors(origin, env);
    const { pathname, searchParams } = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: head });

    if (pathname === "/health") {
      return json({
        ok: true,
        env: env.CLOVER_ENV === "production" ? "production" : "sandbox",
        configured: !!(env.CLOVER_TOKEN && env.CLOVER_ECOMM_TOKEN && env.CLOVER_MERCHANT_ID)
      }, 200, head);
    }

    if (pathname === "/prices") {
      if (!env.CLOVER_TOKEN || !env.CLOVER_MERCHANT_ID) return json({ items: {}, error: "not configured" }, 503, head);
      try {
        return json(await prices(env, ctx), 200,
          Object.assign({ "Cache-Control": "public, max-age=600" }, head));
      } catch (e) {
        /* An empty list is safe: the cart treats "no price" as not orderable
           online and keeps the phone number, rather than guessing. */
        return json({ items: {}, error: String(e.message || e).slice(0, 200) }, 502, head);
      }
    }

    /* /namecheck?names=A|B|C — the cart prices each line by matching its name
       against Clover inventory. This reports, for a list of website dish names,
       which ones Clover can price and which would be rejected at checkout.
       Diagnostic only; remove alongside /selftest. */
    if (pathname === "/namecheck") {
      if (!env.CLOVER_TOKEN || !env.CLOVER_MERCHANT_ID) {
        return json({ error: "not configured" }, 500, head);
      }
      try {
        const raw = (searchParams.get("names") || "").split("|").map(s => s.trim()).filter(Boolean);
        const d = await clover(env, "/v3/merchants/" + env.CLOVER_MERCHANT_ID + "/items?limit=1000");
        const live = (d.elements || []).filter(i => i && i.name && !i.hidden && i.available !== false);
        const key = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
        const byKey = new Map(live.map(i => [key(i.name), i]));
        const report = raw.map(n => {
          const exact = byKey.get(key(n));
          if (exact) return { site: n, match: exact.name, clover: (exact.price || 0) / 100, how: "exact" };
          const k = key(n);
          const near = live.filter(i => { const ik = key(i.name); return ik.includes(k) || k.includes(ik); })
            .slice(0, 4).map(i => i.name + " $" + ((i.price || 0) / 100).toFixed(2));
          return { site: n, match: null, how: "NO MATCH", didYouMean: near };
        });
        return json({ checked: report.length,
          matched: report.filter(r => r.match).length,
          unmatched: report.filter(r => !r.match).length, report }, 200, head);
      } catch (e) {
        return json({ error: String(e.message || e).slice(0, 400) }, 500, head);
      }
    }

    if (pathname === "/selftest") {
      if (!env.CLOVER_TOKEN || !env.CLOVER_ECOMM_TOKEN || !env.CLOVER_MERCHANT_ID) {
        return json({ error: "not configured" }, 500, head);
      }
      try {
        return json(await selftest(env), 200, head);
      } catch (e) {
        return json({ error: String(e.stack || e).slice(0, 600) }, 500, head);
      }
    }

    if (pathname !== "/order") return json({ ok: false, error: "not found" }, 404, head);
    if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405, head);

    if (!env.CLOVER_TOKEN || !env.CLOVER_ECOMM_TOKEN || !env.CLOVER_MERCHANT_ID) {
      return fail("Online payment isn't switched on yet. Please call us to order.", 503, head,
        "worker not configured: need CLOVER_TOKEN, CLOVER_ECOMM_TOKEN, CLOVER_MERCHANT_ID");
    }

    try {
      return await handleOrder(request, env, ctx, head);
    } catch (e) {
      return fail("Something went wrong. Nothing was charged — please try again or call us.", 500, head, String(e.stack || e));
    }
  }
};
