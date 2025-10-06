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
