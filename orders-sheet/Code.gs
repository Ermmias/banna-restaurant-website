/**
 * Banna Restaurant & Bar — order capture
 *
 * Receives every cart submission from bannarestaurant.com and appends it to a
 * Google Sheet in your Drive. No payment, no Clover — this is the lead capture
 * that lets you call the guest and take the order.
 *
 * It also keeps handling the older ad-click log (gclid rows) so one deployed
 * web app serves both. Rows land on two tabs: "Orders" and "Ad clicks".
 *
 * Deploy instructions are in orders-sheet/README.md.
 */

var ORDERS_TAB = 'Orders';
var CLICKS_TAB = 'Ad clicks';

var ORDER_HEADERS = [
  'Received', 'Status', 'Order #', 'Name', 'Phone', 'Items',
  'Item count', 'Total', 'Ready window', 'Page', 'Google click id'
];
var CLICK_HEADERS = ['Received', 'Google click id', 'Dish', 'Click id'];

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);

    if (body.kind === 'order') {
      writeOrder_(body);
    } else {
      writeClick_(body);
    }
    return json_({ ok: true });
  } catch (err) {
    // Never throw at the browser: a failed log must not break a guest's checkout.
    logError_(err);
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'banna-order-capture' });
}

/* ---------- Orders ---------- */

function writeOrder_(b) {
  var sheet = tab_(ORDERS_TAB, ORDER_HEADERS);
  var id = String(b.id || '');
  var row = [
    new Date(),
    b.status || 'started',
    id,
    b.name || '',
    b.phone || '',
    itemLines_(b.items),
    b.count || (b.items ? b.items.length : 0),
    typeof b.total === 'number' ? b.total : Number(b.total) || '',
    b.eta || '',
    b.page || '',
    b.gclid || ''
  ];

  // One row per order: a later "confirmed" post updates the row it started.
  var found = id ? findRow_(sheet, 3, id) : 0;
  if (found) {
    sheet.getRange(found, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
    found = sheet.getLastRow();
  }
  sheet.getRange(found, 8).setNumberFormat('$#,##0.00');
  sheet.getRange(found, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  notify_(b);
}

function itemLines_(items) {
  if (!items || !items.length) return '';
  return items.map(function (i) {
    var qty = i.qty || 1;
    var price = typeof i.price === 'number' ? i.price : Number(i.price) || 0;
    return qty + ' x ' + (i.name || '?') + ' ($' + price.toFixed(2) + ')';
  }).join('\n');
}

/* ---------- Ad clicks (existing behaviour) ---------- */

function writeClick_(b) {
  var sheet = tab_(CLICKS_TAB, CLICK_HEADERS);
  sheet.appendRow([new Date(), b.gclid || '', b.dish || '', b.uid || '']);
}

/* ---------- Email alert ----------
   Set NOTIFY_EMAIL in Project Settings > Script properties to get an email the
   moment an order comes in. Leave it unset and nothing is sent. */

function notify_(b) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  if (b.status && b.status !== 'started') return; // only alert once, on arrival
  try {
    MailApp.sendEmail({
      to: to,
      subject: 'Banna online order — ' + (b.name || 'no name') + ' — ' +
        (typeof b.total === 'number' ? '$' + b.total.toFixed(2) : ''),
      body: [
        'Name:  ' + (b.name || ''),
        'Phone: ' + (b.phone || ''),
        'Total: ' + (typeof b.total === 'number' ? '$' + b.total.toFixed(2) : ''),
        'Ready: ' + (b.eta || ''),
        '',
        itemLines_(b.items),
        '',
        'Order #' + (b.id || ''),
        'Sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
      ].join('\n')
    });
  } catch (err) {
    logError_(err);
  }
}

/* ---------- helpers ---------- */

function tab_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRow_(sheet, col, value) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var vals = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === value) return i + 2;
  }
  return 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function logError_(err) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Errors') || ss.insertSheet('Errors');
    sheet.appendRow([new Date(), String(err && err.stack || err)]);
  } catch (e) {}
}
