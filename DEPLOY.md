# Deploying bannarestaurant.com

Everything in this `site/` folder IS the website: plain static HTML. No build step, no
framework, no CDN dependency. Open any file in a browser and it works.

## What's in here

```
index.html          menu/index.html      about/index.html
vegan/index.html    reviews/index.html   faq/index.html
contact/index.html  404.html
banna.js            klaviyo-gift.js      img/
robots.txt          sitemap.xml          llms.txt      CNAME
```

`banna.js` (8 KB, no dependencies) handles the language switch, dish filters, photo
lightbox, FAQ accordion and stat counters. Everything else is real HTML in the file —
so Google, Bing and the Google Ads crawler read the full page text with no JavaScript.

## Copy into the repo

Copy the **contents** of `site/` into the root of `banna-restaurant-website`, replacing
what's there. Delete the repo's old `assets/` folder — photos now live in `img/`.

Add a `.gitignore` at the repo root containing:

```
.DS_Store
```

Then in GitHub Desktop: check the changed files → Summary "Launch new site" →
**Commit to main** → **Push origin**.

(The two `.DS_Store` entries in your Changes tab are macOS junk. The .gitignore stops new
ones; to drop the one already tracked, run `git rm --cached .DS_Store` once in Terminal.)

## GitHub Pages settings

Repo → **Settings → Pages**
- Source: **Deploy from a branch**
- Branch: **main**, folder **/ (root)**
- Custom domain: **bannarestaurant.com** (the CNAME file already sets this)
- Tick **Enforce HTTPS**

DNS at your registrar, if not already set:
- `A` records for `@` → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
- `CNAME` for `www` → `<your-github-username>.github.io`

First deploy takes a few minutes; the HTTPS certificate can take up to an hour.

## After it's live

1. Run https://pagespeed.web.dev/ on https://bannarestaurant.com/ (Mobile tab).
2. Submit `https://bannarestaurant.com/sitemap.xml` in Google Search Console.
3. Point your Google Ad's final URL at `https://bannarestaurant.com/`.

GitHub Pages serves gzip and sets cache headers automatically. The remaining optional win
is WebP versions of the photos (~40% smaller at the same sharpness) — ask and I'll add them
with JPEG fallback.

## Google Ads conversions

The base Ads tag (`AW-16929805337`) is already in the `<head>` of all seven pages.
Three conversion actions hang off it; two need their label pasted in.

Labels live in one place: the `window.BANNA_ADS` block near the bottom of `banna.js`.
A label still reading `*_LABEL` simply doesn't fire — nothing breaks.

| Action | Where it fires | Status |
| --- | --- | --- |
| Outbound order click | any link to `cloveronline.com` | live (`LSGDCISaj-ocEJmo4Yg_`) |
| Get Directions | any Google Maps link, all pages | paste `directionsLabel` |
| In-house order | **temporary:** tapping "Continue to payment" | paste `internalLabel` |

The in-house order conversion is deliberately firing one step early — on "Continue to
payment" rather than on a confirmed payment — because the Clover payment backend isn't
connected yet, so reaching that screen is the strongest purchase signal we have. It will
over-count anyone who abandons at the card field. When real payments go live, move that
call from the `[data-details]` submit handler back to the `[data-pay]` handler in
`banna-cart.js`; both spots are commented.

To get a label: Google Ads → **Goals → Conversions** → the action → **Tag setup → Install
manually**. In the snippet's `send_to: 'AW-16929805337/AbC_dEfGhIj'`, the part after the
slash is the label.

### Clover's own thank-you page

Clover checkout runs on `cloveronline.com`, so we can't add a script to its confirmation
page from here. Two ways to count it:

1. **What's live now** — the outbound click to Clover is counted as the conversion. Slightly
   over-counts (some clickers don't finish paying), works today, no Clover access needed.
2. **Exact** — if your Clover online-ordering dashboard has a tracking/analytics snippet
   field, paste this there:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-16929805337"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'AW-16929805337');
  gtag('event', 'conversion', {'send_to': 'AW-16929805337/CLOVER_LABEL'});
</script>
```

   Then switch the outbound-click action in Ads to **Secondary** so the order isn't counted
   twice. If Clover has no such field, option 1 is the ceiling — or use the offline-import
   route already scaffolded in `banna.js` (needs the Apps Script URL, still a placeholder).

## Editing later

The editable sources are the `.dc.html` files one level up. After changing those, the
`site/` folder has to be regenerated from them — ask me to rebuild it; don't hand-edit the
files in `site/`.
