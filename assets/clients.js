// assets/clients.js
(function () {
  'use strict';

  // ---------- UTIL ----------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const escapeHtml = (s) => String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmtDatePL = (iso) => {
    try { return new Date(iso).toLocaleDateString('pl-PL', { dateStyle:'medium' }); }
    catch { return iso || ''; }
  };
  const fmtDateTimePL = (iso) => {
    try { return new Date(iso).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' }); }
    catch { return iso || ''; }
  };

  // ---------- STORAGE ----------
  const CLIENTS_LS_KEY = 'adm_clients_v1';
  function clientsLoad() {
    try { return JSON.parse(localStorage.getItem(CLIENTS_LS_KEY)) || []; }
    catch { return []; }
  }
  function clientsSave(list) {
    localStorage.setItem(CLIENTS_LS_KEY, JSON.stringify(list || []));
  }

  // ---------- MODEL ----------
  let CURRENT_CLIENT_ID = null;
  function newId() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function clientNew() {
    return {
      id: newId(),
      name: '', email: '', phone: '', address: '',
      prefs: '', allergies: '', contras: '', notes: '',
      treatmentNotes: {} // lokalne notatki per booking_no
    };
  }

  // ---------- LISTA ----------
  function clientsFilter(term) {
    term = (term||'').toLowerCase();
    const list = clientsLoad();
    if (!term) return list;
    return list.filter(c =>
      (c.name||'').toLowerCase().includes(term) ||
      (c.email||'').toLowerCase().includes(term) ||
      (c.phone||'').toLowerCase().includes(term) ||
      (c.address||'').toLowerCase().includes(term)
    );
  }

  function render() {
    const tbody = $('#clients-rows'); if (!tbody) return;
    const term = $('#client-search')?.value || '';
    const list = clientsFilter(term);

    tbody.innerHTML = '';
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="3">Brak klientów</td></tr>';
      return;
    }

    for (const c of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(c.name || '-')}</td>
        <td>${escapeHtml(c.address || '-')}</td>
        <td><button class="btn" data-client-details="${c.id}">Szczegóły</button></td>`;
      tbody.appendChild(tr);
    }
  }

  // ---------- PANEL SZCZEGÓŁY ----------
  function setText(id, txt='') { const el = document.getElementById(id); if (el) el.textContent = txt; }
  function setVal(id, val='') { const el = document.getElementById(id); if (el) el.value = val; }
  function showSection(idToShow) {
    ['cd-section-suggestions','cd-section-upcoming','cd-section-history','cd-section-contact','cd-section-notes']
      .forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById(idToShow)?.classList.remove('hidden');
  }

  function buildSuggestions(c) {
    const out = [];
    const txt = (s)=>String(s||'').toLowerCase();
    if (txt(c.allergies).includes('olej')) out.push('Unikaj olejków zapachowych.');
    if (txt(c.prefs).includes('mocny'))    out.push('Lubi mocny masaż.');
    if (Object.keys(c.treatmentNotes||{}).length > 3) out.push('Klient regularny – zaproponuj pakiet.');
    if (!out.length) out.push('Brak szczególnych zaleceń.');
    return out.join('<br>');
  }

  function openClientDetails(clientId) {
    const c = clientsLoad().find(x => x.id === clientId);
    if (!c) return;
    CURRENT_CLIENT_ID = c.id;

    setText('cd-title',   c.name || 'Szczegóły klienta');
    setText('cd-email',   c.email || '-');
    setText('cd-phone',   c.phone || '-');
    setText('cd-address', c.address || '-');

    setVal('cd-prefs',      c.prefs || '');
    setVal('cd-allergies',  c.allergies || '');
    setVal('cd-contras',    c.contras || '');
    setVal('cd-notes',      c.notes || '');

    const sugBox = document.getElementById('cd-section-suggestions');
    if (sugBox) sugBox.innerHTML = buildSuggestions(c);

    document.getElementById('client-details')?.classList.remove('hidden');
    showSection('cd-section-suggestions');
  }
  function closeClientDetails() {
    document.getElementById('client-details')?.classList.add('hidden');
    CURRENT_CLIENT_ID = null;
  }

  // ---------- SUPABASE: HISTORIA / NADCHODZĄCE ----------
  async function fetchHistoryPast({ email, phone }) {
    const nowIso = new Date().toISOString();
    let q = window.sb.from('bookings_view')
      .select('when, service_name, status')
      .eq('status','Potwierdzona')
      .lt('when', nowIso)
      .order('when', { ascending: false });
    if (email) q = q.eq('client_email', String(email).toLowerCase());
    else if (phone) q = q.eq('phone', phone);
    else return [];
    const { data, error } = await q;
    if (error) { console.warn('history error', error); return []; }
    return data || [];
  }

  async function fetchUpcoming({ email, phone }) {
    const nowIso = new Date().toISOString();
    let q = window.sb.from('bookings_view')
      .select('when, service_name, status')
      .neq('status','Anulowana')
      .gte('when', nowIso)
      .order('when', { ascending: true });
    if (email) q = q.eq('client_email', String(email).toLowerCase());
    else if (phone) q = q.eq('phone', phone);
    else return [];
    const { data, error } = await q;
    if (error) { console.warn('upcoming error', error); return []; }
    return data || [];
  }

  async function renderDetailsHistory() {
    const c = clientsLoad().find(x => x.id === CURRENT_CLIENT_ID); if (!c) return;
    const rows = await fetchHistoryPast({ email: c.email, phone: c.phone });
    const tbody = document.getElementById('cd-history-rows'); if (!tbody) return;
    tbody.innerHTML = rows.map(it =>
      `<tr><td>${fmtDateTimePL(it.when)}</td><td>${escapeHtml(it.service_name||'-')}</td><td>${escapeHtml(it.status||'-')}</td></tr>`
    ).join('') || '<tr><td colspan="3">Brak danych</td></tr>';
  }

  async function renderDetailsUpcoming() {
    const c = clientsLoad().find(x => x.id === CURRENT_CLIENT_ID); if (!c) return;
    const rows = await fetchUpcoming({ email: c.email, phone: c.phone });
    const tbody = document.getElementById('cd-upcoming-rows'); if (!tbody) return;
    tbody.innerHTML = rows.map(it =>
      `<tr><td>${fmtDateTimePL(it.when)}</td><td>${escapeHtml(it.service_name||'-')}</td><td>${escapeHtml(it.status||'-')}</td></tr>`
    ).join('') || '<tr><td colspan="3">Brak danych</td></tr>';
  }

  // ---------- SYNC (Supabase -> localStorage) ----------
  async function sync() {
    const { data, error } = await window.sb
      .from('bookings_view')
      .select('client_name, client_email, phone, address')
      .eq('status', 'Potwierdzona');

    if (error) {
      console.warn('[clients.sync] error:', error);
      return;
    }

    const map = new Map();
    for (const b of (data || [])) {
      const key = (b.client_email || b.phone || '').trim().toLowerCase();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: b.client_name || '',
          email: b.client_email || '',
          phone: b.phone || '',
          address: b.address || '',
          prefs: '', allergies: '', contras: '', notes: '',
          treatmentNotes: {}
        });
      }
    }
    const list = Array.from(map.values());
    if (list.length) clientsSave(list);
  }

  // ---------- WIĄZANIA UI ----------
  function wire() {
    $('#client-search')?.addEventListener('input', render);

    // lista -> Szczegóły
    $('#clients-rows')?.addEventListener('click', (e) => {
      const details = e.target.closest('[data-client-details]');
      if (details) { openClientDetails(details.dataset.clientDetails); }
    });

    // panel Szczegóły – nawigacja
    $('#cd-btn-back')?.addEventListener('click', () => { closeClientDetails(); });

    $('#cd-btn-suggestions')?.addEventListener('click', () => {
      const c = clientsLoad().find(x => x.id === CURRENT_CLIENT_ID); if (!c) return;
      const box = document.getElementById('cd-section-suggestions');
      if (box) box.innerHTML = buildSuggestions(c);
      showSection('cd-section-suggestions');
    });

    $('#cd-btn-history')?.addEventListener('click', async () => {
      await renderDetailsHistory();
      showSection('cd-section-history');
    });

    $('#cd-btn-upcoming')?.addEventListener('click', async () => {
      await renderDetailsUpcoming();
      showSection('cd-section-upcoming');
    });

    $('#cd-btn-contact')?.addEventListener('click', () => {
      showSection('cd-section-contact');
    });

    $('#cd-btn-notes')?.addEventListener('click', () => {
      showSection('cd-section-notes');
    });

    $('#cd-save')?.addEventListener('click', () => {
      if (!CURRENT_CLIENT_ID) return;
      const list = clientsLoad();
      const idx = list.findIndex(x => x.id === CURRENT_CLIENT_ID);
      if (idx < 0) return;
      const c = list[idx];
      c.prefs     = $('#cd-prefs')?.value || '';
      c.allergies = $('#cd-allergies')?.value || '';
      c.contras   = $('#cd-contras')?.value || '';
      c.notes     = $('#cd-notes')?.value || '';
      clientsSave(list);
      alert('Zapisano notatki/ustawienia.');
    });
  }

  // ---------- API ----------
  window.Clients = {
    init() { wire(); render(); sync().then(render).catch(() => {}); },
    render,
    sync
  };
})();
