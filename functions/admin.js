/* ============================================================================
 * SOULS REGISTER — clean leader login at /admin
 *   GET  /admin          → password page (or dashboard if already logged in)
 *   POST /admin          → verify password, set a 7-day cookie, redirect back
 *   GET  /admin?logout=1 → log out
 * The dashboard itself lives in functions/_admin.js (shared with /api/admin).
 * ==========================================================================*/
import { adminKeyOf, adminCookieIdentity, loginPageHtml, buildAdminHtml } from './_admin.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.searchParams.get('logout') === '1') {
    return new Response(loginPageHtml('Logged out.'), {
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        'Set-Cookie': 'admin_key=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
      },
    });
  }
  if (adminCookieIdentity(request, env)) {
    return html(await buildAdminHtml(request, env));
  }
  return html(loginPageHtml());
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let password = '';
  try {
    const form = await request.formData();
    password = String(form.get('password') || '');
  } catch (e) { /* fallthrough */ }

  if (password && password === adminKeyOf(env)) {
    return new Response(null, {
      status: 303,
      headers: {
        'Set-Cookie': `admin_key=${encodeURIComponent(adminKeyOf(env))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
        Location: '/admin',
      },
    });
  }
  return html(loginPageHtml('Wrong password — try again.'));
}

function html(body) {
  return new Response(body, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}
