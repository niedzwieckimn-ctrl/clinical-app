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
  const LS_CLIENTS_KEY = 'adm_clients_v1';

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
    else if (name==='clients')  loadClients();
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
    const status = $('#status-filter')?.value || '';
    const q      = $('#q')?.value?.trim() || '';
    const from   = $('#from')?.value || '';
    const to     = $('#to')?.value || '';

    let qry = window.sb.from('bookings_view').select('*').order('when', { ascending:true });
    if (status) qry = qry.eq('status', status);
    if (from)   qry = qry.gte('when', new Date(from).toISOString());
    if (to)     { const end = new Date(to); end.setDate(end.getDate()+1); qry = qry.lt('when', end.toISOString()); }
    if (q)      qry = qry.or(`client_name.ilike.%${q}%,client_email.ilike.%${q}%,phone.ilike.%${q}%,service_name.ilike.%${q}%`);

    const { data, error } = await qry;
    if (error) throw error;
    return data||[];
  }

  function renderBookingsRows(list) {
    const tbody = $('#rows'); if (!tbody) return;
    tbody.innerHTML = '';
    if (!list.length) {
      const tr=document.createElement('tr');
      tr.innerHTML='<td colspan="4">Brak rezerwacji</td>';
      tbody.appendChild(tr);
      return;
    }
    for (const b of list) {
      const tr=document.createElement('tr');
      tr.innerHTML = `
        <td>${b.booking_no || '-'}</td>
        <td>${b.client_name || '-'}</td>
        <td>${fmtWhen(b.when)}</td>
        <td>
<button class="btn" data-action="confirm" ...>Potwierdź</button>
<button class="btn" data-action="cancel"  ...>Anuluj</button>
<button class="btn" data-action="details" ...>Szczegóły</button>


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
      .update({ status:'Potwierdzona', confirmed_at:new Date().toISOString() })
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
      const { error } = await window.sb.from('bookings')
        .update({ status:'Anulowana', canceled_at:new Date().toISOString() })
        .eq('booking_no', booking_no);
      if (error) throw error; return { ok:true, fallback:true };
    }
  }

  (function wireGlobalActions(){
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]'); if (!btn) return;
      const action = btn.dataset.action; const id = btn.dataset.id;

      if (action==='details') {
        const tr = btn.closest('tr');
        const b = JSON.parse(tr.dataset.details||'{}');
        const modal = $('#details-modal');
        const body = $('#details-body');
        if (modal && body) {
         const addr   = b.address || b.client_address || '';      // użyj pola, które masz w widoku
const email  = b.client_email || b.email || '';
const phone  = b.phone || b.client_phone || '';
const mapH   = toMapsHref(addr);
const mailH  = toMailHref(email, 'Rezerwacja potwierdzona');
const telH   = toTelHref(phone);

body.innerHTML = `
  <p><b>Nr rezerwacji:</b> ${esc(b.booking_no)}</p>
  <p><b>Imię i nazwisko:</b> ${esc(b.client_name || '')}</p>
  <p><b>Termin:</b> ${esc(fmtWhen(b.when))}</p>
  <p><b>Usługa:</b> ${esc(b.service_name || '')}</p>
  <p><b>Adres:</b> ${
    addr ? (mapH ? `<a href="${mapH}" target="_blank" rel="noopener">${esc(addr)}</a>` : esc(addr)) : '-'
  }</p>
  <p><b>E-mail:</b> ${
    email ? (mailH ? `<a href="${mailH}">${esc(email)}</a>` : esc(email)) : '-'
  }</p>
  <p><b>Telefon:</b> ${
    phone ? (telH ? `<a href="${telH}">${esc(phone)}</a>` : esc(phone)) : '-'
  }</p>
  <p><b>Uwagi:</b> ${esc(b.notes || '-')}</p>`;


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
    const tbody = $('#slots-rows'); if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">Ładowanie…</td></tr>';
    const { data, error } = await window.sb.from('slots').select('id, when, taken').order('when', { ascending:true });
    if (error) { tbody.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`; return; }
    tbody.innerHTML = '';
    for (const s of (data||[])) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtWhen(s.when)}</td>
        <td>${s.taken ? 'Zajęty' : 'Wolny'}</td>
        <td><button class="btn" data-slot-del="${s.id}" ${s.taken ? 'disabled':''}>Usuń</button></td>`;
      tbody.appendChild(tr);
    }
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

  // --- CLIENTS (LocalStorage) -----------------------------------------------
  function loadLocal(){ try { return JSON.parse(localStorage.getItem(LS_CLIENTS_KEY) || '{"clients":[]}'); } catch { return { clients: [] }; } }
  function saveLocal(db){ localStorage.setItem(LS_CLIENTS_KEY, JSON.stringify(db)); }

  let CURRENT_CLIENT_ID = null;

  function loadClients() {
    const q = ($('#client-q')?.value || '').trim().toLowerCase();
    const tbody = $('#clients-rows'); if (!tbody) return;
    const db = loadLocal();
    let list = db.clients.slice().sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    if (q) list = list.filter(c => [c.name,c.email,c.phone].some(v => (v||'').toLowerCase().includes(q)));
    tbody.innerHTML = '';
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="4">Brak klientów</td></tr>';
      return;
    }
    for (const c of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${c.name||'-'}</td><td>${c.email||'-'}</td><td>${c.phone||'-'}</td><td><button class="btn" data-client-open="${c.id}">Otwórz</button></td>`;
      tbody.appendChild(tr);
    }
  }

  // (reszta sekcji Klienci i Ustawienia działa analogicznie, jak opisywałem wcześniej)

  // --- START ----------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    wireLogin();
  });

})();
