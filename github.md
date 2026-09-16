repo: Ermmias/banna-restaurant-website
branch: main

## Last sync
date: 2026-09-07T22:24:02Z

### Updated in this project
- Compared `main` against the last sync: no upstream changes, no screens rebuilt.
- Verified all seven DCs match their exported pages under `site/`.
- Still open: `site/banna.js` holds `GAS_WEBAPP_URL_PLACEHOLDER`, and `conversion-tracking/Code.gs` is still absent from the repo.

## Sync history
- 2026-09-03T21:55:29Z — pulled the offline-conversion click logger from repo `banna.js` into `site/banna.js`; confirmed `conversion-tracking/` contains only `README.md`.

## Screen map
| Screen | Built from |
| --- | --- |
| Home | index.dc.html -> site/index.html |
| Menu | Menu.dc.html -> site/menu/index.html |
| Vegan | Vegan.dc.html -> site/vegan/index.html |
| About | About.dc.html -> site/about/index.html |
| Reviews | Reviews.dc.html -> site/reviews/index.html |
| FAQ | FAQ.dc.html -> site/faq/index.html |
| Contact | Contact.dc.html -> site/contact/index.html |
| Site runtime | site/banna.js (mirrors repo-root banna.js) |
