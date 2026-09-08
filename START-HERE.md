# Banna online payments — install order

Two folders, two different places. **Cloudflare first.** The website folder is
harmless on its own (the cart keeps showing the call-to-order button), but it
cannot charge a card until the worker exists and I have its URL.

---

## Step 1 — Cloudflare  (folder: 2-deploy-to-cloudflare)

This is the part that charges cards. It does NOT go on GitHub: GitHub Pages only
serves files, it cannot run a server.

```bash
npm install -g wrangler
wrangler login

cd 2-deploy-to-cloudflare
wrangler secret put CLOVER_TOKEN         # the REST API token
wrangler secret put CLOVER_ECOMM_TOKEN   # the eComm iFrame PRIVATE token
wrangler deploy
```

Wrangler prompts for each token and never writes it to a file. `wrangler.toml`
is already filled in with your MID, tax rate and production setting.

Then open the URL it gives you, with `/health` on the end:

```
https://banna-order.<your-subdomain>.workers.dev/health
→ { "ok": true, "env": "production", "configured": true }
```

- `configured: false` → a secret didn't save. Run the `secret put` again.
- Anything else → send me what you see.

## Step 2 — Send me the URL

I put it into `banna.js` and hand you back that one file. **Skipping this step
means no card form appears.** The site checks for that URL and falls back to the
phone number when it's missing.

## Step 3 — GitHub  (folder: 1-upload-to-github)

Only after step 2. Drop these into your repo, keeping the folder structure — the
paths must land exactly as they are here:

```
banna-pay.js          (new)
banna-cart.js         (replaces)
banna.js              (replaces)
index.html            (replaces)
about/index.html      (replaces)
contact/index.html    (replaces)
faq/index.html        (replaces)
menu/index.html       (replaces)
reviews/index.html    (replaces)
vegan/index.html      (replaces)
```

## Step 4 — One real order

Your Clover token is a production token, so this moves real money.

1. Order one cheap item, on your own phone, on your own card.
2. Check all four: card form appears / charge succeeds / ticket prints in the
   kitchen / order shows **paid** in Clover, not awaiting payment.
3. Refund it in Clover: Transactions → the payment → Refund.

Tell me what happened even if it worked. I expect something to need adjusting on
the first run, most likely the tax total or the paid/unpaid flag.

---

## Before you deploy: rotate your tokens

You showed me the token screens while we worked. I never received either private
token, but if one has been pasted into a chat, an email or a file anywhere, delete
it in Clover and create a new one first. It takes a minute and closes the risk.

## What has not been tested

I wrote and reviewed this code, but no real card has ever gone through it and it
has never touched your live POS. Step 4 is the first genuine test.
