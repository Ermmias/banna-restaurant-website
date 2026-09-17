repo: Ermmias/banna-restaurant-website
branch: main

## Last sync
date: 2026-09-17T18:05:00Z

### Updated in this project
- One ordering path: every dish and drink card is "+ Add to cart"; the parallel Clover menu links were removed (Clover stays as checkout and as the "full ordering menu" overflow link).
- Unpriced dishes are addable and read "At pickup" / "Priced at pickup" in the cart, with a note that they join the total on confirmation.
- Cart bar is fixed-position (no more 96px blank band at the top of pages) and sits above the Klaviyo widgets, which step up out of its way.
- New banna-config.js holds BANNA_GAS_URL (order capture to a private Google Sheet) and BANNA_ADS_CONVERSION; confirmation screen fires order_confirmed once per order.
- Home page: symmetrical hero buttons, food slide removed, "3 Most Ordered Dishes" with popping cards, no bottom action bar; nav is a frosted transparent bar (logo + More, Directions on home only) with a scrollable More panel.

## Screen map
| Screen | Built from |
| --- | --- |
| Home | index.dc.html -> index.html |
| Menu | Menu.dc.html -> menu/index.html |
| Vegan | Vegan.dc.html -> vegan/index.html |
| About | About.dc.html -> about/index.html |
| FAQ | FAQ.dc.html -> faq/index.html |
| Reviews | Reviews.dc.html -> reviews/index.html |
| Contact | Contact.dc.html -> contact/index.html |
| Cart / checkout | banna-cart.js, banna-config.js |

## Sync history
date: 2026-09-07T22:24:02Z
