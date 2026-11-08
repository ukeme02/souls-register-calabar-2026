/* ============ UI wiring ============ */
(function () {
  'use strict';

  const APP_VERSION = '1.1.0';
  const $ = (id) => document.getElementById(id);
  const CRUSADE_START_UTC = Date.UTC(2026, 10, 12, 15, 0, 0); // Nov 12, 2026, 4:00 PM WAT
  const CRUSADE_END_UTC = Date.UTC(2026, 10, 15, 23, 59, 59);
  const IS_STANDALONE = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  let sheetCount = null; // last known server count
  let modalState = { id: null, editing: false, deleteArmed: false, deleteTimer: null };
  let deferredInstall = null; // captured beforeinstallprompt event

  // ---------- tiny helpers ----------
  function toast(msg, type) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (type ? ' toast-' + type : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 2600);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }
  function phoneKey(s) {
    const d = digitsOnly(s);
    return d.length > 10 ? d.slice(-10) : d;
  }
  function crusadeStarted() { return Date.now() >= CRUSADE_START_UTC; }

  // ---------- tabs / views ----------
  function showView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    const view = $('view-' + name);
    if (view) view.classList.add('active');
    document.querySelectorAll('#tabbar .tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    window.scrollTo(0, 0);
    if (name === 'records') refreshRecords();
    if (name === 'sync') refreshSyncView();
    if (name === 'settings') { fillSettingsForm(); renderGsi(); }
    if (name === 'welcome') { startCountdown(); refreshLandingCount(); updateInstallUi(); }
  }

  document.querySelectorAll('#tabbar .tab').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.tab));
  });
  $('brandSub').addEventListener('click', () => showView('welcome'));
  $('startCaptureBtn').addEventListener('click', () => {
    Settings.save({ welcomed: true });
    showView('capture');
  });

  // ---------- countdown ----------
  let countdownTimer = null;
  function startCountdown() {
    updateCountdown();
    clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdown, 30000);
  }
  function updateCountdown() {
    const now = Date.now();
    const el = $('countdown');
    if (!el) return;
    if (now < CRUSADE_START_UTC) {
      const ms = CRUSADE_START_UTC - now;
      $('cdDays').textContent = Math.floor(ms / 86400000);
      $('cdHours').textContent = Math.floor(ms / 3600000) % 24;
      $('cdMins').textContent = Math.floor(ms / 60000) % 60;
      $('cdLabel').textContent = 'until the crusade begins';
    } else if (now <= CRUSADE_END_UTC) {
      const day = Math.floor((now - CRUSADE_START_UTC) / 86400000) + 1;
      el.innerHTML = `<div class="cd-box" style="min-width:200px"><b style="color:#4ade80">LIVE NOW</b><span>Day ${day} of 4 · see you by 4 PM</span></div>`;
    } else {
      el.innerHTML = `<div class="cd-box" style="min-width:200px"><b>CONCLUDED</b><span>Thank you for labouring in the harvest</span></div>`;
    }
  }

  // ---------- PWA install prompt ----------
  function updateInstallUi() {
    const showCard = !IS_STANDALONE();
    $('installCard').classList.toggle('hidden', !showCard);
    // The native one-tap button is only available when the browser fired beforeinstallprompt
    $('installBtn').classList.toggle('hidden', !(deferredInstall && !IS_STANDALONE()));
    $('installCardBtn').classList.toggle('hidden', !deferredInstall);
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    updateInstallUi();
    updateSyncBanner(); // refresh the in-app install banner too
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    updateInstallUi();
    toast('📲 Installed! Find “Souls Register” on your home screen.', 'ok');
  });
  async function promptInstall() {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice;
    if (choice && choice.outcome === 'accepted') deferredInstall = null;
    updateInstallUi();
  }
  $('installBtn').addEventListener('click', promptInstall);
  $('installCardBtn').addEventListener('click', promptInstall);

  // ---------- landing live counter ----------
  async function refreshLandingCount() {
    const el = $('landingCount');
    const s = Settings.load();
    if (!s.appsUrl || !Auth.isAuthed() || !navigator.onLine) return;
    try {
      const c = await Sync.fetchServerCount();
      sheetCount = c;
      if (c > 0) {
        el.textContent = `🔥 ${c} soul${c === 1 ? '' : 's'} already registered — you are part of the harvest!`;
        el.classList.remove('hidden');
      }
    } catch (e) { /* silent — landing stays clean offline */ }
  }

  // ---------- sync progress bar ----------
  document.addEventListener('app:sync-started', () => $('syncProgress').classList.add('on'));
  document.addEventListener('app:sync-progress', (e) => {
    const p = $('syncProgress');
    if (e.detail && e.detail.done) p.querySelector('i').style.width = '100%';
  });
  document.addEventListener('app:sync-done', () => {
    const p = $('syncProgress');
    p.classList.remove('on');
    p.querySelector('i').style.width = '';
  });

  // ---------- network pill ----------
  function updateNetPill() {
    const pill = $('netPill');
    const online = navigator.onLine;
    pill.textContent = online ? 'Online' : 'Offline';
    pill.className = 'pill ' + (online ? 'pill-online' : 'pill-offline');
    updateSyncBanner();
  }
  window.addEventListener('app:net-online', updateNetPill);
  window.addEventListener('app:net-offline', updateNetPill);
  window.addEventListener('online', updateNetPill);
  window.addEventListener('offline', updateNetPill);
  // Some Android WebViews don't fire online/offline events reliably — poll as a fallback.
  let lastOnline = navigator.onLine;
  setInterval(() => {
    if (navigator.onLine !== lastOnline) {
      lastOnline = navigator.onLine;
      updateNetPill();
      window.dispatchEvent(new CustomEvent(lastOnline ? 'app:net-online' : 'app:net-offline'));
    }
  }, 10000);

  // ---------- capture form ----------
  const form = $('captureForm');
  const phoneInput = $('phone');

  phoneInput.addEventListener('blur', async () => {
    const key = phoneKey(phoneInput.value);
    const warn = $('phoneWarn');
    if (!key || key.length < 10) { warn.classList.add('hidden'); return; }
    const found = await DB.findByPhone(phoneInput.value);
    warn.classList.toggle('hidden', found.length === 0);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const first = $('firstName').value.trim();
    const middle = $('middleName').value.trim();
    const surname = $('surname').value.trim();
    const phone = phoneInput.value.trim();
    const gender = (form.querySelector('input[name="gender"]:checked') || {}).value || '';
    const age = (form.querySelector('input[name="age"]:checked') || {}).value || '';
    const decision = (form.querySelector('input[name="decision"]:checked') || {}).value || 'Salvation';
    const address = $('address').value.trim();
    const prayer = $('prayer').value.trim();
    const s = Settings.load();

    // validation
    let ok = true;
    const mark = (el, bad) => { el.classList.toggle('invalid', bad); if (bad) ok = false; };
    mark($('firstName'), !first);
    mark($('surname'), !surname);
    mark(phoneInput, digitsOnly(phone).length < 10);
    if (!gender) { toast('Please select gender', 'err'); ok = false; }
    if (!s.counsellor) { toast('Set your name as Counsellor first (Settings)', 'err'); showView('settings'); return; }
    if (!ok) { toast('Please complete the required fields', 'err'); return; }

    const nowIso = new Date().toISOString();
    const rec = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'r-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      first, middle, surname, phone, gender, age, decision, address, prayer,
      counsellor: s.counsellor,
      device_id: s.deviceId,
      created_at: nowIso,
      updated_at: nowIso,
      training: s.trainingMode ? 1 : 0,
      synced: 0, // 0 = pending, 1 = synced (numbers, since booleans aren't valid IDB keys)
      synced_at: '',
    };
    await DB.put(rec);

    // feedback + reset
    const total = await DB.count();
    const flash = $('saveFlash');
    flash.textContent = (s.trainingMode ? '🎓 [TRAINING] ' : '') +
      `✓ Saved! ${rec.first} is in the register — ${total} soul${total === 1 ? '' : 's'} on this phone.`;
    flash.classList.remove('hidden');
    setTimeout(() => flash.classList.add('hidden'), 3500);

    ['firstName', 'middleName', 'surname', 'phone', 'address', 'prayer'].forEach((id) => { $(id).value = ''; });
    $('phoneWarn').classList.add('hidden');
    $('firstName').focus();
    refreshStats();
    document.dispatchEvent(new CustomEvent('app:record-saved'));
  });

  $('counsellorChip').addEventListener('click', () => showView('settings'));

  // ---------- records list ----------
  let recordsCache = [];
  let searchTimer = null;

  $('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshRecords, 200);
  });

  async function refreshRecords() {
    recordsCache = await DB.all();
    recordsCache.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    const q = $('searchInput').value.trim().toLowerCase();
    const list = q
      ? recordsCache.filter((r) =>
          (`${r.first} ${r.middle} ${r.surname} ${r.phone}`.toLowerCase().includes(q)))
      : recordsCache;
    $('recordsCount').textContent = `${recordsCache.length} record${recordsCache.length === 1 ? '' : 's'}${q ? ` · ${list.length} found` : ''}`;
    $('recordsEmpty').classList.toggle('hidden', recordsCache.length !== 0);
    const html = list.map((r) => {
      const initials = (r.first[0] || '?') + (r.surname[0] || '');
      const gcls = r.gender === 'Male' ? 'male' : r.gender === 'Female' ? 'female' : 'unknown';
      return `<div class="rec" data-id="${r.id}">
        <div class="rec-avatar ${gcls}">${esc(initials.toUpperCase())}</div>
        <div class="rec-main">
          <div class="rec-name">${esc(r.first)} ${esc(r.middle)} ${esc(r.surname)}</div>
          <div class="rec-sub">${esc(r.phone)} · ${esc(r.gender)}${r.age ? ' · ' + esc(r.age) : ''}${r.counsellor ? ' · ' + esc(r.counsellor) : ''}</div>
        </div>
        <span class="rec-status ${r.synced ? 'synced' : 'pending'}">${r.synced ? '✓ synced' : '⏳ pending'}</span>
      </div>`;
    }).join('');
    $('recordsList').innerHTML = html;
    $('recordsList').querySelectorAll('.rec').forEach((el) => {
      el.addEventListener('click', () => openModal(el.dataset.id));
    });
  }

  // ---------- modal (view / edit / delete) ----------
  function openModal(id) {
    modalState = { id, editing: false, deleteArmed: false, deleteTimer: null };
    renderModal();
    $('modalRoot').classList.remove('hidden');
  }
  function closeModal() {
    $('modalRoot').classList.add('hidden');
    modalState = { id: null, editing: false, deleteArmed: false, deleteTimer: null };
  }
  $('modalBackdrop').addEventListener('click', closeModal);
  $('modalClose').addEventListener('click', closeModal);

  const FIELDS = [
    ['first', 'First name', 'text'], ['middle', 'Middle name', 'text'], ['surname', 'Surname', 'text'],
    ['phone', 'Phone', 'tel'], ['gender', 'Gender', ['Male', 'Female']],
    ['age', 'Age group', ['0-12', '13-17', '18-24', '25-34', '35-44', '45+']],
    ['decision', 'Decision', ['Salvation', 'Rededication', 'Other']],
    ['address', 'Address', 'text'], ['prayer', 'Prayer request', 'text'],
  ];

  async function renderModal() {
    const r = await DB.get(modalState.id);
    if (!r) { closeModal(); return; }
    $('modalTitle').textContent = r.editing ? 'Edit record' : `${r.first} ${r.middle} ${r.surname}`.trim();
    const editBtn = $('modalEdit');
    const delBtn = $('modalDelete');
    delBtn.textContent = '🗑 Delete';
    delBtn.style.display = '';
    editBtn.style.display = '';
    // Data lock: once the crusade starts, real records can never be deleted.
    const canDelete = r.training === 1 || !crusadeStarted();
    delBtn.style.display = canDelete ? '' : 'none';

    if (!modalState.editing) {
      $('modalBody').innerHTML = [
        ['Phone', r.phone], ['Gender', r.gender], ['Age group', r.age],
        ['Decision', r.decision], ['Address', r.address], ['Prayer', r.prayer],
        ['Counsellor', r.counsellor], ['Saved', fmtDateTime(r.created_at)],
        ['Sync', r.synced ? '✓ synced to central dump' : '⏳ pending'],
        r.training ? ['Type', '🎓 Training (practice data)'] : null,
      ].filter(Boolean).map(([k, v]) => `<div class="kv"><b>${k}</b><div>${esc(v || '—')}</div></div>`).join('') +
        (!canDelete ? '<p class="muted small" style="margin:10px 0 0">🔒 Deletion is locked — the crusade has started.</p>' : '');
      editBtn.textContent = '✎ Edit';
    } else {
      $('modalBody').innerHTML = FIELDS.map(([key, label, type]) => {
        if (Array.isArray(type)) {
          return `<div class="field"><label>${label}</label>
            <select id="m_${key}" class="sel" style="width:100%;padding:12px;border:1.5px solid var(--line);border-radius:10px;font-size:16px">
              ${type.map((o) => `<option ${r[key] === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select></div>`;
        }
        return `<div class="field"><label>${label}</label>
          <input id="m_${key}" type="${type}" value="${esc(r[key] || '')}" /></div>`;
      }).join('');
      editBtn.textContent = '💾 Save changes';
    }
  }

  $('modalEdit').addEventListener('click', async () => {
    if (!modalState.editing) { modalState.editing = true; renderModal(); return; }
    // save edits
    const r = await DB.get(modalState.id);
    if (!r) return;
    FIELDS.forEach(([key]) => {
      const el = $('m_' + key);
      if (el) r[key] = el.value.trim();
    });
    if (!r.first || !r.surname || digitsOnly(r.phone).length < 10) {
      toast('Name and a valid phone are required', 'err');
      return;
    }
    r.updated_at = new Date().toISOString();
    r.synced = 0; // re-sync the corrected record (server upserts by id)
    await DB.put(r);
    modalState.editing = false;
    toast('Record updated', 'ok');
    renderModal();
    refreshStats();
    refreshRecords();
    document.dispatchEvent(new CustomEvent('app:record-saved'));
  });

  $('modalDelete').addEventListener('click', async () => {
    if (!modalState.deleteArmed) {
      modalState.deleteArmed = true;
      $('modalDelete').textContent = '⚠ Tap again to confirm';
      clearTimeout(modalState.deleteTimer);
      modalState.deleteTimer = setTimeout(() => {
        modalState.deleteArmed = false;
        if ($('modalDelete')) $('modalDelete').textContent = '🗑 Delete';
      }, 3000);
      return;
    }
    const r = await DB.get(modalState.id);
    if (!r) return;
    if (r.training === 1) {
      const s = Settings.load();
      Settings.save({ pendingTrainingDeletes: s.pendingTrainingDeletes.concat([r.id]) });
    } else if (!crusadeStarted()) {
      const s = Settings.load();
      Settings.save({ pendingDeletes: s.pendingDeletes.concat([r.id]) });
    } else {
      toast('🔒 Locked — deletion is disabled after crusade start', 'err');
      return;
    }
    await DB.remove(modalState.id);
    closeModal();
    toast('Record deleted', 'ok');
    refreshStats();
    refreshRecords();
  });

  // ---------- CSV export ----------
  function downloadFile(name, text, mime) {
    const blob = new Blob(['\ufeff' + text], { type: mime || 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  $('exportCsvBtn').addEventListener('click', async () => {
    const all = await DB.all();
    if (!all.length) { toast('No records to export yet', 'err'); return; }
    all.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const header = ['phone_number', 'first_name', 'middle_name', 'surname', 'gender', 'age_group', 'decision', 'address', 'prayer_request', 'counsellor', 'saved_at'];
    const rows = all.map((r) => [
      digitsOnly(r.phone), r.first, r.middle, r.surname, r.gender, r.age, r.decision,
      r.address, r.prayer, r.counsellor, r.created_at,
    ].map(csvCell).join(','));
    downloadFile(`souls-calabar-2026-full-${stamp()}.csv`, [header.join(','), ...rows].join('\r\n'));
    toast(`Exported ${all.length} records`, 'ok');
  });

  $('exportPhonesBtn').addEventListener('click', async () => {
    const all = await DB.all();
    if (!all.length) { toast('No records to export yet', 'err'); return; }
    const seen = new Set();
    const phones = all
      .map((r) => digitsOnly(r.phone))
      .filter((p) => p.length >= 10 && !seen.has(p) && seen.add(p));
    downloadFile(`souls-calabar-2026-phones-${stamp()}.csv`, ['phone_number', ...phones].join('\r\n'));
    toast(`Exported ${phones.length} phone numbers`, 'ok');
  });

  // ---------- sync view ----------
  async function refreshStats() {
    const total = await DB.count();
    const pending = await DB.pendingCount();
    $('statDevice').textContent = total;
    $('statPending').textContent = pending;
    $('syncTotal').textContent = total;
    $('syncPending').textContent = pending;
    $('statTotal').textContent = sheetCount == null ? '—' : sheetCount;
    $('syncSheet').textContent = sheetCount == null ? '—' : sheetCount;
  }

  function lastSyncText() {
    const s = Settings.load();
    $('lastSync').textContent = s.lastSyncAt
      ? `Last sync: ${new Date(s.lastSyncAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
      : 'Never synced yet.';
  }

  async function refreshSyncView() {
    await refreshStats();
    lastSyncText();
    const s = Settings.load();
    const authEl = $('authSummary');
    const cfg = window.APP_CONFIG || {};
    $('adminLinkSync').href = location.origin + (cfg.ADMIN_URL || '/api/admin');
    $('adminLinkSync').removeAttribute('target');
    if (Auth.googleValid()) {
      authEl.innerHTML = `✅ Syncing as <b>${esc(s.gname || s.gemail || 'Google account')}</b> · team code active`;
    } else if (s.syncKey) {
      authEl.innerHTML = `🔐 Connected with the <b>team code</b> — everything syncs automatically.`;
    } else {
      authEl.innerHTML = `⚠ No team code set — entries stay on this phone. Check Settings.`;
    }
    // best-effort server count
    if (s.appsUrl && Auth.isAuthed() && navigator.onLine) {
      Sync.fetchServerCount()
        .then((c) => { sheetCount = c; refreshStats(); })
        .catch(() => {});
    }
  }

  $('syncNowBtn').addEventListener('click', async () => {
    const btn = $('syncNowBtn');
    btn.disabled = true;
    btn.textContent = '⟳ Syncing…';
    const res = await Sync.syncNow({ manual: true });
    btn.disabled = false;
    btn.textContent = '⟳ Sync now';
    if (res.ok) toast(`Synced ${res.added} record${res.added === 1 ? '' : 's'} ✓`, 'ok');
    else if (res.reason === 'offline') toast('You are offline — will sync automatically', 'err');
    else if (res.reason === 'not-configured') toast('No team connection set — check Settings', 'err');
    else if (res.reason === 'not-authed') toast('Add the team code in Settings first', 'err');
    else if (!res.skipped) toast('Sync failed: ' + res.error, 'err');
    refreshSyncView();
  });

  $('goSettingsAuth')?.addEventListener('click', () => showView('settings'));

  // ---------- sync banner on capture ----------
  function updateSyncBanner() {
    const s = Settings.load();
    const b = $('syncBanner');
    const online = navigator.onLine;
    let html = '';
    if (s.appsUrl && online && !Auth.isAuthed()) {
      b.className = 'banner';
      html = `🔐 Add the <b>team code</b> in Settings so your entries reach the central dump.
              <button class="btn btn-outline" onclick="showView('settings')">Settings</button>`;
    } else if (!s.appsUrl && online && s.welcomed) {
      b.className = 'banner banner-info';
      html = `ℹ Working offline-only. Ask your leader for the team connection details.
              <button class="btn btn-outline" onclick="showView('settings')">Settings</button>`;
    } else {
      b.className = 'banner hidden';
    }
    b.innerHTML = html;

    // training-mode banner (highest priority on the capture screen)
    const tb = $('trainingBanner');
    if (s.trainingMode && !crusadeStarted()) {
      tb.className = 'banner';
      tb.innerHTML = `🎓 <b>TRAINING MODE</b> — these are practice entries. Erase them in Settings → “Erase ALL training data” when training is done.`;
    } else {
      tb.classList.add('hidden');
    }

    // install prompt banner (capture view)
    const ib = $('installBanner');
    if (!IS_STANDALONE() && s.welcomed) {
      ib.classList.remove('hidden');
      ib.innerHTML = deferredInstall
        ? `📲 Install this app for full-screen offline use.<button class="btn btn-gold" id="installBannerBtn2">Install</button>`
        : `📲 Tip: Chrome menu ⋮ → “Add to Home screen” for the app experience.`;
      const b2 = document.getElementById('installBannerBtn2');
      if (b2) b2.addEventListener('click', promptInstall);
    } else {
      ib.classList.add('hidden');
    }
  }

  // ---------- training mode & data lock ----------
  function refreshTrainingUi() {
    const s = Settings.load();
    const status = $('trainingStatus');
    const toggle = $('trainingToggleBtn');
    const wipe = $('trainingWipeBtn');
    if (crusadeStarted()) {
      status.innerHTML = '🔒 <b>Data lock active</b> — the crusade has started. Deletion is permanently disabled everywhere to protect the harvest.';
      toggle.disabled = true;
      toggle.classList.add('hidden');
      wipe.classList.add('hidden');
      return;
    }
    toggle.classList.remove('hidden');
    wipe.classList.remove('hidden');
    toggle.disabled = false;
    if (s.trainingMode) {
      toggle.textContent = 'Turn training mode OFF';
      toggle.className = 'btn btn-primary';
      wipe.disabled = false;
      status.innerHTML = '🎓 <b>Training mode is ON</b> — everything captured now is practice data (marked on each record and in the central dump). Tap the red button when training is done to wipe it all.';
    } else {
      toggle.textContent = 'Turn training mode ON';
      toggle.className = 'btn btn-outline';
      wipe.disabled = true;
      status.innerHTML = 'Practice mode for training volunteers. While ON, everything captured is marked as <b>practice data</b> and can be wiped in one tap — without touching any real record.';
    }
  }

  $('trainingToggleBtn').addEventListener('click', () => {
    const s = Settings.load();
    Settings.save({ trainingMode: !s.trainingMode });
    refreshTrainingUi();
    updateSyncBanner();
    toast(s.trainingMode ? 'Training mode OFF — capturing real data now' : '🎓 Training mode ON — entries are practice data', s.trainingMode ? 'ok' : '');
  });

  let trainWipeArmed = false;
  $('trainingWipeBtn').addEventListener('click', async () => {
    const s = Settings.load();
    if (!s.trainingMode) { toast('Turn training mode ON first', 'err'); return; }
    if (!trainWipeArmed) {
      trainWipeArmed = true;
      $('trainingWipeBtn').textContent = '⚠ Tap again to erase ALL training data';
      setTimeout(() => { trainWipeArmed = false; $('trainingWipeBtn').textContent = '🧹 Erase ALL training data'; }, 4000);
      return;
    }
    trainWipeArmed = false;
    $('trainingWipeBtn').textContent = '🧹 Erase ALL training data';
    // wipe local practice records
    const all = await DB.all();
    let localWiped = 0;
    for (const rec of all) {
      if (rec.training === 1) { await DB.remove(rec.id); localWiped++; }
    }
    // wipe the central dump's practice rows (also clears the server-side queue)
    Settings.save({ pendingDeletes: [], pendingTrainingDeletes: [] });
    let serverMsg = '';
    const st = Settings.load();
    if (st.appsUrl && navigator.onLine) {
      try {
        const res = await Sync.wipeTrainingData();
        serverMsg = ` · ${res.deleted} wiped from the central dump`;
      } catch (e) {
        serverMsg = ' · central dump wipe failed (will not retry automatically — use the leader dashboard button)';
      }
    }
    refreshStats();
    refreshRecords();
    toast(`🧹 Training data erased (${localWiped} on this phone${serverMsg})`, 'ok');
  });

  // ---------- settings ----------
  function fillSettingsForm() {
    const s = Settings.load();
    $('setCounsellor').value = s.counsellor;
    $('setClientId').value = s.clientId;
    $('setAppsUrl').value = s.appsUrl;
    $('setSyncKey').value = s.syncKey;
    $('counsellorName').textContent = s.counsellor || 'not set';
    $('deviceIdShort').textContent = s.deviceId;
    $('appVersion').textContent = APP_VERSION;
    const cfg = window.APP_CONFIG || {};
    const adminUrl = location.origin + (cfg.ADMIN_URL || '/api/admin');
    $('adminLink').href = adminUrl;
    $('adminLink').removeAttribute('target'); // same-tab: blank tabs can be blocked in installed apps
    updateGsiStatus();
    refreshTrainingUi();
  }
  function updateGsiStatus() {
    const s = Settings.load();
    const el = $('gsiStatus');
    if (Auth.googleValid()) {
      el.innerHTML = `Signed in as <b>${esc(s.gname || 'Google account')}</b>${s.gemail ? ` (${esc(s.gemail)})` : ''}`;
    } else if (s.gname) {
      el.textContent = `Previous session (${s.gname}) expired — sign in again.`;
    } else {
      el.textContent = '';
    }
  }
  function renderGsi() {
    const s = Settings.load();
    if (!s.clientId || !navigator.onLine) { updateGsiStatus(); Auth.renderButton($('gsiButton')); return; }
    Auth.loadGsi()
      .then(() => Auth.renderButton($('gsiButton')))
      .catch(() => { $('gsiButton').innerHTML = '<p class="muted small">Could not load Google sign-in (offline?).</p>'; });
  }

  $('saveSettingsBtn').addEventListener('click', () => {
    Settings.save({
      counsellor: $('setCounsellor').value.trim(),
      clientId: $('setClientId').value.trim(),
      appsUrl: $('setAppsUrl').value.trim(),
      syncKey: $('setSyncKey').value.trim(),
    });
    $('counsellorName').textContent = Settings.load().counsellor || 'not set';
    toast('Settings saved ✓', 'ok');
    renderGsi();
    updateSyncBanner();
  });

  $('testConnBtn').addEventListener('click', async () => {
    // save first so the test uses what's on screen
    Settings.save({
      appsUrl: $('setAppsUrl').value.trim(),
      syncKey: $('setSyncKey').value.trim(),
      clientId: $('setClientId').value.trim(),
      counsellor: $('setCounsellor').value.trim(),
    });
    const out = $('testConnResult');
    out.textContent = 'Testing…';
    try {
      const res = await Sync.testConnection();
      out.innerHTML = `✅ Connected! ${esc(res.message || '')} ${res.count != null ? `· Central dump has <b>${res.count}</b> souls.` : ''}`;
    } catch (e) {
      out.textContent = '❌ ' + e.message;
    }
  });

  let wipeArmed = false;
  $('dangerWipe').addEventListener('click', async () => {
    if (!wipeArmed) {
      wipeArmed = true;
      $('dangerWipe').textContent = '⚠ Tap again to erase EVERYTHING on this phone';
      setTimeout(() => { wipeArmed = false; $('dangerWipe').textContent = 'Erase ALL records on this phone'; }, 4000);
      return;
    }
    wipeArmed = false;
    $('dangerWipe').textContent = 'Erase ALL records on this phone';
    await DB.clear();
    refreshStats();
    toast('All local records erased', 'ok');
    showView('capture');
  });

  // ---------- auth events ----------
  document.addEventListener('app:auth-changed', () => {
    updateSyncBanner();
    if ($('view-settings').classList.contains('active')) { updateGsiStatus(); }
    if ($('view-sync').classList.contains('active')) refreshSyncView();
  });
  document.addEventListener('app:auth-signed-in', (e) => {
    const s = Settings.load();
    toast(`Signed in as ${s.gname || s.gemail || 'Google account'} ✓`, 'ok');
    Sync.syncNow();
  });
  document.addEventListener('app:sync-done', async (e) => {
    refreshStats();
    lastSyncText();
    if (e.detail && e.detail.ok) {
      sheetCount = null;
      const s = Settings.load();
      if (s.appsUrl && navigator.onLine) {
        Sync.fetchServerCount().then((c) => { sheetCount = c; refreshStats(); }).catch(() => {});
      }
    }
    if ($('view-records').classList.contains('active')) refreshRecords();
  });
  document.addEventListener('app:settings-changed', () => { $('counsellorName').textContent = Settings.load().counsellor || 'not set'; });

  // expose for inline onclick in banner
  window.showView = showView;

  // ---------- boot ----------
  async function boot() {
    updateNetPill();
    await refreshStats();
    await refreshRecords();
    const s = Settings.load();
    if (!s.welcomed) showView('welcome');
    else showView('capture');
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('sw.js'); } catch (e) { /* dev/file:// */ }
    }
    updateSyncBanner();
  }
  boot();
})();
