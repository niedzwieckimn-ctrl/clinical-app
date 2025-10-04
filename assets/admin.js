/* =========================================
   Admin panel – NOWA WERSJA (jednoplikowa)
   Funkcje:
   - Logowanie PIN (lokalne) – #pin-screen, #pin-input, #pin-btn, #pin-err
   - Zakładki (Rezerwacje / Terminy / Klienci / Ustawienia) – #top-tabs
   - Rezerwacje (Supabase: bookings_view + Netlify Functions confirm/cancel)
   - Terminy (Supabase: slots – dodawanie/usuwanie wolnych)
   - Klienci (TYLKO localStorage + eksport/import .json)
   - Ustawienia (Supabase: settings key/value – prep_text, pin, contact_*)
   Wymagania:
   - window.sb = Supabase client (assets/supabase-client.js)
   - index.html posiada sekcje: #pin-screen, #bookings-screen, #slots-screen, #clients-screen, #settings-screen
   - istnieje modal #details-modal (Szczegóły rezerwacji) z #details-body i #close-details
   ========================================= */

(function () {
  'use strict';

  // --- KONFIG / STAŁE ------------------------------------------------------
  // Uwaga: PIN z ustawień można wczytać później; na start trzymamy lokalną stałą,
  // a jeśli w tabeli `settings` jest key=pin, to nadpiszemy w czasie działania.
  let PIN = '2505';
  const AUTH_KEY = 'adm_ok';    // flaga zalogowania (localStorage)
  const LS_CLIENTS_KEY = 'adm_clients_v1';

  // --- UTIL ----------------------------------------------------------------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));

  function fmtWhen(iso) {
    try { return new Date(iso).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' }); }
    catch { return iso || ''; }
  }

  function uid() {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID() :
      ('id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  }

  // --- TABS / EKRANY -------------------------------------------------------
  function showNav() {
    const nav = $('#top-tabs');
    if (nav) nav.style.display = '';
  }
  function hideNav() {
    const nav = $('#top-tabs');
    if (nav) nav.style.display = 'none';
  }
  function showTab(name) {
    const ids = ['bookings', 'slots', 'clients', 'settings'];
    for (const id of ids) {
      const scr = document.getElementById(`${id}-screen`);
      if (scr) scr.classList.toggle('hidden', id !== name);
    }
    if (name === 'bookings') initBookings();
    if (name === 'slots')    loadSlots();
    if (name === 'clients')  loadClients();
    if (name === 'settings') loadSettings();
  }
  function wireTabs() {
    $('#top-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      showTab(btn.dataset.tab);
    });
  }

  // --- LOGOWANIE PIN -------------------------------------------------------
  async function tryFetchPinSetting() {
    try {
      if (!window.sb) return;
      const { data, error } = await window.sb
        .from('settings')
        .select('value')
        .eq('key', 'pin')
        .single();
      if (!error && data && data.value) PIN = String(data.value);
    } catch {}
  }

  function wireLogin() {
    const pinScr  = $('#pin-screen');
    const bookScr = $('#bookings-screen');

    async function showAfterLogin() {
      pinScr?.classList.add('hidden');
      bookScr?.classList.remove('hidden');
      showNav();
      showTab('bookings');
    }

    if (localStorage.getItem(AUTH_KEY) === '1') {
      showAfterLogin();
      return;
    }

    // Wczytaj PIN z ustawień (jeśli jest), ale nie blokuj UI.
    tryFetchPinSetting();

    const btn = $('#pin-btn');
    const inp = $('#pin-input');
    const err = $('#pin-err');

    const enter = async () => {
      const val = String(inp?.value || '').trim();
      if (!val) { err.textContent = 'Wpisz PIN'; inp?.focus(); return; }
      if (val === PIN) {
        localStorage.setItem(AUTH_KEY, '1');
        await showAfterLogin();
      } else {
        err.textContent = 'Nieprawidłowy PIN';
        inp?.select?.();
      }
    };

    btn?.addEventListener('click', enter);
    inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
  }

  // --- REZERWACJE (Supabase: bookings_view) --------------------------------
  async function fetchBookings() {
    const status = $('#status-filter')?.value || '';
    const q      = $('#q')?.value?.trim() || '';
    const from   = $('#from')?.value || '';
    const to     = $('#to')?.value || '';

    let qry = window.sb
      .from('bookings_view')
      .select('*')
      .order('when', { ascending: true });

    if (status) qry = qry.eq('status', status);
    if (from)   qry = qry.gte('when', new Date(from).toISOString());
    if (to) {
      const end = new Date(to);
      end.setDate(end.getDate() + 1); // inclusive day
      qry = qry.lt('when', end.toISOString());
    }
    if (q) {
      qry = qry.or(
        `client_name.ilike.%${q}%,client_email.ilike.%${q}%,phone.ilike.%${q}%,service_name.ilike.%${q}%`
      );
    }

    const { data, error } = await qry;
    if (error) throw error;
    return data || [];
  }

  function renderBookingsRows(list) {
    const tbody = $('#rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!list.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4">Brak rezerwacji</td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const b of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${b.booking_no || '-'}</td>
        <td>${b.client_name || '-'}</td>
        <td>${fmtWhen(b.when)}</td>
        <td>
          <button class="btn btn-confirm" data-action="confirm" data-id="${b.booking_no}">Potwierdź</button>
          <button class="btn btn-cancel" data-action="cancel" data-id="${b.booking_no}">Anuluj</button>
          <button class="btn btn-details" data-action="details" data-id="${b.booking_no}">Szczegóły</button>
        </td>
      `;
      tr.dataset.details = JSON.stringify(b);
      tbody.appendChild(tr);
    }
  }

  async function initBookings() {
    const root = $('#bookings-screen');
    if (!root || root.classList.contains('loading')) return; // prosta osłona przed spamem
    root.classList.add('loading');
    try {
      const items = await fetchBookings();
      renderBookingsRows(items);
    } catch (e) {
      console.error(e);
      const tbody = $('#rows');
      if (tbody) tbody.innerHTML = `<tr><td colspan="4">${(e && e.message) || 'Błąd'}</td></tr>`;
    } finally {
      root.classList.remove('loading');
    }
  }

  function wireBookingsToolbar() {
    $('#refresh')?.addEventListener('click', initBookings);
    $('#status-filter')?.addEventListener('change', initBookings);
    $('#q')?.addEventListener('input', () => initBookings());
    $('#from')?.addEventListener('change', initBookings);
    $('#to')?.addEventListener('change', initBookings);
  }

  // --- AKCJE POTWIERDŹ/ANULUJ + MODAL SZCZEGÓŁÓW ---------------------------
  async function confirmBooking(booking_no) {
    // WARIANT A (Netlify Function) – także wysyła e-mail do klienta i masażystki
    try {
      const res = await fetch('/.netlify/functions/admin-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_no })
      });
      const out = await res.text();
      if (!res.ok) throw new Error(out);
      return JSON.parse(out);
    } catch (e) {
      console.warn('[admin-confirm] funkcja niedostępna – fallback bezpośredni', e);
      // WARIANT B (fallback – aktualizacja przez anon klienta)
      const { error } = await window.sb
        .from('bookings')
        .update({ status: 'Potwierdzona', confirmed_at: new Date().toISOString() })
        .eq('booking_no', booking_no);
      if (error) throw error;
      return { ok: true, fallback: true };
    }
  }

  async function cancelBooking(booking_no) {
    try {
      const res = await fetch('/.netlify/functions/admin-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_no })
      });
      const out = await res.text();
      if (!res.ok) throw new Error(out);
      return JSON.parse(out);
    } catch (e) {
      console.warn('[admin-cancel] funkcja niedostępna – fallback bezpośredni', e);
      const { error } = await window.sb
        .from('bookings')
        .update({ status: 'Anulowana', canceled_at: new Date().toISOString() })
        .eq('booking_no', booking_no);
      if (error) throw error;
      return { ok: true, fallback: true };
    }
  }

  function wireGlobalActions() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'details') {
        const tr = btn.closest('tr');
        const b = JSON.parse(tr.dataset.details || '{}');
        const modal = $('#details-modal');
        const body = $('#details-body');
        if (modal && body) {
          body.innerHTML = `
            <p><b>Nr rezerwacji:</b> ${b.booking_no || ''}</p>
            <p><b>Imię i nazwisko:</b> ${b.client_name || ''}</p>
            <p><b>Termin:</b> ${fmtWhen(b.when)}</p>
            <p><b>Usługa:</b> ${b.service_name || ''}</p>
            <p><b>Telefon:</b> ${b.phone || ''}</p>
            <p><b>Uwagi:</b> ${b.notes || '-'}</p>
          `;
          modal.classList.remove('hidden');
        }
        return;
      }

      if (action === 'confirm') {
        btn.disabled = true;
        try {
          await confirmBooking(id);
          await initBookings();
        } catch (err) {
          alert('Błąd potwierdzania: ' + (err?.message || err));
        } finally {
          btn.disabled = false;
        }
        return;
      }

      if (action === 'cancel') {
        if (!confirm('Na pewno anulować tę rezerwację?')) return;
        btn.disabled = true;
        try {
          await cancelBooking(id);
          await initBookings();
        } catch (err) {
          alert('Błąd anulowania: ' + (err?.message || err));
        } finally {
          btn.disabled = false;
        }
        return;
      }
    });

    $('#close-details')?.addEventListener('click', () => {
      $('#details-modal')?.classList.add('hidden');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $('#details-modal')?.classList.add('hidden');
    });
  }

  // --- TERMINY (Supabase: slots) -------------------------------------------
  async function loadSlots() {
    const tbody = $('#slots-rows');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4">Ładowanie…</td></tr>';

    const { data, error } = await window.sb
      .from('slots')
      .select('id, when, service_name, taken')
      .order('when', { ascending: true });

    if (error) { tbody.innerHTML = `<tr><td colspan="4">${error.message}</td></tr>`; return; }

    tbody.innerHTML = '';
    for (const s of (data || [])) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtWhen(s.when)}</td>
        <td>${s.service_name || '-'}</td>
        <td>${s.taken ? 'Zajęty' : 'Wolny'}</td>
        <td>
          <button class="btn btn-cancel" data-slot-del="${s.id}" ${s.taken ? 'disabled' : ''}>Usuń</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  function wireSlots() {
    $('#slot-add')?.addEventListener('click', async () => {
      const when = $('#slot-date')?.value;
      const service = $('#slot-service')?.value?.trim();
      if (!when || !service) { alert('Podaj datę i usługę'); return; }
      const { error } = await window.sb
        .from('slots')
        .insert({ when: new Date(when).toISOString(), service_name: service, taken: false });
      if (error) { alert(error.message); return; }
      $('#slot-date').value = '';
      $('#slot-service').value = '';
      loadSlots();
    });

    $('#slots-rows')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-slot-del]');
      if (!btn) return;
      const id = btn.getAttribute('data-slot-del');
      if (!confirm('Usunąć ten wolny termin?')) return;
      const { error } = await window.sb
        .from('slots')
        .delete()
        .eq('id', id)
        .eq('taken', false);
      if (error) { alert(error.message); return; }
      loadSlots();
    });
  }

  // --- KLIENCI (LocalStorage-only + eksport/import) -------------------------
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LS_CLIENTS_KEY) || '{"clients":[]}'); }
    catch { return { clients: [] }; }
  }
  function saveLocal(db) {
    localStorage.setItem(LS_CLIENTS_KEY, JSON.stringify(db));
  }

  let CURRENT_CLIENT_ID = null;

  function loadClients() {
    const q = ($('#client-q')?.value || '').trim().toLowerCase();
    const tbody = $('#clients-rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    const db = loadLocal();
    let list = db.clients.slice().sort((a,b) => (a.name||'').localeCompare(b.name||''));
    if (q) list = list.filter(c => [c.name, c.email, c.phone].some(v => (v||'').toLowerCase().includes(q)));

    if (!list.length) { tbody.innerHTML = '<tr><td colspan="4">Brak klientów</td></tr>'; return; }

    for (const c of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.name || '-'}</td>
        <td>${c.email || '-'}</td>
        <td>${c.phone || '-'}</td>
        <td>
          <button class="btn btn-details" data-client-open="${c.id}">Otwórz</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  function openClientModal(c, treatments, notes) {
    $('#client-title').textContent = c.name ? `Karta klienta – ${c.name}` : 'Nowy klient';
    $('#client-name').value  = c.name || '';
    $('#client-email').value = c.email || '';
    $('#client-phone').value = c.phone || '';
    $('#client-preferences').value     = c.preferences || '';
    $('#client-allergies').value       = c.allergies || '';
    $('#client-contras').value         = c.contraindications || '';
    $('#client-notes').value           = c.notes || '';

    const box = $('#client-treatments');
    box.innerHTML = (treatments||[]).map(t =>
      `<div class="card" style="padding:8px;margin-bottom:6px">
         <b>${fmtWhen(t.when)}</b>
         – ${t.service_name || '-'}
       </div>`
    ).join('') || '<p class="muted">Brak historii</p>';

    $('#client-suggestions').innerHTML = generateSuggestions({
      preferences: c.preferences,
      allergies: c.allergies,
      contraindications: c.contraindications,
      notes: c.notes,
      treatments
    });

    $('#client-modal').classList.remove('hidden');
  }

  function wireClients() {
    $('#client-refresh')?.addEventListener('click', loadClients);
    $('#client-q')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadClients(); });

    $('#client-add')?.addEventListener('click', () => {
      CURRENT_CLIENT_ID = null;
      openClientModal({ name:'', email:'', phone:'', preferences:'', allergies:'', contraindications:'', notes:'', treatments:[] }, [], []);
    });

    $('#clients-rows')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-client-open]');
      if (!btn) return;
      const id = btn.getAttribute('data-client-open');
      CURRENT_CLIENT_ID = id;
      const db = loadLocal();
      const c = db.clients.find(x => x.id === id);
      if (!c) return alert('Klient nie istnieje (lokalnie).');
      const treatments = (c.treatments || []).slice().sort((a,b)=> new Date(b.when)-new Date(a.when));
      const notes = treatments[0]?.notes ? treatments[0].notes.slice().sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)) : [];
      openClientModal(c, treatments, notes);
    });

    $('#client-close')?.addEventListener('click', () => {
      $('#client-modal').classList.add('hidden');
    });

    $('#client-save')?.addEventListener('click', () => {
      const db = loadLocal();
      const existing = CURRENT_CLIENT_ID ? db.clients.find(x=>x.id===CURRENT_CLIENT_ID) : null;
      const payload = {
        id: CURRENT_CLIENT_ID || uid(),
        name: $('#client-name').value.trim(),
        email: $('#client-email').value.trim(),
        phone: $('#client-phone').value.trim(),
        preferences: $('#client-preferences').value,
        allergies: $('#client-allergies').value,
        contraindications: $('#client-contras').value,
        notes: $('#client-notes').value,
        treatments: existing ? (existing.treatments || []) : [],
        created_at: existing ? existing.created_at : new Date().toISOString()
      };
      if (existing) {
        const ix = db.clients.findIndex(x => x.id === CURRENT_CLIENT_ID);
        if (ix >= 0) db.clients[ix] = payload;
      } else {
        db.clients.push(payload);
        CURRENT_CLIENT_ID = payload.id;
      }
      saveLocal(db);
      $('#client-modal').classList.add('hidden');
      loadClients();
    });

    $('#client-delete')?.addEventListener('click', () => {
      if (!CURRENT_CLIENT_ID) { alert('Najpierw zapisz klienta'); return; }
      if (!confirm('Usunąć klienta wraz z jego historią (lokalnie)?')) return;
      const db = loadLocal();
      db.clients = db.clients.filter(c => c.id !== CURRENT_CLIENT_ID);
      saveLocal(db);
      $('#client-modal').classList.add('hidden');
      loadClients();
    });

    $('#treat-add')?.addEventListener('click', () => {
      if (!CURRENT_CLIENT_ID) return alert('Najpierw zapisz / wybierz klienta');
      const when = $('#treat-date').value;
      const service = $('#treat-service').value.trim();
      if (!when || !service) return alert('Podaj datę i usługę');
      const db = loadLocal();
      const c = db.clients.find(x => x.id === CURRENT_CLIENT_ID);
      if (!c) return alert('Klient nie istnieje.');
      c.treatments ||= [];
      c.treatments.push({ id: uid(), when: new Date(when).toISOString(), service_name: service, notes: [] });
      saveLocal(db);
      document.querySelector(`[data-client-open="${CURRENT_CLIENT_ID}"]`)?.click();
    });

    $('#treat-note-add')?.addEventListener('click', () => {
      if (!CURRENT_CLIENT_ID) return alert('Najpierw zapisz / wybierz klienta');
      const note = $('#treat-note').value.trim();
      if (!note) return alert('Wpisz notatkę');
      const db = loadLocal();
      const c = db.clients.find(x => x.id === CURRENT_CLIENT_ID);
      if (!c || !(c.treatments||[]).length) return alert('Brak zabiegów');
      const last = c.treatments.slice().sort((a,b)=> new Date(b.when)-new Date(a.when))[0];
      last.notes ||= [];
      last.notes.push({ id: uid(), text: note, created_at: new Date().toISOString() });
      saveLocal(db);
      $('#treat-note').value = '';
      document.querySelector(`[data-client-open="${CURRENT_CLIENT_ID}"]`)?.click();
    });

    // Eksport/Import JSON
    $('#client-export')?.addEventListener('click', () => {
      const db = loadLocal();
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clients-backup-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    $('#client-import')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.clients)) throw new Error('Plik ma nieprawidłowy format');
        saveLocal(data);
        alert('Zaimportowano bazę klientów (lokalnie).');
        loadClients();
      } catch (err) {
        alert('Błąd importu: ' + err.message);
      } finally {
        e.target.value = '';
      }
    });
  }

  function generateSuggestions(ctx) {
    const parts = [];
    if (ctx.allergies) parts.push('Unikaj zabiegów/olejków związanych z uczuleniami.');
    if (ctx.contraindications) parts.push('Zwróć uwagę na przeciwwskazania przy doborze intensywności.');
    if ((ctx.treatments||[]).length >= 3) parts.push('Rozważ cykl przypominający co 2–3 tygodnie.');
    if (ctx.preferences) parts.push('Uwzględnij preferencje klienta przy doborze technik.');
    return parts.length ? `<ul>${parts.map(p=>`<li>${p}</li>`).join('')}</ul>` : '<p class="muted">Brak sugestii – dodaj dane.</p>';
  }

  // --- USTAWIENIA (Supabase: settings) -------------------------------------
  async function loadSettings() {
    if (!window.sb) return;
    const { data, error } = await window.sb.from('settings').select('key, value');
    if (error) { console.warn(error); return; }
    const map = Object.fromEntries((data||[]).map(r => [r.key, r.value]));
    $('#set-prep-text').value = map['prep_text'] || '';
    $('#set-pin').value       = map['pin'] || PIN;
    $('#set-email').value     = map['contact_email'] || '';
    $('#set-phone').value     = map['contact_phone'] || '';
  }

  function wireSettings() {
    $('#settings-save')?.addEventListener('click', async () => {
      if (!window.sb) return alert('Brak klienta Supabase');
      const rows = [
        { key:'prep_text',     value: $('#set-prep-text').value },
        { key:'pin',           value: $('#set-pin').value.trim() || PIN },
        { key:'contact_email', value: $('#set-email').value.trim() },
        { key:'contact_phone', value: $('#set-phone').value.trim() },
      ];
      const { error } = await window.sb.from('settings').upsert(rows, { onConflict: 'key' });
      if (error) return alert(error.message);
      alert('Zapisano ustawienia');
      // Zaktualizuj PIN w pamięci (bez wylogowania)
      const pinRow = rows.find(r => r.key === 'pin');
      if (pinRow && pinRow.value) PIN = String(pinRow.value);
    });
  }

  // --- START ----------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    try { if (window.sb) console.log('[supabase-client] OK'); } catch {}
    wireTabs();
    wireLogin();
    wireBookingsToolbar();
    wireGlobalActions();
    wireSlots();
    wireClients();
    wireSettings();
  });
})();
