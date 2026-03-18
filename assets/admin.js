/* =========================================
   Admin panel – wersja stabilna
   - PIN lokalny 2505 + opcjonalny PIN z ustawień
   - Zakładki: Rezerwacje / Terminy / Klienci / Ustawienia
   - Rezerwacje: bookings_view + Netlify Functions confirm/cancel
   - Terminy: tylko data/godzina, zaokrąglanie do 5 minut
   - Klienci: obsługiwani przez assets/clients.js
   - Ustawienia: localStorage (pin, prep_text, contact_*)
========================================= */

(function () {
  'use strict';

  let PIN = '2505';
  const MASTER_PIN = '2505';
  const AUTH_KEY = 'adm_ok';
  const SETTINGS_KEY = 'adm_settings_v1';

  const $ = (s, r = document) => r.querySelector(s);
  const fmtWhen = (iso) => {
    try {
      return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso || '';
    }
  };
  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function hydrateSettingsForm() {
    const settings = loadSettings();
    const savedPin = String(settings.pin || '').trim();
    if (/^\d{4,8}$/.test(savedPin)) PIN = savedPin;

    const pinEl = $('#set-pin');
    const emailEl = $('#set-email');
    const phoneEl = $('#set-phone');
    const prepEl = $('#set-prep-text');

    if (pinEl) pinEl.value = PIN;
    if (emailEl) emailEl.value = settings.contact_email || '';
    if (phoneEl) phoneEl.value = settings.contact_phone || '';
    if (prepEl) prepEl.value = settings.prep_text || '';
  }

  function saveSettings() {
    const nextPin = String($('#set-pin')?.value || '').trim();
    const next = {
      pin: /^\d{4,8}$/.test(nextPin) ? nextPin : PIN,
      contact_email: String($('#set-email')?.value || '').trim(),
      contact_phone: String($('#set-phone')?.value || '').trim(),
      prep_text: String($('#set-prep-text')?.value || '').trim()
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    PIN = next.pin;
    hydrateSettingsForm();
    alert('Ustawienia zapisane.');
  }

  function showNav() {
    const nav = $('#top-tabs');
    if (nav) nav.style.display = '';
  }

  function showTab(name) {
    const ids = ['bookings', 'slots', 'clients', 'settings'];
    for (const id of ids) {
      const el = document.getElementById(`${id}-screen`);
      if (el) el.classList.toggle('hidden', id !== name);
    }

    if (name === 'bookings') initBookings();
    if (name === 'slots') loadSlots();
    if (name === 'clients') window.Clients?.render();
    if (name === 'settings') hydrateSettingsForm();
  }

  (function wireTabs() {
    $('#top-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      showTab(btn.dataset.tab);
    });
  })();

  function wireLogin() {
    const pinScr = $('#pin-screen');
    const bookScr = $('#bookings-screen');

    async function afterLogin() {
      pinScr?.classList.add('hidden');
      bookScr?.classList.remove('hidden');
      showNav();
      showTab('bookings');
    }

    if (localStorage.getItem(AUTH_KEY) === '1') {
      afterLogin();
      return;
    }

    const btn = $('#pin-btn');
    const inp = $('#pin-input');
    const err = $('#pin-err');

    const enter = async () => {
      const val = String(inp?.value || '').trim();
      if (!val) {
        if (err) err.textContent = 'Wpisz PIN';
        inp?.focus();
        return;
      }

      if (val === PIN || val === MASTER_PIN) {
        localStorage.setItem(AUTH_KEY, '1');
        if (err) err.textContent = '';
        await afterLogin();
        return;
      }

      if (err) err.textContent = 'Nieprawidłowy PIN';
      inp?.select?.();
    };

    btn?.addEventListener('click', enter);
    inp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enter();
    });
  }

  async function fetchBookings() {
    const nowIso = new Date().toISOString();
    let q = window.sb.from('bookings_view')
      .select('*')
      .order('when', { ascending: true })
      .neq('status', 'Anulowana')
      .gte('when', nowIso);

    const status = $('#status-filter')?.value || '';
    if (status) q = q.eq('status', status);

    const term = String($('#q')?.value || '').trim();
    if (term) {
      q = q.or(`client_name.ilike.%${term}%,client_email.ilike.%${term}%`);
    }

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  function renderBookingsRows(list) {
    const tbody = $('#rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5">Brak rezerwacji</td></tr>';
      return;
    }

    for (const b of list) {
      const isConfirmed = b.status === 'Potwierdzona';
      const badge = isConfirmed
        ? '<span class="status confirmed">Potwierdzona</span>'
        : '<span class="status pending">Oczekująca</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(b.booking_no || '-')}</td>
        <td>${esc(b.client_name || '-')}</td>
        <td>${esc(fmtWhen(b.when))}</td>
        <td>${badge}</td>
        <td>
          <button class="btn btn-confirm" data-action="confirm" data-id="${esc(b.booking_no)}" ${isConfirmed ? 'disabled' : ''}>Potwierdź</button>
          <button class="btn btn-cancel" data-action="cancel" data-id="${esc(b.booking_no)}">Usuń</button>
          <button class="btn btn-details" data-action="details" data-id="${esc(b.booking_no)}">Szczegóły</button>
        </td>`;
      tr.dataset.details = JSON.stringify(b);
      tbody.appendChild(tr);
    }
  }

  async function initBookings() {
    try {
      renderBookingsRows(await fetchBookings());
    } catch (e) {
      const tbody = $('#rows');
      if (tbody) tbody.innerHTML = `<tr><td colspan="5">${esc(e?.message || 'Błąd')}</td></tr>`;
    }
  }

  (function wireBookingsToolbar() {
    $('#refresh')?.addEventListener('click', initBookings);
    $('#status-filter')?.addEventListener('change', initBookings);
    $('#q')?.addEventListener('input', initBookings);
    $('#from')?.addEventListener('change', initBookings);
    $('#to')?.addEventListener('change', initBookings);
  })();

  async function confirmBooking(bookingNo) {
    try {
      const res = await fetch('/.netlify/functions/admin-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_no: bookingNo })
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      return text ? JSON.parse(text) : { ok: true };
    } catch (e) {
      console.warn('[admin-confirm] fallback:', e);
      const { error } = await window.sb
        .from('bookings')
        .delete()
        .eq('booking_no', bookingNo);
      if (error) throw error;
      return { ok: true, fallback: true };
    }
  }

  async function cancelBooking(bookingNo) {
    try {
      const res = await fetch('/.netlify/functions/admin-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_no: bookingNo })
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      return text ? JSON.parse(text) : { ok: true };
    } catch (e) {
      console.warn('[admin-cancel] fallback:', e);

      const { data: booking, error: getErr } = await window.sb
        .from('bookings_view')
        .select('when, slot_id')
        .eq('booking_no', bookingNo)
        .single();
      if (getErr) throw getErr;

      const { error: updErr } = await window.sb
        .from('bookings')
        .update({ status: 'Anulowana', canceled_at: new Date().toISOString() })
        .eq('booking_no', bookingNo);
      if (updErr) throw updErr;

      if (booking?.slot_id) {
        await window.sb.from('slots').update({ taken: false }).eq('id', booking.slot_id);
      } else if (booking?.when) {
        await window.sb.from('slots').update({ taken: false }).eq('when', booking.when);
      }

      return { ok: true, fallback: true };
    }
  }

  (function wireGlobalActions() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'details') {
        const tr = btn.closest('tr');
        const b = JSON.parse(tr?.dataset.details || '{}');
        const addr = b.address || '';
        const email = b.client_email || b.email || '';
        const phone = b.phone || b.client_phone || '';
        const mapH = addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : '';
        const mailH = email ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Rezerwacja potwierdzona')}` : '';
        const telH = phone ? `tel:${String(phone).replace(/[^\d+]/g, '')}` : '';

        const body = $('#details-body');
        if (body) {
          body.innerHTML = `
            <p><b>Nr rezerwacji:</b> ${esc(b.booking_no || '')}</p>
            <p><b>Imię i nazwisko:</b> ${esc(b.client_name || '')}</p>
            <p><b>Termin:</b> ${esc(fmtWhen(b.when))}</p>
            <p><b>Usługa:</b> ${esc(b.service_name || '')}</p>
            <p><b>Adres:</b> ${addr ? `<a href="${mapH}" target="_blank" rel="noopener">${esc(addr)}</a>` : '-'}</p>
            <p><b>E-mail:</b> ${email ? `<a href="${mailH}">${esc(email)}</a>` : '-'}</p>
            <p><b>Telefon:</b> ${phone ? `<a href="${telH}">${esc(phone)}</a>` : '-'}</p>
            <p><b>Uwagi:</b> ${esc(b.notes || '-')}</p>`;
        }
        $('#details-modal')?.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      try {
        if (action === 'confirm') await confirmBooking(id);
        if (action === 'cancel') {
          if (!confirm('Na pewno anulować tę rezerwację?')) return;
          await cancelBooking(id);
        }
        await initBookings();
      } catch (err) {
        alert(`Błąd: ${err?.message || err}`);
      } finally {
        btn.disabled = false;
      }
    });

    $('#close-details')?.addEventListener('click', () => $('#details-modal')?.classList.add('hidden'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $('#details-modal')?.classList.add('hidden');
    });
  })();

  async function loadSlots() {
    const tbody = $('#slots-rows');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">Ładowanie…</td></tr>';

    const { data, error } = await window.sb
      .from('slots')
      .select('id, when, taken')
      .gte('when', new Date().toISOString())
      .order('when', { ascending: true });

    if (error) {
      tbody.innerHTML = `<tr><td colspan="3">${esc(error.message)}</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    for (const slot of data || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(fmtWhen(slot.when))}</td>
        <td>${slot.taken ? 'Zajęty' : 'Wolny'}</td>
        <td><button class="btn" data-slot-del="${slot.id}" ${slot.taken ? 'disabled' : ''}>Usuń</button></td>`;
      tbody.appendChild(tr);
    }

    if (!data?.length) {
      tbody.innerHTML = '<tr><td colspan="3">Brak przyszłych terminów</td></tr>';
    }
  }

  (function wireSlots() {
    $('#slot-add')?.addEventListener('click', async () => {
      const when = $('#slot-date')?.value;
      if (!when) {
        alert('Podaj datę');
        return;
      }

      const dt = new Date(when);
      dt.setSeconds(0, 0);
      dt.setMinutes(Math.round(dt.getMinutes() / 5) * 5);

      const { error } = await window.sb.from('slots').insert({ when: dt.toISOString(), taken: false });
      if (error) {
        alert(error.message);
        return;
      }

      $('#slot-date').value = '';
      loadSlots();
    });

    $('#slots-rows')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-slot-del]');
      if (!btn) return;
      if (!confirm('Usunąć ten wolny termin?')) return;

      const { error } = await window.sb.from('slots').delete().eq('id', btn.dataset.slotDel).eq('taken', false);
      if (error) {
        alert(error.message);
        return;
      }
      loadSlots();
    });

    $('#slot-clean')?.addEventListener('click', async () => {
      const { error } = await window.sb
        .from('slots')
        .delete()
        .lt('when', new Date().toISOString())
        .eq('taken', false);
      if (error) {
        alert(error.message);
        return;
      }
      loadSlots();
    });
  })();

  document.addEventListener('DOMContentLoaded', () => {
    hydrateSettingsForm();
    wireLogin();
    $('#settings-save')?.addEventListener('click', saveSettings);
    window.Clients?.init();
  });
})();
index.html
index.html
+ 5
- 60

<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Massages &amp; Spa Clinical — Panel Admin</title>
  <link rel="icon" href="assets/logo.svg" />
  <style>
    :root { --card: #fff; --muted:#666; --bd:#e9e9e9; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin:0; padding:20px; background:#f7f7f8; }
    header { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
    .wrap { max-width: 980px; margin: 0 auto; }
    .card { background: var(--card); border:1px solid var(--bd); border-radius:14px; box-shadow: 0 6px 18px rgba(0,0,0,.04); padding:16px; }
    .stack { display:grid; gap:12px; }
    .hidden { display:none !important; }
    .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .toolbar input, .toolbar select { padding:8px 10px; border:1px solid var(--bd); border-radius:10px; }
    .btn { padding:8px 12px; border:1px solid var(--bd); background:#fafafa; border-radius:10px; cursor:pointer; }
    .btn[disabled] { opacity:.6; cursor:progress; }

    table { width:100%; border-collapse:collapse; font-size:14px; }
    th, td { padding:10px 8px; border-bottom:1px solid var(--bd); text-align:left; }
    th { background:#fafafa; position:sticky; top:0; }

    .status { padding: 2px 8px; border-radius:999px; font-size:12px; border:1px solid var(--bd); }
    .pending{ background:#fff8e1; }
    .confirmed{ background:#e8f5e9; }
    .canceled{ background:#ffebee; }
    .muted{ color:var(--muted); }

    .modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); display:none; align-items:center; justify-content:center; }
@@ -35,50 +35,54 @@
	.btn-confirm { background:#16a34a; color:#fff; border-color:#128a3f; }
.btn.btn-confirm { background:#16a34a !important; color:#fff !important; border-color:#128a3f !important; }
.btn.btn-confirm:hover { filter:brightness(0.95); }

.btn.btn-cancel  { background:#dc2626 !important; color:#fff !important; border-color:#b31f1f !important; }
.btn.btn-cancel:hover  { filter:brightness(0.95); }

.btn.btn-details { background:#607d8b !important; color:#fff !important; border-color:#546e7a !important; }
.btn.btn-details:hover { filter:brightness(0.95); }
.status { padding: 2px 8px; border-radius: 999px; font-size: 12px; color:#fff; }
.status.pending { background:#f59e0b; }      /* bursztyn */
.status.confirmed { background:#16a34a; }    /* zielony */




  </style>

  <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
  <script src="assets/supabase-client.js"></script>
</head>
<body>
  <div class="wrap">
    <header>
      <img src="assets/logo.svg" alt="" height="36" />
      <div>
        <h1 style="margin:0; font-size:22px;">Massages &amp; Spa Clinical</h1>
        <p style="margin:4px 0 0; color:#6b7280;">Panel administracyjny</p>
      </div>

    </header>

    <!-- PIN -->
    <section id="pin-screen" class="card stack">
      <div class="stack">
        <h2 style="margin:0">Wejście</h2>
        <label for="pin-input">PIN admina</label>
        <input id="pin-input" type="password" inputmode="numeric" maxlength="8" placeholder="****" />
        <button id="pin-btn" class="btn">Zaloguj</button>
        <p id="pin-err" class="muted" style="color:#b00;"></p>
      </div>
    </section>

    <!-- TABS -->
    <nav class="tabs card" id="top-tabs" style="display:none">
      <button data-tab="bookings">Rezerwacje</button>
      <button data-tab="slots">Terminy</button>
      <button data-tab="clients">Klienci</button>
      <button data-tab="settings">Ustawienia</button>
    </nav>

    <!-- REZERWACJE -->
    <section id="bookings-screen" class="hidden stack">
      <div class="toolbar row">
@@ -127,125 +131,66 @@
      <div class="row">
        <input id="slot-date" type="datetime-local" step="300" />
        <button id="slot-add" class="btn">Dodaj wolny termin</button>
		<button id="slot-clean" class="btn">Usuń przeterminowane</button>
      </div>

      <table class="bookings-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Status</th>
            <th>Akcje</th>
          </tr>
        </thead>
        <tbody id="slots-rows"></tbody>
      </table>
    </section>

<!-- ============== KLIENCI ============== -->
<section id="clients-screen" class="hidden card stack">
  <h2>Klienci</h2>

  <!-- Pasek narzędzi -->
  <div class="row" style="gap:.5rem;flex-wrap:wrap">
    <input id="client-search" type="search" placeholder="Szukaj: imię, e-mail, tel." />
  </div>

  <!-- Lista klientów -->
  <table class="bookings-table">
    <thead>
  <tr>
    <th>Imię i nazwisko</th>
    <th>Adres</th>
    <th>Szczegóły</th>
  </tr>
</thead>
<tbody id="clients-rows"></tbody>
  </table>
</section>
    <section id="settings-screen" class="hidden card stack">
      <h2>Ustawienia</h2>
      <label>„Zalecenia przed zabiegiem”</label>
      <textarea id="set-prep-text" rows="6"></textarea>
      <div class="row">
        <div class="stack">
          <label>PIN</label>
          <input id="set-pin" placeholder="np. 2505" />
        </div>
        <div class="stack">
          <label>E-mail</label>
          <input id="set-email" />
        </div>
        <div class="stack">
          <label>Telefon</label>
          <input id="set-phone" />
        </div>
      </div>
      <button id="settings-save" class="btn">Zapisz ustawienia</button>
    </section>
  </div>

<script src="assets/admin.js"></script>
<script src="assets/clients.js"></script>

</body>
</html>
