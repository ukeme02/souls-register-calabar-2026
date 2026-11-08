/* ============ Settings, Google Sign-In, and Sync-to-Sheets engine ============ */
window.Settings = (function () {
  'use strict';
  const KEY = 'souls_settings_v1';
  const DEFAULTS = {
    counsellor: '',
    clientId: '',
    appsUrl: (window.APP_CONFIG && window.APP_CONFIG.SYNC_URL) || '',
    syncKey: (window.APP_CONFIG && window.APP_CONFIG.TEAM_CODE) || '',
    gtoken: '',
    gexpMs: 0,
    gname: '',
    gemail: '',
    deviceId: '',
    welcomed: false,
    lastSyncAt: 0,
    pendingDeletes: [],
  };
  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      cache = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (e) {
      cache = Object.assign({}, DEFAULTS);
    }
    return cache;
  }
  function save(patch) {
    cache = Object.assign(load(), patch);
    localStorage.setItem(KEY, JSON.stringify(cache));
    document.dispatchEvent(new CustomEvent('app:settings-changed'));
    return cache;
  }
  if (!load().deviceId) {
    const id = 'dev-' + Math.random().toString(36).slice(2, 10);
    save({ deviceId: id });
  }
  return { load, save };
})();

window.Auth = (function () {
  'use strict';
  let gsiReady = false;

  function decodeJwt(jwt) {
    try {
      const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(b64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function googleValid() {
    const s = Settings.load();
    return !!(s.gtoken && s.gexpMs && s.gexpMs > Date.now() + 60 * 1000);
  }
  function isAuthed() {
    const s = Settings.load();
    return googleValid() || !!s.syncKey;
  }
  function authLabel() {
    const s = Settings.load();
    if (googleValid()) return s.gname ? `Google: ${s.gname}` : 'Google account';
    if (s.syncKey) return 'Sync key mode';
    return 'Not signed in';
  }
  function authEmail() {
    const s = Settings.load();
    return googleValid() ? s.gemail || '' : '';
  }

  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        gsiReady = true;
        return resolve();
      }
      const old = document.getElementById('gsi-script');
      if (old) {
        old.addEventListener('load', () => resolve());
        old.addEventListener('error', () => reject(new Error('Failed to load Google script')));
        return;
      }
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client';
      sc.async = true;
      sc.defer = true;
      sc.id = 'gsi-script';
      sc.onload = () => { gsiReady = true; resolve(); };
      sc.onerror = () => reject(new Error('Failed to load Google script (offline?)'));
      document.head.appendChild(sc);
    });
  }

  function renderButton(el) {
    const s = Settings.load();
    if (!s.clientId) {
      el.innerHTML = '<p class="muted small">Add your Google OAuth Client ID in the “Central dump connection” card below to enable sign-in.</p>';
      return;
    }
    if (!(window.google && window.google.accounts)) {
      el.innerHTML = '<p class="muted small">Google sign-in unavailable right now (offline?). Sync key mode still works.</p>';
      return;
    }
    google.accounts.id.initialize({
      client_id: s.clientId,
      callback: (resp) => {
        if (!resp || !resp.credential) return;
        const payload = decodeJwt(resp.credential);
        if (!payload) return;
        Settings.save({
          gtoken: resp.credential,
          gexpMs: (payload.exp || 0) * 1000,
          gname: payload.name || '',
          gemail: payload.email || '',
        });
        document.dispatchEvent(new CustomEvent('app:auth-changed'));
        document.dispatchEvent(new CustomEvent('app:auth-signed-in'));
      },
      auto_select: false,
      use_fedcm_for_prompt: true,
    });
    el.innerHTML = '';
    try {
      google.accounts.id.renderButton(el, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
        logo_alignment: 'left',
        width: Math.min(el.clientWidth || 280, 320),
      });
    } catch (e) {
      el.innerHTML = '<p class="muted small">Could not render Google button.</p>';
    }
  }

  function signOut() {
    Settings.save({ gtoken: '', gexpMs: 0, gname: '', gemail: '' });
    try {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        google.accounts.id.disableAutoSelect();
      }
    } catch (e) { /* ignore */ }
    document.dispatchEvent(new CustomEvent('app:auth-changed'));
  }

  return { decodeJwt, googleValid, isAuthed, authLabel, authEmail, loadGsi, renderButton, signOut };
})();

window.Sync = (function () {
  'use strict';
  const BATCH = 100;
  let syncing = false;

  function state() {
    const s = Settings.load();
    return {
      configured: !!s.appsUrl,
      authed: Auth.isAuthed(),
      online: navigator.onLine,
      syncing,
      lastSyncAt: s.lastSyncAt,
    };
  }

  function authPayload() {
    const s = Settings.load();
    const auth = {};
    if (Auth.googleValid()) auth.token = s.gtoken;
    else if (s.syncKey) auth.key = s.syncKey;
    return auth;
  }

  function recordToWire(r) {
    return {
      id: r.id,
      first_name: r.first || '',
      middle_name: r.middle || '',
      surname: r.surname || '',
      phone: r.phone || '',
      gender: r.gender || '',
      age_group: r.age || '',
      decision: r.decision || '',
      address: r.address || '',
      prayer_request: r.prayer || '',
      counsellor: r.counsellor || '',
      device_id: r.device_id || '',
      created_at: r.created_at || '',
      updated_at: r.updated_at || '',
    };
  }

  async function callApi(payload) {
    const s = Settings.load();
    if (!s.appsUrl) throw new Error('Apps Script URL is not configured');
    // text/plain body avoids a CORS preflight, which Apps Script cannot answer.
    const res = await fetch(s.appsUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Unexpected server reply'); }
    if (!data.ok) throw new Error(data.error || 'Server rejected the request');
    return data;
  }

  async function pushDeletes() {
    const s = Settings.load();
    if (!s.pendingDeletes.length) return;
    const ids = s.pendingDeletes.slice(0, 200);
    await callApi({ action: 'delete', auth: authPayload(), ids });
    Settings.save({ pendingDeletes: s.pendingDeletes.filter((x) => !ids.includes(x)) });
  }

  async function syncNow(opts) {
    opts = opts || {};
    if (syncing) return { ok: false, skipped: true, reason: 'already-syncing' };
    const st = state();
    if (!st.online) return { ok: false, skipped: true, reason: 'offline' };
    if (!st.configured) return { ok: false, skipped: true, reason: 'not-configured' };
    if (!st.authed) return { ok: false, skipped: true, reason: 'not-authed' };

    syncing = true;
    document.dispatchEvent(new CustomEvent('app:sync-started'));
    let added = 0, batches = 0;
    try {
      await pushDeletes();
      const pending = await DB.pending();
      pending.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);
        const resp = await callApi({
          action: 'push',
          auth: authPayload(),
          records: batch.map(recordToWire),
        });
        if (resp.error) throw new Error(resp.error);
        // Only mark as synced after the server confirms.
        for (const rec of batch) {
          const fresh = await DB.get(rec.id);
          if (fresh) { fresh.synced = 1; fresh.synced_at = new Date().toISOString(); await DB.put(fresh); }
        }
        added += batch.length;
        batches++;
        document.dispatchEvent(new CustomEvent('app:sync-progress', { detail: { done: added } }));
      }
      Settings.save({ lastSyncAt: Date.now() });
      document.dispatchEvent(new CustomEvent('app:sync-done', { detail: { ok: true, added, batches } }));
      return { ok: true, added };
    } catch (err) {
      document.dispatchEvent(new CustomEvent('app:sync-done', { detail: { ok: false, error: err.message } }));
      return { ok: false, error: err.message };
    } finally {
      syncing = false;
    }
  }

  async function fetchServerCount() {
    const data = await callApi({ action: 'count', auth: authPayload() });
    return data.count;
  }

  async function testConnection() {
    const data = await callApi({ action: 'ping', auth: authPayload() });
    return data;
  }

  // ---- auto-sync triggers ----
  let saveDebounce = null;
  document.addEventListener('app:record-saved', () => {
    clearTimeout(saveDebounce);
    saveDebounce = setTimeout(() => syncNow(), 4000);
  });
  window.addEventListener('online', () => {
    document.dispatchEvent(new CustomEvent('app:net-online'));
    setTimeout(() => syncNow(), 1500);
  });
  window.addEventListener('offline', () => {
    document.dispatchEvent(new CustomEvent('app:net-offline'));
  });
  setInterval(() => {
    const st = state();
    if (st.online && st.configured && st.authed) syncNow();
  }, 90 * 1000);

  return { state, syncNow, fetchServerCount, testConnection };
})();
