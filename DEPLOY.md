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

## Editing later

The editable sources are the `.dc.html` files one level up. After changing those, the
`site/` folder has to be regenerated from them — ask me to rebuild it; don't hand-edit the
files in `site/`.
