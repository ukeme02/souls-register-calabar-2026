# 🕊 Souls Register — CfaN Calabar 2026

Offline-first PWA for capturing details of saved souls at the
**CfaN Great Gospel Crusade with Daniel Kolenda — Calabar, Nov 12–15 2026,
UNICROSS Field, Ekpo Abasi** — compiled automatically into **one central dump**
with a live leader dashboard and one-tap **bulk-SMS CSV**.

**No Google Sheet. No Apps Script. No per-volunteer setup.** A volunteer opens
the link, types their name once, and starts capturing — even with no network.

## How it works

1. **Capture** — big, fast form (name, phone with duplicate warning, gender,
   age group, decision, address, prayer request). Saved on the phone instantly.
2. **Sync** — when internet returns, entries flow automatically to the central
   dump (Cloudflare Pages Function + D1 database). Duplicate-safe, edit-safe.
3. **Central dump** — the leader's dashboard shows the live count of souls,
   unique numbers, active counsellors — and downloads:
   - `⬇ Full CSV` (phone_number first — bulk-SMS ready)
   - `⬇ Phones only` (deduplicated numbers)

## Files

```
index.html            the app (single page)
css/styles.css        styling — ⚠ app font is locked in --font-app, never change
js/config.js          ← one-time team config (sync URL + team code)
js/db.js              local IndexedDB storage (offline)
js/sync.js            settings, optional Google sign-in, sync engine
js/app.js             UI logic
sw.js                 service worker (offline shell)
manifest.webmanifest  PWA manifest
icons/                app icons
functions/api.js      central dump backend (Cloudflare Pages Function)
schema.sql            D1 database schema (run once)
wrangler.example.toml reference for local dev
apps-script/Code.gs   plan B backend (Google Sheets) — same JSON contract
SETUP-GUIDE.md        ← step-by-step team-leader setup
```

## Quick start (team leader) — the short version

1. Push this repo to GitHub → Cloudflare Dashboard → **Workers & Pages → Create →
   Pages → Connect to Git** → pick the repo → Save.
2. Create a **D1 database** (`souls-db`), bind it as `DB` in the Pages project,
   and run `schema.sql` once in its console.
3. Set env vars `TEAM_CODE` and `ADMIN_KEY` in Pages settings.
4. Share the site link with volunteers. Done.

Full details: **[SETUP-GUIDE.md](SETUP-GUIDE.md)**.

## Leader dashboard

`https://YOUR-SITE.pages.dev/admin` — enter your admin password and watch souls
land live. CSV buttons are at the top. The CSV opens cleanly in Excel and is
accepted by Termii, BulkSMSNigeria, SMSMobile24 and similar bulk-SMS portals.
