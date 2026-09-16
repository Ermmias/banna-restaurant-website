# Order capture → Google Sheet

Every guest who fills in name and phone in the website cart lands as a row in a
Google Sheet in your Drive. No payment, no Clover integration — this is the lead
so you can call them back and take the order.

You get two rows' worth of information per order, in one row:

| Received | Status | Order # | Name | Phone | Items | Item count | Total | Ready window | Page | Google click id |
|---|---|---|---|---|---|---|---|---|---|---|

`Status` is **started** when they submit their details, and updates to **reached
payment** on the same row if they continue. `Google click id` is filled when the
visit came from a Google ad, so you can tell which orders your ad spend produced.

Optionally it emails you the moment an order arrives.

## Deploy — about 10 minutes, once

1. **Make the Sheet.** Go to [sheets.new](https://sheets.new), name it
   *Banna online orders*. Nothing to set up inside it — the tabs and headers
   create themselves.

2. **Open the script editor.** In that Sheet: **Extensions → Apps Script**. It
   opens a project bound to this Sheet.

3. **Paste the code.** Delete whatever is in `Code.gs` and paste the entire
   contents of `Code.gs` from this folder. Save (the disk icon).

4. **Deploy it.** **Deploy → New deployment** → gear icon → **Web app**, then:
   - Description: `Banna order capture`
   - Execute as: **Me**
   - Who has access: **Anyone** ← required; the website posts without logging in
   - **Deploy**, then **Authorize access** and approve the Google warning screens
     (it's your own script, so "unverified app" is expected — click *Advanced →
     Go to …*).

5. **Copy the Web app URL.** It looks like
   `https://script.google.com/macros/s/AKfy…long…/exec`

6. **Send me that URL** and I'll paste it into the site, or do it yourself: in
   `banna.js`, replace `GAS_WEBAPP_URL_PLACEHOLDER` with the URL. It appears
   exactly once.

Until that URL is in place the site sends nothing — no errors, no half-working
state.

## Email alerts (optional)

In the Apps Script editor: **Project Settings** (gear, left side) → **Script
properties** → **Add script property**:

- Property: `NOTIFY_EMAIL`
- Value: your email address

You'll get one email per order, with the items, total, phone number and a link
back to the Sheet. Leave the property out and no mail is sent.

## Testing it

1. On the live site, add a dish, hit **Continue to payment**, fill in a name and
   a phone number, submit.
2. Refresh the Sheet — a row appears within a second or two.

If nothing shows up: open the Web app URL in a browser. It should print
`{"ok":true,"service":"banna-order-capture"}`. If it asks you to sign in, the
deployment's **Who has access** isn't set to *Anyone* — redeploy with that fixed.

## Notes worth knowing

- **Re-deploying after code edits:** *Deploy → Manage deployments → pencil →
  Version: New version → Deploy.* The URL stays the same. If you use
  *New deployment* instead you get a new URL and have to update the site.
- **This is not a payment system.** The guest still isn't charged, and the
  kitchen still gets no ticket. The confirmation screen tells them to call. What
  changed is that now *you* have their number too.
- **Ad clicks share this endpoint.** The older click logger (which records the
  Google click id when someone taps through to Clover) writes to an *Ad clicks*
  tab in the same Sheet. One deployment covers both.
- **Privacy.** You're now storing customer names and phone numbers. Keep the
  Sheet private to your account, and don't text or email them anything they
  didn't ask for — that's a TCPA problem in Texas, not just an etiquette one.
