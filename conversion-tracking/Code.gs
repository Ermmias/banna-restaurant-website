/**
 * Banna Restaurant — Clover -> Google Ads conversion matching.
 * See README.md for setup steps. Do not hardcode credentials here —
 * they belong in Script Properties (Project Settings -> Script Properties).
 */

var CONVERSION_NAME = 'Banna Website Purchase'; // must match the conversion action name in Google Ads
var MATCH_WINDOW_MINUTES = 30;

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, 'Clicks', ['Timestamp', 'GCLID', 'Dish', 'UID', 'Matched']);
  ensureSheet_(ss, 'Orders', ['OrderID', 'CreatedTime', 'Total', 'Currency', 'Matched']);
  ensureSheet_(ss, 'ConversionsToUpload', ['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency']);
  PropertiesService.getScriptProperties().setProperty('LAST_ORDER_POLL_MS', String(Date.now() - 24 * 60 * 60 * 1000));
  Logger.log('Setup complete.');
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

/** Receives click pings from banna.js */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ensureSheet_(ss, 'Clicks', ['Timestamp', 'GCLID', 'Dish', 'UID', 'Matched']);
    sh.appendRow([new Date(), body.gclid || '', body.dish || '', body.uid || '', 'no']);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

/** Polls Clover Orders API for new orders since the last run. Time-driven trigger: every 15 min. */
function pollCloverOrders() {
  var props = PropertiesService.getScriptProperties();
  var merchantId = props.getProperty('CLOVER_MERCHANT_ID');
  var token = props.getProperty('CLOVER_API_TOKEN');
  if (!merchantId || !token) throw new Error('Set CLOVER_MERCHANT_ID and CLOVER_API_TOKEN in Script Properties first.');

  var lastPollMs = Number(props.getProperty('LAST_ORDER_POLL_MS') || (Date.now() - 24 * 60 * 60 * 1000));
  var url = 'https://api.clover.com/v3/merchants/' + merchantId + '/orders'
    + '?filter=' + encodeURIComponent('createdTime>=' + lastPollMs)
    + '&expand=lineItems&limit=200';

  var resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    Logger.log('Clover API error: ' + resp.getResponseCode() + ' ' + resp.getContentText());
    return;
  }

  var data = JSON.parse(resp.getContentText());
  var orders = (data.elements || []);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ensureSheet_(ss, 'Orders', ['OrderID', 'CreatedTime', 'Total', 'Currency', 'Matched']);
  var existingIds = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 0), 1).getValues().flat();

  var newestMs = lastPollMs;
  orders.forEach(function (o) {
    if (existingIds.indexOf(o.id) !== -1) return; // already logged
    var createdMs = o.createdTime || o.modifiedTime;
    var total = (o.total || 0) / 100; // Clover amounts are in cents
    sh.appendRow([o.id, new Date(createdMs), total, 'USD', 'no']);
    if (createdMs > newestMs) newestMs = createdMs;
  });

  props.setProperty('LAST_ORDER_POLL_MS', String(newestMs));
}

/** Matches unmatched orders to unmatched clicks within the time window, writes upload rows. Time-driven trigger: daily. */
function buildConversionExport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var clicksSh = ensureSheet_(ss, 'Clicks', ['Timestamp', 'GCLID', 'Dish', 'UID', 'Matched']);
  var ordersSh = ensureSheet_(ss, 'Orders', ['OrderID', 'CreatedTime', 'Total', 'Currency', 'Matched']);
  var outSh = ensureSheet_(ss, 'ConversionsToUpload', ['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency']);

  var clickRows = clicksSh.getLastRow() > 1 ? clicksSh.getRange(2, 1, clicksSh.getLastRow() - 1, 5).getValues() : [];
  var orderRows = ordersSh.getLastRow() > 1 ? ordersSh.getRange(2, 1, ordersSh.getLastRow() - 1, 5).getValues() : [];

  var windowMs = MATCH_WINDOW_MINUTES * 60 * 1000;

  for (var oi = 0; oi < orderRows.length; oi++) {
    var order = orderRows[oi];
    if (order[4] === 'yes') continue; // already matched
    if (!order[1]) continue;
    var orderTime = new Date(order[1]).getTime();

    var bestIdx = -1, bestDiff = Infinity;
    for (var ci = 0; ci < clickRows.length; ci++) {
      var click = clickRows[ci];
      if (click[4] === 'yes') continue;
      if (!click[1]) continue; // no gclid, not ad-attributable
      var clickTime = new Date(click[0]).getTime();
      var diff = Math.abs(orderTime - clickTime);
      if (diff <= windowMs && diff < bestDiff) { bestDiff = diff; bestIdx = ci; }
    }

    if (bestIdx !== -1) {
      var gclid = clickRows[bestIdx][1];
      outSh.appendRow([gclid, CONVERSION_NAME, formatForAds_(new Date(order[1])), order[2], order[3]]);
      ordersSh.getRange(oi + 2, 5).setValue('yes');
      clicksSh.getRange(bestIdx + 2, 5).setValue('yes');
      clickRows[bestIdx][4] = 'yes'; // keep local copy in sync so it isn't reused this run
    }
  }
}

function formatForAds_(date) {
  // Google Ads offline conversion import expects: yyyy-MM-dd HH:mm:ss+00:00 (UTC recommended)
  return Utilities.formatDate(date, 'Etc/GMT', 'yyyy-MM-dd HH:mm:ss') + '+00:00';
}
