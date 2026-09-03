# Banna — True Purchase Conversion Tracking

This wires up: **ad click → Order Now click (with gclid) → Clover order → matched conversion → Google Ads upload**.

Cost: $0 (Google Sheets + Apps Script, both free). Weekly manual step: download a CSV and upload it in Google Ads (~2 min).

---

## Part A — One-time setup in Google Ads

1. Tools & Settings → Conversions → **+ New conversion action**
2. Choose **Import** → **Other data sources or CRMs** → **Track conversions from clicks**
3. Category: **Purchase**
4. Name it exactly: `Banna Website Purchase` (the scripts below use this name — keep it identical, or change `CONVERSION_NAME` in Code.gs to match whatever you pick)
5. Value: "Use different values for each conversion"
6. Count: **One**
7. Save. You do NOT need the gtag/snippet this creates — this conversion action only receives data via the CSV upload, nothing needs installing on Clover.

## Part B — Get your Clover Merchant ID

In Clover Dashboard: Account & Setup → Business Information → look for "Merchant ID" (separate from the API token you already found). Save it somewhere — you'll paste it into Apps Script Script Properties, never into this chat.

## Part C — Create the Google Sheet + Apps Script

1. Create a new Google Sheet, name it "Banna Conversion Tracking"
2. Extensions → Apps Script
3. Delete the default code, paste in the contents of `Code.gs` (below)
4. Click the gear icon (Project Settings) → Script Properties → add two properties:
   - `CLOVER_MERCHANT_ID` = (from Part B)
   - `CLOVER_API_TOKEN` = (your Clover API token — paste it here, in Apps Script, never in chat)
5. Deploy → New deployment → type: **Web app** → Execute as: **Me** → Who has access: **Anyone** → Deploy
6. Copy the Web App URL it gives you — you'll paste this into `banna.js`
7. Run the `setup()` function once from the Apps Script editor (Run button, pick `setup` from the dropdown) to create the sheet tabs and grant permissions
8. In the Apps Script editor, click the clock icon (Triggers) → Add Trigger:
   - Function: `pollCloverOrders`, Event source: Time-driven, Type: Minutes timer, Every 15 minutes
   - Function: `buildConversionExport`, Event source: Time-driven, Type: Day timer, whatever time you like (e.g. 6am)

## Part D — Update your website

Already done — `banna.js` in the repo root now logs `{gclid, dish, uid}` on Order Now clicks once you plug in the Apps Script Web App URL (search for `GAS_WEBAPP_URL_PLACEHOLDER` in banna.js and replace it with the URL from Part C step 6, then commit).

## Part E — Weekly habit

Open the Sheet → `ConversionsToUpload` tab → File → Download → CSV → in Google Ads: Tools & Settings → Conversions → Uploads → Upload conversions → pick the CSV. Takes about 2 minutes.

---

## How matching works (so you know its limits)

- Every Order Now click logs `{gclid, timestamp, dish}` to the `Clicks` tab (gclid is blank if the visitor didn't arrive from a Google ad click — those rows are ignored for conversion purposes).
- Every 15 min, `pollCloverOrders` pulls new completed orders from Clover into the `Orders` tab.
- Once a day, `buildConversionExport` matches each new order to the closest unmatched click within a 30-minute window and writes a row to `ConversionsToUpload`.
- This is a time-proximity match, not a deterministic one — accurate enough to judge whether ads are driving real sales, not exact enough for per-transaction accounting.
