/* =========================================
   Admin panel – NOWA WERSJA (jednoplikowa)
   - PIN lokalny 2505 (bez pobierania z DB)
   - Zakładki: Rezerwacje / Terminy / Klienci / Ustawienia
   - Rezerwacje: bookings_view + Netlify Functions confirm/cancel
   - Terminy: tylko data/godzina (bez usługi) + zaokrąglanie do 5 minut
   - Klienci: tylko LocalStorage + eksport/import .json
   - Ustawienia: settings (prep_text, pin, contact_*)
   Wymagania: window.sb = Supabase client (assets/supabase-client.js)
========================================= */

(function () {
  'use strict';

  // --- KONFIG ---------------------------------------------------------------
  let PIN = '2505';
  const AUTH_KEY = 'adm_ok';


  // --- UTIL -----------------------------------------------------------------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' }); } catch { return iso||''; } };
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toTelHref(phone){
  const num = String(phone||'').replace(/[^\d+]/g,''); // tylko cyfry i +
  return num ? `tel:${num}` : '';
}
function toMailHref(email, subject='Rezerwacja potwierdzona'){
  const e = String(email||'').trim();
  return e ? `mailto:${encodeURIComponent(e)}?subject=${encodeURIComponent(subject)}` : '';
}
function toMapsHref(address){
  const a = String(address||'').trim();
  return a ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}` : '';
}

  // --- TABS -----------------------------------------------------------------
  function showNav() { const nav = $('#top-tabs'); if (nav) nav.style.display = ''; }
  function showTab(name) {
    const ids = ['bookings','slots','clients','settings'];
    for (const id of ids) {
      const el = document.getElementById(id+'-screen');
      if (el) el.classList.toggle('hidden', id !== name);
    }
    if      (name==='bookings') initBookings();
    else if (name==='slots')    loadSlots();
    else if (name==='clients')  renderClients();
    else if (name==='settings') loadSettings();
  }
  (function wireTabs(){
    $('#top-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      showTab(btn.dataset.tab);
    });
  })();

  // --- LOGIN ----------------------------------------------------------------
  function wireLogin() {
    const pinScr  = $('#pin-screen');
    const bookScr = document.getElementById('bookings-screen') || document.getElementById('list-screen');

    async function afterLogin() {
      pinScr?.classList.add('hidden');
      bookScr?.classList.remove('hidden');
      showNav();
      showTab('bookings');
    }

    if (localStorage.getItem(AUTH_KEY) === '1') { afterLogin(); return; }

    const btn = $('#pin-btn'), inp = $('#pin-input'), err = $('#pin-err');
    const enter = async () => {
      const val = String(inp?.value || '').trim();
      if (!val) { err.textContent = 'Wpisz PIN'; inp?.focus(); return; }
      if (val === PIN) { localStorage.setItem(AUTH_KEY,'1'); await afterLogin(); }
      else { err.textContent = 'Nieprawidłowy PIN'; inp?.select?.(); }
    };
    btn?.addEventListener('click', enter);
    inp?.addEventListener('keydown', (e) => { if (e.key==='Enter') enter(); });
  }

  // --- BOOKINGS -------------------------------------------------------------
 async function fetchBookings() {
  const nowIso = new Date().toISOString();
  let q = window.sb.from('bookings_view')
    .select('*')
    .order('when', { ascending: true });

  // 1) Nie pokazuj anulowanych
  q = q.neq('status', 'Anulowana');

  // 2) Nie pokazuj przeterminowanych (wszystko, co w przeszłości)
  q = q.gte('when', nowIso);

  // (opcjonalnie) filtr statusu z selecta, gdy chcesz go respektować
  const s = document.getElementById('status-filter')?.value || '';
  if (s) q = q.eq('status', s);

  // (opcjonalnie) prosty search po imieniu/mailu
  const term = (document.getElementById('search')?.value || '').trim();
  if (term) {
    q = q.or(`client_name.ilike.%${term}%,client_email.ilike.%${term}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}


  function renderBookingsRows(list) {
  const tbody = document.getElementById('rows');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4">Brak rezerwacji</td>';
    tbody.appendChild(tr);
    return;
  }

for (const b of list) {
  const isConfirmed = (b.status === 'Potwierdzona');
  const badge = isConfirmed
    ? '<span class="status confirmed">Potwierdzona</span>'
    : '<span class="status pending">Oczekująca</span>';

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${b.booking_no || '-'}</td>
    <td>${b.client_name || '-'}</td>
    <td>${fmtWhen(b.when)}</td>
    <td>${badge}</td>
    <td>
      <button class="btn btn-confirm"
              style="background:#16a34a;color:#fff;border-color:#128a3f"
              data-action="confirm" data-id="${b.booking_no}"
              ${isConfirmed ? 'disabled' : ''}>
        Potwierdź
      </button>
      <button class="btn btn-cancel"
              style="background:#dc2626;color:#fff;border-color:#b31f1f"
              data-action="cancel" data-id="${b.booking_no}">
        Usuń
      </button>
      <button class="btn btn-details"
              style="background:#607d8b;color:#fff;border-color:#546e7a"
              data-action="details" data-id="${b.booking_no}">
        Szczegóły
      </button>
    </td>`;
  tr.dataset.details = JSON.stringify(b);
  tbody.appendChild(tr);
}

}


  async function initBookings() {
    try { renderBookingsRows(await fetchBookings()); }
    catch(e){
      const tbody=$('#rows');
      if (tbody) tbody.innerHTML = `<tr><td colspan="4">${e?.message||'Błąd'}</td></tr>`;
    }
  }

  (function wireBookingsToolbar(){
    $('#refresh')?.addEventListener('click', initBookings);
    $('#status-filter')?.addEventListener('change', initBookings);
    $('#q')?.addEventListener('input', () => initBookings());
    $('#from')?.addEventListener('change', initBookings);
    $('#to')?.addEventListener('change', initBookings);
  })();

  async function confirmBooking(booking_no) {
  try {
    const res = await fetch('/.netlify/functions/admin-confirm', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ booking_no })
    });

    const text = await res.text();
    if (!res.ok) {
      // pokaż co przyszło z funkcji
      throw new Error(text || `HTTP ${res.status}`);
    }
    // spróbuj zdekodować JSON
    let out = {};
    try { out = JSON.parse(text || '{}'); } catch { /* ignoruj */ }
    return out;
  } catch (e) {
    console.warn('[admin-confirm] problem, używam fallbacku:', e);
    // Fallback bez e-maili – bezpiecznie zmieniamy status od razu w Supabase:
    const { error } = await window.sb
  .from('bookings')
  .delete()
  .eq('booking_no', booking_no);
    if (error) throw error;
    return { ok:true, fallback:true };
  }
}


  async function cancelBooking(booking_no) {
    try {
      const res = await fetch('/.netlify/functions/admin-cancel', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ booking_no })
      });
      const out = await res.text();
      if (!res.ok) throw new Error(out);
      return JSON.parse(out);
    } catch (e) {
  console.warn('[admin-cancel] fallback (bez funkcji):', e);

  // 1) pobierz when (i ewentualnie slot_id) z widoku
  const { data: b, error: gErr } = await window.sb
    .from('bookings_view')
    .select('when, slot_id')
    .eq('booking_no', booking_no)
    .single();
  if (gErr) throw gErr;

  // 2) oznacz rezerwację jako anulowaną
  const { error: updErr } = await window.sb
    .from('bookings')
    .update({ status: 'Anulowana', canceled_at: new Date().toISOString() })
    .eq('booking_no', booking_no);
  if (updErr) throw updErr;

  // 3) zwolnij slot
  try {
    if (b?.slot_id) {
      await window.sb.from('slots').update({ taken: false }).eq('id', b.slot_id);
    } else {
      const { error: freeErr } = await window.sb
        .from('slots')
        .update({ taken: false })
        .eq('when', b.when);
      if (freeErr && new Date(b.when) > new Date()) {
        await window.sb.from('slots').insert({ when: b.when, taken: false });
      }
    }
  } catch (e2) {
    console.log('[fallback] free slot warn:', e2?.message || e2);
  }

  return { ok: true, fallback: true };
}

  }

  (function wireGlobalActions(){
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]'); if (!btn) return;
      const action = btn.dataset.action; const id = btn.dataset.id;

      if (action === 'details') {
  // PODMIEŃ cały ten blok na:
  const tr = btn.closest('tr');
  const b = JSON.parse(tr.dataset.details || '{}');

  const addr  = b.address || '';
  const email = b.client_email || b.email || '';
  const phone = b.phone || b.client_phone || '';

  const mapH  = addr  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : '';
  const mailH = email ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Rezerwacja potwierdzona')}` : '';
  const telH  = phone ? `tel:${String(phone).replace(/[^\d+]/g,'')}` : '';

  const modal = document.getElementById('details-modal');
  const body  = document.getElementById('details-body');
  if (modal && body) {
    body.innerHTML = `
      <p><b>Nr rezerwacji:</b> ${b.booking_no || ''}</p>
      <p><b>Imię i nazwisko:</b> ${b.client_name || ''}</p>
      <p><b>Termin:</b> ${fmtWhen(b.when)}</p>
      <p><b>Usługa:</b> ${b.service_name || ''}</p>
      <p><b>Adres:</b> ${addr ? `<a href="${mapH}" target="_blank" rel="noopener">${addr}</a>` : '-'}</p>
      <p><b>E-mail:</b> ${email ? `<a href="${mailH}">${email}</a>` : '-'}</p>
      <p><b>Telefon:</b> ${phone ? `<a href="${telH}">${phone}</a>` : '-'}</p>
      <p><b>Uwagi:</b> ${b.notes || '-'}</p>`;
    modal.classList.remove('hidden');
  }
  return;
}

      if (action==='confirm') {
        btn.disabled = true;
        try { await confirmBooking(id); await initBookings(); }
        catch(err){ alert('Błąd potwierdzania: ' + (err?.message||err)); }
        finally { btn.disabled = false; }
        return;
      }

      if (action==='cancel') {
        if (!confirm('Na pewno anulować tę rezerwację?')) return;
        btn.disabled = true;
        try { await cancelBooking(id); await initBookings(); }
        catch(err){ alert('Błąd anulowania: ' + (err?.message||err)); }
        finally { btn.disabled = false; }
        return;
      }
    });
    $('#close-details')?.addEventListener('click', () => { $('#details-modal')?.classList.add('hidden'); });
    document.addEventListener('keydown', (e) => { if (e.key==='Escape') $('#details-modal')?.classList.add('hidden'); });
  })();

  // --- SLOTS (bez usługi, zaokrąglanie do 5 min) ----------------------------
  async function loadSlots() {
  const tbody = document.getElementById('slots-rows'); if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3">Ładowanie…</td></tr>';

  const nowIso = new Date().toISOString();

  const { data, error } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .gte('when', nowIso)                // <— POKAZUJEMY TYLKO PRZYSZŁE
    .order('when', { ascending:true });

  if (error) { tbody.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`; return; }

  tbody.innerHTML = '';
  for (const s of (data || [])) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtWhen(s.when)}</td>
      <td>${s.taken ? 'Zajęty' : 'Wolny'}</td>
      <td><button class="btn" data-slot-del="${s.id}" ${s.taken ? 'disabled':''}>Usuń</button></td>`;
    tbody.appendChild(tr);
  }

  if (!data || data.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="3">Brak przyszłych terminów</td>';
    tbody.appendChild(tr);
  }
}
// =============== KLIENCI ===============

const CLIENTS_LS_KEY = 'adm_clients_v1';
const CLIENTS_EXPORT_VERSION = 2;

// Model klienta
function clientNew() {
  return {
    id: cryptoRandId(),
    name: '', email: '', phone: '', address: '',
    prefs: '', allergies: '', contras: '', notes: '',
    treatmentNotes: {} // notatki przypięte do booking_no
  };
}

// localStorage helpers
function clientsLoad() {
  try {
    const raw = localStorage.getItem(CLIENTS_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function clientsSave(list) {
  localStorage.setItem(CLIENTS_LS_KEY, JSON.stringify(list || []));
}
function cryptoRandId() {
  const a = new Uint8Array(8); (self.crypto||window.crypto).getRandomValues(a);
  return Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join('');
}

// Filtrowanie listy
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

// Render listy klientów
function renderClients() {
  const tbody = document.getElementById('clients-rows');
  const term = document.getElementById('client-search')?.value || '';
  const list = clientsFilter(term);
  tbody.innerHTML = '';
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5">Brak klientów</td></tr>`;
    return;
  }
  for (const c of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name || '-')}</td>
      <td>${escapeHtml(c.email || '-')}</td>
      <td>${escapeHtml(c.phone || '-')}</td>
      <td>-</td>
      <td>
        <button class="btn" data-client-edit="${c.id}">Edytuj</button>
        <button class="btn btn-cancel" data-client-del="${c.id}">Usuń</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

// Modal klienta (edycja podstawowych danych)
let CLIENT_EDIT_ID = null;

function openClientModal(id) {
  const list = clientsLoad();
  let c = list.find(x => x.id === id);
  if (!c) { c = clientNew(); c.id = id || c.id; list.push(c); clientsSave(list); }
  CLIENT_EDIT_ID = c.id;
  document.getElementById('client-modal-title').textContent = c.name || 'Nowy klient';
  document.getElementById('c-name').value = c.name;
  document.getElementById('c-email').value = c.email;
  document.getElementById('c-phone').value = c.phone;
  document.getElementById('c-address').value = c.address;
  document.getElementById('c-prefs').value = c.prefs;
  document.getElementById('c-allergies').value = c.allergies;
  document.getElementById('c-contras').value = c.contras;
  document.getElementById('c-notes').value = c.notes;
  document.getElementById('client-modal').classList.remove('hidden');
}
function closeClientModal() {
  document.getElementById('client-modal').classList.add('hidden');
  CLIENT_EDIT_ID = null;
}
function readClientForm() {
  return {
    id: CLIENT_EDIT_ID,
    name: document.getElementById('c-name').value.trim(),
    email: document.getElementById('c-email').value.trim(),
    phone: document.getElementById('c-phone').value.trim(),
    address: document.getElementById('c-address').value.trim(),
    prefs: document.getElementById('c-prefs').value.trim(),
    allergies: document.getElementById('c-allergies').value.trim(),
    contras: document.getElementById('c-contras').value.trim(),
    notes: document.getElementById('c-notes').value.trim(),
    treatmentNotes: clientsLoad().find(x=>x.id===CLIENT_EDIT_ID)?.treatmentNotes || {}
  };
}

// Historia z Supabase
async function fetchHistoryFromSupabase({ email, phone }) {
  let q = window.sb.from('bookings_view')
    .select('booking_no, when, service_name, status')
    .eq('status','Potwierdzona')
    .order('when', { ascending: false });

  if (email) q = q.eq('client_email', email.toLowerCase());
  else if (phone) q = q.eq('phone', phone);
  else return [];

  const { data, error } = await q;
  if (error) { console.warn('history error', error); return []; }
  return data || [];
}

// Modal HISTORIA
let HISTORY_CURRENT_ID = null;

async function openHistoryModal(clientId) {
  const list = clientsLoad();
  const c = list.find(x => x.id === clientId);
  if (!c) return;
  HISTORY_CURRENT_ID = c.id;
  document.getElementById('history-client-name').textContent = c.name || '(bez nazwy)';

  const rows = await fetchHistoryFromSupabase({ email: c.email, phone: c.phone });
  const tbody = document.getElementById('history-rows'); tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4">Brak potwierdzonych zabiegów</td></tr>';
  } else {
    for (const it of rows) {
      const localNote = (c.treatmentNotes||{})[it.booking_no] || '';
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

  document.getElementById('history-modal').classList.remove('hidden');
}
function closeHistoryModal() {
  document.getElementById('history-modal').classList.add('hidden');
  HISTORY_CURRENT_ID = null;
}

// Sugestie
function openSuggestionsModal(clientId) {
  const c = clientsLoad().find(x => x.id === clientId);
  if (!c) return;
  document.getElementById('suggestions-body').innerHTML = buildSuggestions(c);
  document.getElementById('suggestions-modal').classList.remove('hidden');
}
function closeSuggestionsModal() {
  document.getElementById('suggestions-modal').classList.add('hidden');
}

// Sugestie terapeutyczne
function buildSuggestions(c) {
  const out = [];
  const txt = (s)=>String(s||'').toLowerCase();
  if (txt(c.allergies).includes('olej')) out.push('Unikaj olejków zapachowych.');
  if (txt(c.prefs).includes('mocny')) out.push('Lubi mocny masaż.');
  if (Object.keys(c.treatmentNotes||{}).length > 3) out.push('Klient regularny – zaproponuj pakiet.');
  if (!out.length) out.push('Brak szczególnych zaleceń.');
  return out.join('<br>');
}

// Historia - zapis lokalnej notatki
function wireHistoryModalHandlers() {
  document.getElementById('history-rows')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hist-save]');
    if (!btn || !HISTORY_CURRENT_ID) return;
    const bookingNo = btn.dataset.histSave;
    const tr = btn.closest('tr');
    const val = tr.querySelector('.treat-note')?.value || '';
    const list = clientsLoad();
    const c = list.find(x => x.id === HISTORY_CURRENT_ID);
    c.treatmentNotes[bookingNo] = val;
    clientsSave(list);
    alert('Zapisano notatkę lokalną.');
  });
  document.getElementById('history-close')?.addEventListener('click', closeHistoryModal);
}

// Wire wszystko
function wireClients() {
  document.getElementById('client-search')?.addEventListener('input', renderClients);
  document.getElementById('client-add')?.addEventListener('click', () => {
    const c = clientNew();
    const list = clientsLoad(); list.push(c); clientsSave(list);
    openClientModal(c.id);
  });

  document.getElementById('clients-rows')?.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-client-edit]');
    const del  = e.target.closest('[data-client-del]');
    if (edit) openClientModal(edit.dataset.clientEdit);
    if (del) {
      if (!confirm('Usunąć klienta?')) return;
      const list = clientsLoad().filter(x=>x.id!==del.dataset.clientDel);
      clientsSave(list); renderClients();
    }
  });

  document.getElementById('client-close')?.addEventListener('click', closeClientModal);
  document.getElementById('client-save')?.addEventListener('click', () => {
    const updated = readClientForm();
    const list = clientsLoad();
    const idx = list.findIndex(x=>x.id===updated.id);
    if (idx>=0) list[idx] = updated; else list.push(updated);
    clientsSave(list);
    renderClients();
    closeClientModal();
  });
  document.getElementById('client-delete')?.addEventListener('click', () => {
    if (!CLIENT_EDIT_ID) return;
    if (!confirm('Usunąć klienta?')) return;
    const list = clientsLoad().filter(x=>x.id!==CLIENT_EDIT_ID);
    clientsSave(list); renderClients(); closeClientModal();
  });

  document.getElementById('btn-history-modal')?.addEventListener('click', () => {
    if (CLIENT_EDIT_ID) openHistoryModal(CLIENT_EDIT_ID);
  });
  document.getElementById('btn-suggestions-modal')?.addEventListener('click', () => {
    if (CLIENT_EDIT_ID) openSuggestionsModal(CLIENT_EDIT_ID);
  });
  document.getElementById('suggestions-close')?.addEventListener('click', closeSuggestionsModal);

  wireHistoryModalHandlers();
}


  (function wireSlots(){
    $('#slot-add')?.addEventListener('click', async () => {
      const when = $('#slot-date')?.value;
      if (!when) { alert('Podaj datę'); return; }
      const dt = new Date(when);
      dt.setSeconds(0,0);
      const m = dt.getMinutes();
      const rounded = Math.round(m/15)*15;
      dt.setMinutes(rounded);
      const { error } = await window.sb.from('slots').insert({ when: dt.toISOString(), taken: false });
      if (error) { alert(error.message); return; }
      $('#slot-date').value = '';
      loadSlots();
    });

    $('#slots-rows')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-slot-del]'); if (!btn) return;
      const id = btn.getAttribute('data-slot-del');
      if (!confirm('Usunąć ten wolny termin?')) return;
      const { error } = await window.sb.from('slots').delete().eq('id', id).eq('taken', false);
      if (error) { alert(error.message); return; }
      loadSlots();
    });
  })();

  // --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  wireLogin();
  wireClients();
});
// --- CLIENTS SYNC ---------------------------------------------------------
const CLIENTS_LS_KEY = 'adm_clients_v1';

function clientsLoad() {
  try { return JSON.parse(localStorage.getItem(CLIENTS_LS_KEY)) || []; }
  catch { return []; }
}

function clientsSave(list) {
  localStorage.setItem(CLIENTS_LS_KEY, JSON.stringify(list));
}

function renderClients() {
  const list = clientsLoad();
  const tbody = document.getElementById('clients-rows');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">Brak klientów</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${escapeHtml(c.name || '')}</td>
      <td>${escapeHtml(c.email || '')}</td>
      <td>${escapeHtml(c.phone || '')}</td>
      <td>
        <button data-action="history" data-id="${c.id}">Historia</button>
      </td>
    </tr>
  `).join('');
}

// Pobierz klientów z bookings_view i zapisz lokalnie
async function syncClientsFromSupabase() {
  const { data, error } = await window.sb
    .from('bookings_view')
    .select('client_name, client_email, client_phone')
    .eq('status', 'Potwierdzona');

  if (error) {
    alert('Błąd synchronizacji klientów: ' + error.message);
    return;
  }

  const unique = new Map();
  (data || []).forEach(b => {
    const id = (b.client_email || b.client_phone || '').trim().toLowerCase();
    if (!id) return;
    if (!unique.has(id)) {
      unique.set(id, {
        id,
        name: b.client_name || '',
        email: b.client_email || '',
        phone: b.client_phone || ''
      });
    }
  });

  const list = Array.from(unique.values());
  clientsSave(list);
  renderClients();
  alert(`Zsynchronizowano ${list.length} klientów.`);
}

/* removed legacy {fname} */
})();
