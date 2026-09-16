/* Banna menu API — Cloudflare Worker.
 *
 * Serves the live Beverages category from Clover to the website's cart, so the
 * drink list and prices always match the POS and nothing has to be typed twice.
 *
 * The Clover API token NEVER reaches the browser. It lives only in this Worker's
 * secret store, and the Worker returns nothing but names and prices.
 *
 * Routes
 *   GET /beverages   -> { items: [{ id, name, price }], source: "clover", fetchedAt }
 *   GET /health      -> { ok: true }
 *
 * Secrets / vars (set with `wrangler secret put`, see README.md)
 *   CLOVER_TOKEN         Clover API token (secret)
 *   CLOVER_MERCHANT_ID   526627181880
 *   CLOVER_BASE          optional, defaults to https://api.clover.com
 *   ALLOWED_ORIGINS      optional, comma-separated. Defaults to the live site.
 */

const DEFAULT_ORIGINS = "https://bannarestaurant.com,https://www.bannarestaurant.com";
const CATEGORY_MATCH = /bever|drink/i;
const CACHE_SECONDS = 600;

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim());
  const ok = origin && allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {})
  });
}

/* Clover returns money in cents; a variable-price item has priceType "VARIABLE". */
function mapItems(items) {
  return (items || [])
    .filter((it) => it && it.name && !it.hidden && it.available !== false)
    .filter((it) => it.priceType !== "VARIABLE" && typeof it.price === "number" && it.price > 0)
    .map((it) => ({ id: it.id, name: it.name.trim(), price: Math.round(it.price) / 100 }))
    .sort((a, b) => a.price - b.price);
}

async function beverages(env) {
  const base = env.CLOVER_BASE || "https://api.clover.com";
  const url = base + "/v3/merchants/" + env.CLOVER_MERCHANT_ID +
    "/categories?expand=items&limit=100";

  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + env.CLOVER_TOKEN, Accept: "application/json" }
  });
  if (!res.ok) throw new Error("clover " + res.status + " " + (await res.text()).slice(0, 200));

  const data = await res.json();
  const cats = (data && data.elements) || [];
  const cat = cats.find((c) => c && CATEGORY_MATCH.test(c.name || ""));
  if (!cat) throw new Error("no beverage category found in Clover inventory");

  return {
    category: cat.name,
    items: mapItems(cat.items && cat.items.elements),
    source: "clover",
    fetchedAt: new Date().toISOString()
  };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const head = cors(origin, env);
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: head });
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405, head);
    if (pathname === "/health") return json({ ok: true }, 200, head);
    if (pathname !== "/beverages") return json({ error: "not found" }, 404, head);

    if (!env.CLOVER_TOKEN || !env.CLOVER_MERCHANT_ID) {
      return json({ error: "worker not configured: set CLOVER_TOKEN and CLOVER_MERCHANT_ID" }, 500, head);
    }

    /* Edge cache: one Clover call per 10 minutes per data centre. */
    const key = new Request(new URL(request.url).origin + "/beverages", { method: "GET" });
    const cache = caches.default;
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body, { status: 200, headers: Object.assign(Object.fromEntries(hit.headers), head) });

    try {
      const payload = await beverages(env);
      const res = json(payload, 200, Object.assign({ "Cache-Control": "public, max-age=" + CACHE_SECONDS }, head));
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (err) {
      /* Never break the cart: the site falls back to its own list on any error. */
      return json({ error: String(err.message || err), items: [] }, 502, head);
    }
  }
};
