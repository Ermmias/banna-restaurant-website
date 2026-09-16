# Banna Clover API — live menu + real card payments

Two Workers. Both hold your Clover tokens; the website holds none.

| Worker | File | Route | Does |
|---|---|---|---|
| Menu | `banna-menu-worker.js` | `GET /beverages` | Live drink list + prices from Clover inventory |
| Orders | `banna-order-worker.js` | `POST /order` | Charges the card, writes the order into your POS |

The website is static (GitHub Pages), so it cannot keep a secret. These Workers are
the one place that can: your tokens live in Cloudflare's secret store, and the
browser only ever sends a one-time card token, which is worthless to anyone else.

```
guest's card ──▶ Clover's iframe ──token──▶ Worker ──charge──▶ Clover ──▶ your bank
                 (never our page)          (secrets)  ──order──▶ POS ──▶ kitchen print
```

---

## What you have

| Value | Where it goes | Sensitive |
|---|---|---|
| Public token `69bf1c47…63081` | Already in `site/banna.js` | No — safe in the page |
| **Private token** (eComm iFrame) | `CLOVER_ECOMM_TOKEN` secret, by your hand only | **Yes — never in a file or a chat** |
| REST API token ("Banna Website") | `CLOVER_TOKEN` secret, by your hand only | **Yes** |
| MID `526627181880` | Already in `site/banna.js` | No |

If either private token has ever been pasted into a chat, an email, or a file:
delete it in Clover and create a new one. That takes a minute and removes the risk
entirely.

---

## Deploy the order Worker (~10 minutes, free tier)

```bash
npm install -g wrangler
wrangler login

wrangler init banna-order --no-git
# replace the generated src/index.js with api/banna-order-worker.js
```

Set the secrets. Wrangler prompts for each value and never writes it to disk:

```bash
wrangler secret put CLOVER_TOKEN         # the REST API token
wrangler secret put CLOVER_ECOMM_TOKEN   # the eComm iFrame PRIVATE token
```

Put the non-secrets in `wrangler.toml`:

```toml
name = "banna-order"
main = "src/index.js"
compatibility_date = "2026-01-01"

[vars]
CLOVER_MERCHANT_ID = "526627181880"
CLOVER_ENV = "production"   # start here: your token is a production token
TAX_RATE = "0.0825"
```

```bash
wrangler deploy
```

You get a URL like `https://banna-order.<subdomain>.workers.dev`. Check it:

```
https://banna-order.<subdomain>.workers.dev/health
→ { "ok": true, "env": "production", "configured": true }
```

`configured: false` means a secret didn't save. Re-run the `secret put`.

**Then send me the URL.** I put it into `window.BANNA_ORDER_API` and the card form
replaces the call-to-order button on all seven pages. Until that line is set the
site keeps taking orders by phone — nothing half-working ever reaches a guest.

---

## First real order

Your token is production, so the first test moves real money. Do it deliberately:

1. Order one cheap item on your own phone, on your own card.
2. Confirm all four: the card form appears, the charge succeeds, the ticket prints
   in the kitchen, and the order shows as **paid** in Clover (not awaiting payment).
3. Refund it from Clover — Transactions → the payment → Refund.

If step 2 shows the order but marked unpaid, your merchant has no external-payment
tender and the Worker logged it. Tell me and I'll switch the attach method.

---

## What the Worker refuses to do

These are deliberate, and each one is a way a restaurant loses money online.

- **Never trusts the browser's prices.** Every line is re-priced from live Clover
  inventory and the total recomputed server-side. A doctored cart cannot buy a $40
  platter for $4.
- **Refuses unknown items.** If a cart line has no match in Clover inventory the
  order is rejected, not guessed at. Any dish you want sold online must exist in
  Clover with a set price.
- **Refuses a total mismatch.** If Clover's price changed mid-order the guest is
  told to reopen the cart rather than being charged a different number than the one
  they agreed to.
- **Charges once.** An idempotency key derived from the ticket and amount means a
  double-tap or a retry on a bad phone connection cannot bill twice.
- **Caps the order** at $1,000, 40 lines and 120 dishes — above that it's a mistake
  or a card test, and both should reach a human. Every cap is checked *before* the
  charge, so a refusal never costs the guest money.
- **Writes the ticket in one call.** All dishes go to Clover's bulk endpoint
  together, so a kitchen ticket is either complete or absent — never a large order
  printed with half its dishes missing after the card was already charged.
- **Marks every charge `ecomind: "ecom"`.** The wrong value here quietly costs a
  higher interchange rate on every order you take.

If the charge succeeds but the POS write fails, the guest still gets a confirmation
(their money is gone, so their order is real) and the Worker logs
`PAID BUT NOT IN POS` with the ticket and charge id. Watch for it with
`wrangler tail` during the first week — it's the one failure that needs a human.

---

## Things worth knowing before you go live

- **Tax.** The Worker adds 8.25% itself, and Clover applies its own tax config to
  the line items it creates. If your Clover tax rate isn't also 8.25% the POS order
  total won't match the amount charged. Check one order and tell me if it's off.
- **Chargebacks.** Card-not-present orders can be disputed, and you'll lose most
  disputes without a signature. Keeping the name and phone on every ticket (we do)
  is your evidence.
- **Refunds** happen in Clover, not on the website. There's no refund button for
  guests by design.
- **Ordering hours** are enforced in the browser (11 AM–9 PM). A determined person
  could order outside them; if that ever matters, the check belongs in the Worker
  and I'll move it.
- **reCAPTCHA** is on for your iframe token, which is why the MID is passed to the
  Clover SDK. If tokenization starts failing with a captcha error, that pairing is
  the first thing to check.

---

## Menu Worker

Same deploy, `banna-menu-worker.js`, secrets `CLOVER_TOKEN` and
`CLOVER_MERCHANT_ID`. Route `GET /beverages`. Set
`window.BANNA_MENU_API` to its URL and the drink chips go live; until then the cart
shows a placeholder list behind a visible warning. Details in git history — this
file used to cover only that Worker.
