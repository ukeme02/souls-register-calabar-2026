/**
 * ============================================================
 *  SOULS REGISTER — Google Sheets backend (Apps Script)
 *  CfaN Great Gospel Crusade, Calabar 2026
 * ============================================================
 *  HOW TO DEPLOY (team leader, one time):
 *   1. Create a Google Sheet (e.g. "Souls Register — Calabar 2026").
 *   2. Extensions → Apps Script. Delete sample code, paste ALL of this file.
 *   3. (Optional) Script settings → set SYNC_KEY below to a secret passcode
 *      so volunteers can sync even if Google sign-in fails on a device.
 *   4. Deploy → New deployment → type: Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *      → Authorize → copy the Web app URL (ends with /exec).
 *   5. Paste that URL into the app: Settings → Team Sheet connection.
 *
 *  WHAT IT DOES:
 *   - push  : upsert (add or update by record id) rows into the sheet
 *   - delete: remove rows by record id
 *   - count : total souls in the sheet
 *   - ping  : connection test
 *   Auth  : Google ID token (signed-in volunteers) OR the SYNC_KEY.
 *   Dedupe: safe against duplicates — records are keyed by their id.
 * ============================================================
 */

// Optional shared-secret fallback. Leave '' to require Google sign-in only.
const SYNC_KEY = '';

const SHEET_NAME = 'Souls';
const HEADERS = [
  'Server Time', 'Record ID', 'First Name', 'Middle Name', 'Surname', 'Phone',
  'Gender', 'Age Group', 'Decision', 'Address', 'Prayer Request',
  'Counsellor', 'Device', 'Saved At (client)', 'Updated At (client)', 'Synced By',
];

function doGet(e) {
  return handle(e && e.parameter ? { action: e.parameter.action || 'ping', auth: e.parameter } : null);
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { /* no-op */ }
  return handle(body);
}

function handle(req) {
  const out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    const action = req && req.action ? req.action : 'ping';
    const auth = req && req.auth ? req.auth : {};
    const identity = checkAuth_(auth); // throws if unauthorized
    let result;
    if (action === 'ping') {
      result = { ok: true, message: 'Souls Register backend is live ✝', sheet: sheetName_(), count: count_() };
    } else if (action === 'count') {
      result = { ok: true, count: count_() };
    } else if (action === 'push') {
      result = push_(req.records || [], identity);
    } else if (action === 'delete') {
      result = del_(req.ids || []);
    } else {
      result = { ok: false, error: 'Unknown action: ' + action };
    }
    if (identity) result.by = identity;
    out.setContent(JSON.stringify(result));
  } catch (err) {
    out.setContent(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
  }
  return out;
}

/** Verify a Google ID token, or fall back to the shared sync key. */
function checkAuth_(auth) {
  if (auth && auth.token) {
    const res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(auth.token),
      { muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) throw new Error('Google sign-in invalid (expired?). Please sign in again.');
    const info = JSON.parse(res.getContentText());
    if (info.email_verified !== 'true' && info.email_verified !== true) {
      throw new Error('Google account email not verified.');
    }
    return info.email || 'google-user';
  }
  if (SYNC_KEY && auth && auth.key && auth.key === SYNC_KEY) return 'sync-key';
  throw new Error('Not authorized. Sign in with Google (or ask the leader for the sync key).');
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#0d1b3e').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function sheetName_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getName();
}

function count_() {
  const sh = sheet_();
  return Math.max(0, sh.getLastRow() - 1);
}

/** Find the row number whose Record ID column matches id. */
function findRowById_(sh, id) {
  if (sh.getLastRow() < 2) return -1;
  const ids = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function push_(records, identity) {
  if (!records.length) return { ok: true, added: 0, updated: 0 };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // wait up to 30s — many volunteers can sync at once
  try {
    const sh = sheet_();
    let added = 0, updated = 0;
    const tz = Session.getScriptTimeZone() || 'Africa/Lagos';
    for (const r of records) {
      const row = [
        Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'),
        r.id, r.first_name || '', r.middle_name || '', r.surname || '',
        "'" + String(r.phone || ''), // leading apostrophe keeps 0803… intact in Sheets
        r.gender || '', r.age_group || '', r.decision || '', r.address || '',
        r.prayer_request || '', r.counsellor || '', r.device_id || '',
        r.created_at || '', r.updated_at || '', identity || r.synced_by || '',
      ];
      const existing = findRowById_(sh, r.id);
      if (existing > 0) { sh.getRange(existing, 1, 1, HEADERS.length).setValues([row]); updated++; }
      else { sh.appendRow(row); added++; }
    }
    return { ok: true, added: added, updated: updated, count: count_() };
  } finally {
    lock.releaseLock();
  }
}

function del_(ids) {
  if (!ids.length) return { ok: true, deleted: 0 };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_();
    let deleted = 0;
    for (const id of ids) {
      const row = findRowById_(sh, id);
      if (row > 0) { sh.deleteRow(row); deleted++; }
    }
    return { ok: true, deleted: deleted, count: count_() };
  } finally {
    lock.releaseLock();
  }
}
