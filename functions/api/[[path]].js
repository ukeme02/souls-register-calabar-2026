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

const TEAM_CODE_DEFAULT = 'calabar2026'; // override with env var TEAM_CODE
const ADMIN_KEY_DEFAULT = 'leader2026';  // override with env var ADMIN_KEY

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
  const teamCode = env.TEAM_CODE || TEAM_CODE_DEFAULT;
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

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function adminPage(request, env, keyOk, adminKey) {
  if (!keyOk) {
    return new Response(
      `<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
       <title>Souls Register — Leader</title>
       <link rel="stylesheet" href="/css/fonts.css">
       <body style="font-family:var(--font-app,'Nunito Sans Expanded',-apple-system,sans-serif);background:#0d1b3e;color:#fff;display:grid;place-items:center;height:100vh;margin:0">
       <form method="GET" style="text-align:center">
         <div style="font-size:40px">✝</div>
         <h2>Souls Register — Leader Access</h2>
         <p style="color:#9fb0d8">Enter the admin key</p>
         <input name="key" type="password" autofocus style="font-size:18px;padding:12px;border-radius:10px;border:none" />
         <button style="font-size:18px;padding:12px 20px;border-radius:10px;border:none;background:#f2b705;color:#0d1b3e;font-weight:800">Enter</button>
       </form></body>`, { headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }
  const q = new URL(request.url).searchParams.get('q') || '';
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const { results } = q
    ? await env.DB.prepare(
        'SELECT * FROM souls WHERE training = 0 AND (first_name LIKE ? OR middle_name LIKE ? OR surname LIKE ? OR phone LIKE ? OR counsellor LIKE ?) ORDER BY server_time DESC LIMIT 500'
      ).bind(like, like, like, like, like).all()
    : await env.DB.prepare('SELECT * FROM souls WHERE training = 0 ORDER BY server_time DESC LIMIT 500').all();
  const totals = await env.DB.prepare(
    'SELECT COUNT(*) AS total, COUNT(DISTINCT phone) AS phones, COUNT(DISTINCT counsellor) AS workers FROM souls WHERE training = 0'
  ).first();
  const trainRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM souls WHERE training = 1').first();
  const trainingCount = trainRow ? trainRow.c : 0;
  const byGender = await env.DB.prepare(
    "SELECT gender, COUNT(*) AS c FROM souls WHERE training = 0 GROUP BY gender"
  ).all();
  const locked = crusadeStarted();

  const rows = (results || []).map((r) => `<tr>
      <td>${esc(r.phone)}</td><td><b>${esc(r.first_name)}</b> ${esc(r.middle_name)} ${esc(r.surname)}</td>
      <td>${esc(r.gender)}</td><td>${esc(r.age_group)}</td><td>${esc(r.decision)}</td>
      <td>${esc(r.counsellor)}</td><td>${esc((r.server_time || '').slice(0, 16).replace('T', ' '))}</td>
    </tr>`).join('');
  const genderChips = (byGender.results || []).map((g) =>
    `<span style="background:#16306e;color:#fff;border-radius:999px;padding:6px 14px;font-weight:700">${esc(g.gender || '—')}: ${g.c}</span>`).join(' ');

  return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Souls Register — Central Dump (Leader)</title>
<link rel="stylesheet" href="/css/fonts.css">
<style>
  /* App font: Nunito Sans Expanded — self-hosted /css/fonts.css, locked 2026-11-08. */
  :root { --font-app: "Nunito Sans Expanded", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  * { box-sizing: border-box; }
  body { font-family: var(--font-app); margin: 0; background: #f2f5fb; color: #18213a; }
  header { background: linear-gradient(135deg,#0d1b3e,#16306e); color: #fff; padding: 18px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  header h1 { font-size: 20px; margin: 0; margin-right: auto; }
  header .gold { color: #f2b705; }
  .btn { display: inline-block; padding: 10px 16px; border-radius: 10px; font-weight: 800; text-decoration: none; font-size: 14px; border: none; cursor: pointer; }
  .btn-gold { background: #f2b705; color: #0d1b3e; }
  .btn-ghost { background: rgba(255,255,255,.1); color: #fff; border: 1px solid rgba(255,255,255,.25); }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; padding: 14px 18px; }
  .stat { background: #fff; border-radius: 14px; padding: 14px; text-align: center; box-shadow: 0 2px 8px rgba(13,27,62,.08); }
  .stat b { font-size: 30px; display: block; color: #0d1b3e; }
  .stat span { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #66708c; font-weight: 700; }
  .bar { padding: 0 18px 8px; display: flex; gap: 8px; flex-wrap: wrap; }
  form.bar { margin: 0; }
  input[type=search] { flex: 1; min-width: 200px; padding: 11px 13px; border: 1.5px solid #e3e8f2; border-radius: 10px; font-size: 15px; font-family: var(--font-app); }
  .wrap { padding: 0 18px 30px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 8px rgba(13,27,62,.08); min-width: 720px; }
  th { background: #0d1b3e; color: #fff; text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: .4px; }
  td { padding: 10px 12px; border-bottom: 1px solid #eef1f8; font-size: 14px; }
  tr:last-child td { border-bottom: none; }
  .empty { text-align: center; color: #66708c; padding: 40px; font-weight: 600; }
</style></head>
<body>
<header>
  <h1>✝ Souls Register — <span class="gold">Central Dump</span></h1>
  <a class="btn btn-gold" href="/api/export.csv?key=${encodeURIComponent(adminKey)}">⬇ Full CSV (bulk SMS)</a>
  <a class="btn btn-ghost" href="/api/phones.csv?key=${encodeURIComponent(adminKey)}">⬇ Phones only</a>
  <a class="btn btn-ghost" href="/">← Back to app</a>
</header>
<div class="stats">
  <div class="stat"><b>${totals ? totals.total : 0}</b><span>Real souls registered</span></div>
  <div class="stat"><b>${totals ? totals.phones : 0}</b><span>Unique phone numbers</span></div>
  <div class="stat"><b>${totals ? totals.workers : 0}</b><span>Counsellors active</span></div>
</div>
<div class="bar">${genderChips}
  <span style="background:#fdf3dd;color:#b97a08;border-radius:999px;padding:6px 14px;font-weight:700">🎓 Training rows: ${trainingCount}${locked ? '' : trainingCount ? ' — wipe before the event!' : ''}</span>
  ${!locked && trainingCount ? `<button id="wipeTrain" class="btn" style="background:#fdecec;color:#d13f3f;border:1.5px solid #f2caca">🧹 Wipe ALL training data</button>` : ''}
  <form method="GET" class="bar" style="flex:1">
    <input type="hidden" name="key" value="${esc(adminKey)}" />
    <input type="search" name="q" value="${esc(q)}" placeholder="Search name, phone, counsellor…" />
  </form>
</div>
<div class="wrap">
  ${rows ? `<table><thead><tr><th>Phone</th><th>Name</th><th>Gender</th><th>Age</th><th>Decision</th><th>Counsellor</th><th>Synced</th></tr></thead><tbody>${rows}</tbody></table>`
         : '<div class="empty">No souls in the central dump yet — they appear here the moment any phone syncs.</div>'}
</div>
<script>
  const wt = document.getElementById('wipeTrain');
  if (wt) wt.addEventListener('click', async () => {
    if (wt.dataset.armed !== '1') { wt.dataset.armed = '1'; wt.textContent = '⚠ Tap again to wipe ALL training rows'; return; }
    wt.disabled = true; wt.textContent = 'Wiping…';
    const res = await fetch('/api', { method: 'POST', body: JSON.stringify({ action: 'wipe_training', auth: { key: ${JSON.stringify(adminKey)} } }) });
    const data = await res.json();
    if (data.ok) location.reload();
    else { wt.disabled = false; wt.textContent = data.error || 'Failed'; wt.dataset.armed = ''; }
  });
</script>
</body></html>`, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const adminKey = env.ADMIN_KEY || ADMIN_KEY_DEFAULT;
  const teamCode = env.TEAM_CODE || TEAM_CODE_DEFAULT;
  const keyParam = url.searchParams.get('key') || '';

  if (path.endsWith('/admin')) return adminPage(request, env, keyParam === adminKey, keyParam);
  if (path.endsWith('/export.csv')) return csvResponse(env, false, keyParam === adminKey || keyParam === teamCode);
  if (path.endsWith('/phones.csv')) return csvResponse(env, true, keyParam === adminKey || keyParam === teamCode);
  if (path === '/api' || path === '/api/') return handleApi(request, env);
  return json({ ok: false, error: 'Not found' }, 404);
}

export async function onRequestPost(context) {
  return handleApi(context.request, context.env);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}
