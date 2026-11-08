/* ============================================================================
 * SOULS REGISTER — one-time team configuration
 * ----------------------------------------------------------------------------
 * The team leader fills this ONCE before hosting; volunteers then need
 * ZERO setup — they just open the app and start capturing souls.
 *
 * SYNC_URL  : where phones send entries.
 *             '/api' works when the app + Pages Function are hosted together
 *             on the same Cloudflare Pages site (recommended — leave as '/api').
 * TEAM_CODE : shared passcode all volunteer apps use to reach the central dump.
 *             MUST match the TEAM_CODE variable set on Cloudflare Pages.
 *             (Default on both sides: 'calabar2026' — change both to go secure.)
 * ADMIN_URL : leader dashboard (same site + '/admin' — password login page).
 * ==========================================================================*/
window.APP_CONFIG = {
  SYNC_URL: '/api',
  TEAM_CODE: 'calabar2026',
  ADMIN_URL: '/admin',
  CRUSADE_NAME: 'CfaN Great Gospel Crusade — Calabar 2026',
};
