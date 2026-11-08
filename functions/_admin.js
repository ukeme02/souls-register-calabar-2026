/* ============================================================================
 * SOULS REGISTER — shared leader-dashboard module (not routed directly).
 * Imported by functions/admin.js (clean /admin login) and functions/api/[[path]].js
 * ==========================================================================*/

export const TEAM_CODE_DEFAULT = 'calabar2026'; // override with env var TEAM_CODE
export const ADMIN_KEY_DEFAULT = 'leader2026';  // override with env var ADMIN_KEY

export function adminKeyOf(env) { return env.ADMIN_KEY || ADMIN_KEY_DEFAULT; }
export function teamCodeOf(env) { return env.TEAM_CODE || TEAM_CODE_DEFAULT; }

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Identity 'admin' when the request carries a valid admin login cookie. */
export function adminCookieIdentity(request, env) {
  return getCookie(request, 'admin_key') === adminKeyOf(env) ? 'admin' : null;
}

/* ---- clean login page at /admin ---- */
export function loginPageHtml(error) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Souls Register — Leader Login</title>
  <link rel="stylesheet" href="/css/fonts.css">
  <style>
    :root { --font-app: "Nunito Sans Expanded", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { font-family: var(--font-app); margin: 0; min-height: 100vh; display: grid; place-items: center;
           background: radial-gradient(700px 300px at 50% -10%, rgba(242,183,5,.18), transparent 60%), linear-gradient(160deg,#0d1c42,#060d22); color: #fff; padding: 20px; }
    .card { width: 100%; max-width: 360px; text-align: center; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); border-radius: 22px; padding: 30px 24px; }
    .cross { font-size: 38px; color: #f2b705; text-shadow: 0 0 26px rgba(242,183,5,.5); }
    h1 { font-size: 19px; margin: 10px 0 4px; }
    p { color: #93a3cc; font-size: 13px; margin: 0 0 18px; }
    input { width: 100%; font-size: 17px; font-family: var(--font-app); padding: 13px 15px; border-radius: 12px; border: 1.5px solid rgba(255,255,255,.2); background: rgba(255,255,255,.07); color: #fff; outline: none; text-align: center; letter-spacing: 2px; }
    input:focus { border-color: #f2b705; }
    button { width: 100%; margin-top: 12px; font-family: var(--font-app); font-size: 16px; font-weight: 800; padding: 14px; border-radius: 12px; border: none; cursor: pointer;
             background: linear-gradient(180deg,#ffcf3d,#f2b705 60%,#d99e00); color: #0d1b3e; box-shadow: 0 6px 20px rgba(242,183,5,.4); }
    .err { background: rgba(209,63,63,.15); border: 1px solid rgba(209,63,63,.45); color: #ff9c9c; border-radius: 10px; padding: 9px; font-size: 13px; font-weight: 700; margin-bottom: 12px; }
    .back { display: inline-block; margin-top: 16px; color: #93a3cc; font-size: 12.5px; text-decoration: none; }
  </style></head>
  <body><div class="card">
    <div class="cross">✝</div>
    <h1>Souls Register — Leader</h1>
    <p>Enter the admin password to open the central dump.</p>
    ${error ? `<div class="err">${esc(error)}</div>` : ''}
    <form method="POST" action="/admin">
      <input name="password" type="password" placeholder="Admin password" autofocus required />
      <button>Enter dashboard →</button>
    </form>
    <a class="back" href="/">← Back to the app</a>
  </div></body></html>`;
}

/* ---- full dashboard (cookie login or ?key= already verified by the caller) ---- */
export async function buildAdminHtml(request, env) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  // With a cookie login, no key is needed anywhere; with ?key= access we pass it through.
  const keyParam = url.searchParams.get('key') || '';
  const adminKey = keyParam || '';
  const kq = adminKey ? '?key=' + encodeURIComponent(adminKey) : '';

  const like = `%${q.replace(/[%_]/g, '')}%`;
  const { results } = q
    ? await env.DB.prepare(
        'SELECT * FROM souls WHERE training = 0 AND (first_name LIKE ? OR middle_name LIKE ? OR surname LIKE ? OR phone LIKE ? OR counsellor LIKE ?) ORDER BY server_time DESC LIMIT 500'
      ).bind(like, like, like, like, like).all()
    : await env.DB.prepare('SELECT * FROM souls WHERE training = 0 ORDER BY server_time DESC LIMIT 500').all();
  const totals = await env.DB.prepare(
    "SELECT COUNT(*) AS total, COUNT(DISTINCT phone) AS phones, COUNT(DISTINCT CASE WHEN counsellor <> '' THEN counsellor END) AS workers FROM souls WHERE training = 0"
  ).first();
  const trainRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM souls WHERE training = 1').first();
  const trainingCount = trainRow ? trainRow.c : 0;
  const byGender = await env.DB.prepare(
    "SELECT gender, COUNT(*) AS c FROM souls WHERE training = 0 GROUP BY gender"
  ).all();
  const locked = Date.now() >= Date.UTC(2026, 10, 12, 15, 0, 0);

  const rows = (results || []).map((r) => `<tr>
      <td>${esc(r.phone)}</td><td><b>${esc(r.first_name)}</b> ${esc(r.middle_name)} ${esc(r.surname)}</td>
      <td>${esc(r.gender)}</td><td>${esc(r.age_group)}</td><td>${esc(r.decision)}</td>
      <td>${esc(r.counsellor)}</td><td>${esc((r.server_time || '').slice(0, 16).replace('T', ' '))}</td>
    </tr>`).join('');
  const genderChips = (byGender.results || []).map((g) =>
    `<span style="background:#16306e;color:#fff;border-radius:999px;padding:6px 14px;font-weight:700">${esc(g.gender || '—')}: ${g.c}</span>`).join(' ');

  const AUTH = JSON.stringify(adminKey ? { key: adminKey } : {});

  return `<!DOCTYPE html>
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
  .btn { display: inline-block; padding: 10px 16px; border-radius: 10px; font-weight: 800; text-decoration: none; font-size: 14px; border: none; cursor: pointer; font-family: var(--font-app); }
  .btn-gold { background: #f2b705; color: #0d1b3e; }
  .btn-ghost { background: rgba(255,255,255,.1); color: #fff; border: 1px solid rgba(255,255,255,.25); }
  .btn-danger { background: #fdecec; color: #d13f3f; border: 1.5px solid #f2caca; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; padding: 14px 18px; }
  .stat { background: #fff; border-radius: 14px; padding: 14px; text-align: center; box-shadow: 0 2px 8px rgba(13,27,62,.08); }
  .stat b { font-size: 30px; display: block; color: #0d1b3e; }
  .stat span { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #66708c; font-weight: 700; }
  .bar { padding: 0 18px 8px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  form.bar { margin: 0; }
  input[type=search] { flex: 1; min-width: 200px; padding: 11px 13px; border: 1.5px solid #e3e8f2; border-radius: 10px; font-size: 15px; font-family: var(--font-app); }
  .wrap { padding: 0 18px 30px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 8px rgba(13,27,62,.08); min-width: 720px; }
  th { background: #0d1b3e; color: #fff; text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: .4px; }
  td { padding: 10px 12px; border-bottom: 1px solid #eef1f8; font-size: 14px; }
  tr:last-child td { border-bottom: none; }
  .empty { text-align: center; color: #66708c; padding: 40px; font-weight: 600; }
  .train-chip { background:#fdf3dd; color:#b97a08; border-radius:999px; padding:6px 14px; font-weight:700; }
</style></head>
<body>
<header>
  <h1>✝ Souls Register — <span class="gold">Central Dump</span></h1>
  <a class="btn btn-gold" href="/api/export.csv${kq}">⬇ Full CSV (bulk SMS)</a>
  <a class="btn btn-ghost" href="/api/phones.csv${kq}">⬇ Phones only</a>
  <a class="btn btn-ghost" href="/">← Back to app</a>
  <a class="btn btn-ghost" href="/admin?logout=1">Log out</a>
</header>
<div class="stats">
  <div class="stat"><b>${totals ? totals.total : 0}</b><span>Real souls registered</span></div>
  <div class="stat"><b>${totals ? totals.phones : 0}</b><span>Unique phone numbers</span></div>
  <div class="stat"><b>${totals ? totals.workers : 0}</b><span>Counsellors active</span></div>
</div>
<div class="bar">${genderChips}
  <span class="train-chip">🎓 Training rows: ${trainingCount}${locked ? '' : trainingCount ? ' — wipe before the event!' : ''}</span>
  ${!locked && trainingCount ? `<button id="wipeTrain" class="btn btn-danger">🧹 Wipe ALL training data</button>` : ''}
  <form method="GET" class="bar" style="flex:1">
    ${adminKey ? `<input type="hidden" name="key" value="${esc(adminKey)}" />` : ''}
    <input type="search" name="q" value="${esc(q)}" placeholder="Search name, phone, counsellor…" />
  </form>
</div>
<div class="wrap">
  ${rows ? `<table><thead><tr><th>Phone</th><th>Name</th><th>Gender</th><th>Age</th><th>Decision</th><th>Counsellor</th><th>Synced</th></tr></thead><tbody>${rows}</tbody></table>`
         : '<div class="empty">No souls in the central dump yet — they appear here the moment any phone syncs.</div>'}
</div>
<script>
  const AUTH = ${AUTH};
  const wt = document.getElementById('wipeTrain');
  if (wt) wt.addEventListener('click', async () => {
    if (wt.dataset.armed !== '1') { wt.dataset.armed = '1'; wt.textContent = '⚠ Tap again to wipe ALL training rows'; return; }
    wt.disabled = true; wt.textContent = 'Wiping…';
    const res = await fetch('/api', { method: 'POST', body: JSON.stringify({ action: 'wipe_training', auth: AUTH }) });
    const data = await res.json();
    if (data.ok) location.reload();
    else { wt.disabled = false; wt.textContent = data.error || 'Failed'; wt.dataset.armed = ''; }
  });
</script>
</body></html>`;
}
