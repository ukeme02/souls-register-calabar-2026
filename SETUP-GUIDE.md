# 🕊 Souls Register — Setup Guide
### CfaN Great Gospel Crusade · Calabar · November 12–15, 2026

**The goal:** volunteers open a link, save souls on their phones (works with
zero network), and every contact compiles itself into ONE central dump with a
live dashboard and a bulk-SMS CSV. **No Google Sheet stress.**

Two one-time jobs for the team leader (≈20 minutes total), then volunteers
need **nothing** — the connection is baked into the app.

---

## Part 1 — Put it on GitHub (5 min)

The repo is ready to push as-is:

```bash
git init
git add .
git commit -m "Souls Register — CfaN Calabar 2026"
gh repo create souls-register-calabar-2026 --public --source=. --push
```
(or create the repo on github.com and push any way you like — **public**).

## Part 2 — Cloudflare Pages + the central dump (15 min)

### 2.1 Create the Pages project
1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git**.
2. Authorize GitHub → pick the repo → **Begin setup**:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `/`
3. **Save and Deploy** → you get a link like `https://souls-register-calabar-2026.pages.dev`.
   ✅ The app is now live — open it on a phone and it already captures + stores
   souls offline.

### 2.2 Create the central dump database (D1)
1. Dashboard → **Storage & Databases → D1 → Create** → name: `souls-db` → Create.
2. Open it → **Console** → paste the entire contents of `schema.sql` → **Run**.
   (Creates the `souls` table.)
3. Back in **Workers & Pages → your project → Settings → Bindings → Add**:
   - Type: **D1 Database** · Variable name: `DB` · Database: `souls-db` → Deploy.

### 2.3 Secrets
Workers & Pages → your project → **Settings → Variables and Secrets → Add**:
| Variable | Value | Notes |
|---|---|---|
| `TEAM_CODE` | e.g. `calabar2026` | shared volunteer passcode — **must match `TEAM_CODE` in `js/config.js`** |
| `ADMIN_KEY` | e.g. `leader2026` | key for YOUR dashboard + CSV downloads — keep private |

Then edit `js/config.js` to match, commit, and push — Pages redeploys automatically.

### 2.4 Verify
- Open `https://YOUR-SITE.pages.dev` → landing page → Start capturing →
  save a test soul (Settings → set your counsellor name first).
- Open `https://YOUR-SITE.pages.dev/admin` → enter your admin password (the ADMIN_KEY value) →
  the test soul should appear within seconds. **Working — delete the test row
  from the dashboard isn't needed (rows are deduped by ID), or wipe via D1 console.**

## Part 3 — Volunteers (1 min each)

Send them **one message**:

> 1. Open this link in Chrome: `https://YOUR-SITE.pages.dev`
> 2. Tap ⚙ Settings → type your name under Counsellor → Save settings
> 3. Chrome menu ⋮ → **Add to Home screen → Install**
> 4. Go to Capture — save every soul!

That's all. No Google account, no codes to paste — the team code is already
inside the app. Entries sync by themselves whenever the phone has signal.

## Part 4 — During the crusade

- You (leader) keep `…/admin` open — the **total souls** count climbs live.
- Duplicate-phone warnings keep the list clean at the source.
- **Bulk-SMS CSV:** dashboard → `⬇ Full CSV` (all details) or `⬇ Phones only`
  (deduplicated). Columns: `phone_number` first, then names, gender, decision,
  counsellor… — accepted by Termii, BulkSMSNigeria, SMSMobile24, etc.
- From any phone's **Records** tab you can also export that phone's CSV directly.

## Part 5 — The Android APK (optional, 10 min)

1. Open **[pwabuilder.com](https://www.pwabuilder.com)** on a laptop.
2. Paste `https://YOUR-SITE.pages.dev` → **Start** → **Package for stores → Android**.
3. Download the zip → share `app-release-signed.apk` with volunteers
   (WhatsApp/Bluetooth) → they tap → allow "install unknown apps" → done.

The APK is the same app: offline capture, auto-sync, same central dump.

---

## Plan B — Google Sheets (only if you ever want a Sheet copy)

`apps-script/Code.gs` implements the **same JSON contract** on Google Sheets:
create a Sheet → Extensions → Apps Script → paste → Deploy as Web app
(Execute as: Me · Access: Anyone) → volunteers paste the `…/exec` URL + a sync
key into Settings. Everything else works identically. See git history of this
guide or the code header comments for the detailed steps.

---

### Quick reference

| Thing | Where |
|---|---|
| Volunteer app | `https://YOUR-SITE.pages.dev` |
| Leader dashboard | `https://YOUR-SITE.pages.dev/admin` |
| Full CSV | dashboard → ⬇ Full CSV (or `/admin → ⬇ Full CSV`) |
| Phones-only CSV | dashboard → ⬇ Phones only (or `/admin → ⬇ Phones only`) |
| Team code | `js/config.js` (must equal the `TEAM_CODE` Pages variable) |

### The font

The app and landing page use ONE locked font, defined only as `--font-app` in
`css/styles.css` (and identically in `functions/api.js` for the dashboard).
Never change it without the owner's explicit instruction.
