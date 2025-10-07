// assets/clients.js
(function () {
  'use strict';

  // ---------- UTIL ----------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const escapeHtml = (s) => String(s||'').replace(/&/g,'&amp;')
                                         .replace(/</g,'&lt;')
                                         .replace(/>/g,'&gt;');
  const fmtDatePL = (iso) => {
    try { return new Date(iso).toLocaleDateString('pl-PL', { dateStyle:'medium' }); }
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
  let CLIENT_EDIT_ID = null;
  let HISTORY_CURRENT_ID = null;

  function newId() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function clientNew() {
    return {
      id: newId(),
      name: '', email: '', phone: '', address: '',
      prefs: '', allergies: '', contras: '', notes: '',
      treatmentNotes: {} // notatki lokalne per booking_no
    };
  }

  // ---------- RENDER LISTY ----------
  function clientsFilter(term) {
    term = (term||'').toLowerCase();
    const list = clientsLoad();
    if (!term) return list;
    return list.filter(c =>
      (c.name||'').toLowerCase().includes(term) ||
      (c.email||'').toLowerCase().includes(term) ||
      (c.phone||'').toLowerCase().includes(term)
    );
  }

  function render() {
    const tbody = $('#clients-rows');
    if (!tbody) return;

    const term = $('#client-search')?.value || '';
    const list = clientsFilter(term);

    tbody.innerHTML = '';
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5">Brak klientów</td></tr>';
      return;
    }

    for (const c of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(c.name || '-')}</td>
        <td>${escapeHtml(c.email || '-')}</td>
        <td>${escapeHtml(c.phone || '-')}</td>
        <td>${escapeHtml(c.address || '-')}</td>
        <td>
          <button class="btn" data-client-edit="${c.id}">Edytuj</button>
          <button class="btn btn-cancel" data-client-del="${c.id}">Usuń</button>
          <button class="btn" data-client-history="${c.id}">Historia</button>
          <button class="btn" data-client-suggest="${c.id}">Sugestie</button>
        </td>`;
      tbody.appendChild(tr);
    }
  }

  // ---------- FORM / MODALE ----------
  function openClientModal(id) {
  const list = clientsLoad();
  let c = list.find(x => x.id === id);
  if (!c) { c = clientNew(); c.id = id || c.id; list.push(c); clientsSave(list); }
  CLIENT_EDIT_ID = c.id;

  // bezpieczne settery — nie wywalą się, jeśli pole nie istnieje
  const setVal = (elId, val='') => {
    const el = document.getElementById(elId);
    if (el) el.value = val || '';
  };
  const setText = (elId, txt='') => {
    const el = document.getElementById(elId);
    if (el) el.textContent = txt || '';
  };

  setText('client-modal-title', c.name || 'Nowy klient');
  setVal('c-name',      c.name);
  setVal('c-email',     c.email);
  setVal('c-phone',     c.phone);
  setVal('c-address',   c.address);
  setVal('c-prefs',     c.prefs);
  setVal('c-allergies', c.allergies);
  setVal('c-contras',   c.contras);
  setVal('c-notes',     c.notes);

  const modal = document.getElementById('client-modal');
  if (modal) modal.classList.remove('hidden');
}


  function closeClientModal() {
    $('#client-modal')?.classList.add('hidden');
    CLIENT_EDIT_ID = null;
  }

  function readClientForm() {
    const existing = clientsLoad().find(x => x.id === CLIENT_EDIT_ID) || {};
    return {
      id: CLIENT_EDIT_ID,
      name: ($('#c-name')?.value || '').trim(),
      email: ($('#c-email')?.value || '').trim(),
      phone: ($('#c-phone')?.value || '').trim(),
      address: ($('#c-address')?.value || '').trim(),
      prefs: ($('#c-prefs')?.value || '').trim(),
      allergies: ($('#c-allergies')?.value || '').trim(),
      contras: ($('#c-contras')?.value || '').trim(),
      notes: ($('#c-notes')?.value || '').trim(),
      treatmentNotes: existing.treatmentNotes || {}
    };
  }

  // ---------- HISTORIA (Supabase) ----------
  async function fetchHistory({ email, phone }) {
    let q = window.sb.from('bookings_view')
      .select('booking_no, when, service_name, status')
      .eq('status','Potwierdzona')
      .order('when', { ascending: false });

    if (email)        q = q.eq('client_email', String(email).toLowerCase());
    else if (phone)   q = q.eq('phone', phone);
    else              return [];

    const { data, error } = await q;
    if (error) { console.warn('history error', error); return []; }
    return data || [];
  }

  async function openHistoryModal(clientId) {
    const list = clientsLoad();
    const c = list.find(x => x.id === clientId);
    if (!c) return;

    HISTORY_CURRENT_ID = c.id;
    const nameEl = $('#history-client-name');
    if (nameEl) nameEl.textContent = c.name || '(bez nazwy)';

    const rows = await fetchHistory({ email: c.email, phone: c.phone });
    const tbody = $('#history-rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4">Brak potwierdzonych zabiegów</td></tr>';
    } else {
      for (const it of rows) {
        const localNote = (c.treatmentNotes || {})[it.booking_no] || '';
        const tr = document.createElement('tr');
        tr.dataset.bookingNo = it.booking_no;
        tr.innerHTML = `
          <td>${fmtDatePL(it.when)}</td>
          <td>${escapeHtml(it.service_name || '-')}</td>
          <td><textarea class="treat-note" rows="2">${escapeHtml(localNote)}</textarea></td>
          <td><button class="btn" data-hist-save="${it.booking_no}">Zapisz</button></td>`;
        tbody.appendChild(tr);
      }
    }
    $('#history-modal')?.classList.remove('hidden');
  }

  function closeHistoryModal() {
    $('#history-modal')?.classList.add('hidden');
    HISTORY_CURRENT_ID = null;
  }

  // ---------- SUGESTIE ----------
  function buildSuggestions(c) {
    const out = [];
    const txt = (s)=>String(s||'').toLowerCase();
    if (txt(c.allergies).includes('olej')) out.push('Unikaj olejków zapachowych.');
    if (txt(c.prefs).includes('mocny'))    out.push('Lubi mocny masaż.');
    if (Object.keys(c.treatmentNotes||{}).length > 3) out.push('Klient regularny – zaproponuj pakiet.');
    if (!out.length) out.push('Brak szczególnych zaleceń.');
    return out.join('<br>');
  }

  function openSuggestionsModal(clientId) {
    const c = clientsLoad().find(x => x.id === clientId);
    if (!c) return;
    const box = $('#suggestions-body');
    if (box) box.innerHTML = buildSuggestions(c);
    $('#suggestions-modal')?.classList.remove('hidden');
  }

  function closeSuggestionsModal() {
    $('#suggestions-modal')?.classList.add('hidden');
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
      const idKey = (b.client_email || b.phone || '').trim().toLowerCase();
      if (!idKey) continue;

      if (!map.has(idKey)) {
        map.set(idKey, {
          id: idKey,                           // stabilny identyfikator po email/telefon
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

    $('#client-add')?.addEventListener('click', () => {
      const list = clientsLoad();
      const c = clientNew(); list.push(c); clientsSave(list);
      openClientModal(c.id);
      render();
    });

    $('#clients-rows')?.addEventListener('click', (e) => {
      const edit = e.target.closest('[data-client-edit]');
      const del  = e.target.closest('[data-client-del]');
      const hst  = e.target.closest('[data-client-history]');
      const sgs  = e.target.closest('[data-client-suggest]');

      if (edit) { openClientModal(edit.dataset.clientEdit); return; }

      if (del) {
        if (!confirm('Usunąć klienta?')) return;
        const list = clientsLoad().filter(x=>x.id!==del.dataset.clientDel);
        clientsSave(list);
        render();
        return;
      }

      if (hst) { openHistoryModal(hst.dataset.clientHistory); return; }
      if (sgs) { openSuggestionsModal(sgs.dataset.clientSuggest); return; }
    });

    $('#client-close')?.addEventListener('click', () => { closeClientModal(); });

    $('#client-save')?.addEventListener('click', () => {
      const updated = readClientForm();
      const list = clientsLoad();
      const idx = list.findIndex(x=>x.id===updated.id);
      if (idx>=0) list[idx] = updated; else list.push(updated);
      clientsSave(list);
      render();
      closeClientModal();
    });

    $('#client-delete')?.addEventListener('click', () => {
      if (!CLIENT_EDIT_ID) return;
      if (!confirm('Usunąć klienta?')) return;
      const list = clientsLoad().filter(x=>x.id!==CLIENT_EDIT_ID);
      clientsSave(list);
      render();
      closeClientModal();
    });

    // Historia – zapis lokalnych notatek
    $('#history-rows')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-hist-save]'); if (!btn || !HISTORY_CURRENT_ID) return;
      const bookingNo = btn.dataset.histSave;
      const tr = btn.closest('tr');
      const val = tr.querySelector('.treat-note')?.value || '';
      const list = clientsLoad();
      const c = list.find(x => x.id === HISTORY_CURRENT_ID);
      if (!c) return;
      c.treatmentNotes = c.treatmentNotes || {};
      c.treatmentNotes[bookingNo] = val;
      clientsSave(list);
      alert('Zapisano notatkę.');
    });

    $('#history-close')?.addEventListener('click', () => { closeHistoryModal(); });
    $('#suggestions-close')?.addEventListener('click', () => { closeSuggestionsModal(); });
  }

  // ---------- API ----------
  window.Clients = {
    // Auto-sync przy starcie, bez przycisku:
    init() { wire(); render(); sync().then(render).catch(() => {}); },
    render,
    sync
  };
})();
