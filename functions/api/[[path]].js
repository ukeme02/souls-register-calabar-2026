/* ============================================================================
 * SOULS REGISTER — Cloudflare Pages Function (central dump)
 * CfaN Great Gospel Crusade · Calabar · Nov 12–15 2026
 * ============================================================================
 * Deployed with the static site on Cloudflare Pages (functions/api.js).
 * Needs ONE D1 database binding named DB (see SETUP-GUIDE.md — 3 clicks).
 *
 * Routes (all under /api/...):
 *   POST /api            — sync API used by the phones (JSON contract:
 *                          ping | count | push | delete) — same contract as
 *                          apps-script/Code.gs, so either backend works.
 *   GET  /api/admin      — leader dashboard: live totals + latest souls +
 *                          CSV download buttons (protected by ADMIN_KEY)
 *   GET  /api/export.csv — full CSV (phone_number first) for bulk SMS
 *   GET  /api/phones.csv — phone numbers only, deduplicated
 *
 * Auth: EITHER the shared TEAM_CODE (set as a Pages env var/secret) that all
 * volunteers' apps carry, OR a Google ID token (verified server-side —
 * no OAuth client setup needed for that check).
 * ==========================================================================*/

import { teamCodeOf, adminKeyOf, adminCookieIdentity, buildAdminHtml } from '../_admin.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: JSON_HEADERS });
}

const CSV_HEADERS = [
  'phone_number', 'first_name', 'middle_name', 'surname', 'gender', 'age_group',
  'decision', 'address', 'prayer_request', 'counsellor', 'device', 'saved_at',
  'updated_at', 'synced_by', 'server_time',
];

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function verifyGoogleToken(token) {
  const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token));
  if (!res.ok) return null;
  const info = await res.json();
  if (info.email_verified !== 'true' && info.email_verified !== true) return null;
  return info.email || 'google-user';
}

async function checkAuth(request, env, body) {
  const admin = adminCookieIdentity(request, env);
  if (admin) return admin;
  const teamCode = teamCodeOf(env);
  const auth = (body && body.auth) || {};
  if (auth.key && auth.key === teamCode) return 'team';
  if (auth.token) {
    const email = await verifyGoogleToken(auth.token);
    if (email) return email;
  }
  // also accept ?key= for GET convenience
  const url = new URL(request.url);
  if (url.searchParams.get('key') === teamCode) return 'team';
  return null;
}

const COLUMNS = '(id, first_name, middle_name, surname, phone, gender, age_group, decision, address, prayer_request, counsellor, device_id, created_at, updated_at, synced_by, server_time, training)';

// Deletion lock: from the moment the crusade begins (Nov 12, 2026, 4:00 PM WAT)
// no record may ever be deleted — not even with the admin key.
const CRUSADE_START_UTC = Date.UTC(2026, 10, 12, 15, 0, 0);
function crusadeStarted() { return Date.now() >= CRUSADE_START_UTC; }
const LOCK_MSG = '🔒 Data is locked — deletion is permanently disabled now the crusade has started.';

function recordRow(r, syncedBy) {
  const now = new Date().toISOString();
  return [
    r.id, r.first_name || '', r.middle_name || '', r.surname || '', r.phone || '',
    r.gender || '', r.age_group || '', r.decision || '', r.address || '',
    r.prayer_request || '', r.counsellor || '', r.device_id || '',
    r.created_at || '', r.updated_at || '', syncedBy || r.synced_by || '', now,
    r.training ? 1 : 0,
  ];
}

async function handleApi(request, env) {
  let body = null;
  if (request.method === 'POST') {
    try { body = await request.json(); } catch (e) { /* empty */ }
  }
  const action = (body && body.action) || new URL(request.url).searchParams.get('action') || 'ping';
  const identity = await checkAuth(request, env, body);
  if (!identity) return json({ ok: false, error: 'Not authorized — wrong team code.' }, 401);

  if (action === 'ping') {
    const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM souls WHERE training = 0').first();
    return json({ ok: true, message: 'Souls Register central dump is live ✝', count: row ? row.c : 0, locked: crusadeStarted() });
  }
  if (action === 'count') {
    const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM souls WHERE training = 0').first();
    return json({ ok: true, count: row ? row.c : 0, locked: crusadeStarted() });
  }
  if (action === 'push') {
    const records = (body && body.records) || [];
    if (!records.length) return json({ ok: true, added: 0, updated: 0 });
    let added = 0, updated = 0;
    const stmts = [];
    for (const r of records) {
      if (!r.id) continue;
      const existing = await env.DB.prepare('SELECT id FROM souls WHERE id = ?').bind(r.id).first();
      existing ? updated++ : added++;
      stmts.push(
        env.DB.prepare(
          existing
            ? `UPDATE souls SET first_name=?, middle_name=?, surname=?, phone=?, gender=?, age_group=?, decision=?, address=?, prayer_request=?, counsellor=?, device_id=?, updated_at=?, synced_by=? WHERE id=?`
            : `INSERT INTO souls ${COLUMNS} VALUES (${COLUMNS.split(',').map(() => '?').join(',')})`
        ).bind(...(existing
          ? [r.first_name || '', r.middle_name || '', r.surname || '', r.phone || '', r.gender || '', r.age_group || '', r.decision || '', r.address || '', r.prayer_request || '', r.counsellor || '', r.device_id || '', r.updated_at || '', identity, r.id]
          : recordRow(r, identity)))
      );
    }
    // D1 batches are atomic-ish and ordered; 100 per batch like the client sends
    for (let i = 0; i < stmts.length; i += 100) {
      await env.DB.batch(stmts.slice(i, i + 100));
    }
    const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM souls WHERE training = 0').first();
    return json({ ok: true, added, updated, count: row ? row.c : 0 });
  }
  if (action === 'delete') {
    // Hard lock at crusade start: nothing is ever deleted again.
    if (crusadeStarted()) return json({ ok: false, error: LOCK_MSG }, 403);
    const ids = (body && body.ids) || [];
    const onlyTraining = body && body.trainingOnly;
    let deleted = 0;
    for (const id of ids) {
      const res = await env.DB.prepare('DELETE FROM souls WHERE id = ?' + (onlyTraining ? ' AND training = 1' : '')).bind(id).run();
      deleted += res.meta ? res.meta.changes : 0;
    }
    const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM souls WHERE training = 0').first();
    return json({ ok: true, deleted, count: row ? row.c : 0 });
  }
  if (action === 'wipe_training') {
    // Erases every practice record. Also locked after crusade start.
    if (crusadeStarted()) return json({ ok: false, error: LOCK_MSG }, 403);
    const res = await env.DB.prepare('DELETE FROM souls WHERE training = 1').run();
    const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM souls WHERE training = 0').first();
    return json({ ok: true, deleted: res.meta ? res.meta.changes : 0, count: row ? row.c : 0 });
  }
  return json({ ok: false, error: 'Unknown action: ' + action }, 400);
}

async function csvResponse(env, phonesOnly, keyOk) {
  if (!keyOk) return new Response('Unauthorized', { status: 401 });
  const qr = phonesOnly
    ? "SELECT DISTINCT phone FROM souls WHERE training = 0 AND length(phone) >= 10 ORDER BY phone"
    : 'SELECT * FROM souls WHERE training = 0 ORDER BY server_time ASC';
  const { results } = await env.DB.prepare(qr).all();
  let text;
  if (phonesOnly) {
    text = '\ufeffphone_number\r\n' + results.map((r) => r.phone).join('\r\n');
  } else {
    text = '\ufeff' + CSV_HEADERS.join(',') + '\r\n' +
      results.map((r) => [
        r.phone, r.first_name, r.middle_name, r.surname, r.gender, r.age_group,
        r.decision, r.address, r.prayer_request, r.counsellor, r.device_id,
        r.created_at, r.updated_at, r.synced_by, r.server_time,
      ].map(csvCell).join(',')).join('\r\n');
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return new Response(text, {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': `attachment; filename="souls-calabar-2026${phonesOnly ? '-phones' : '-full'}-${stamp}.csv"`,
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const keyParam = url.searchParams.get('key') || '';

  if (path.endsWith('/admin')) {
    // legacy /api/admin?key=… bookmark OR cookie login — both welcome
    const keyOk = (keyParam && keyParam === adminKeyOf(env)) || !!adminCookieIdentity(request, env);
    if (!keyOk) return new Response('Unauthorized', { status: 401 });
    return new Response(await buildAdminHtml(request, env), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }
  if (path.endsWith('/export.csv')) return csvResponse(env, false, keyParam === adminKeyOf(env) || keyParam === teamCodeOf(env) || !!adminCookieIdentity(request, env));
  if (path.endsWith('/phones.csv')) return csvResponse(env, true, keyParam === adminKeyOf(env) || keyParam === teamCodeOf(env) || !!adminCookieIdentity(request, env));
  if (path === '/api' || path === '/api/') return handleApi(request, env);
  return json({ ok: false, error: 'Not found' }, 404);
}

export async function onRequestPost(context) {
  return handleApi(context.request, context.env);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}
