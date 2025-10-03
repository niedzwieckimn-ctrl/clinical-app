/* ===========================
   Admin Panel – single file JS
   Wymagania: na stronie wcześniej załączony supabase-client.js,
   który tworzy window.sb = createClient(...)
   =========================== */

(function () {
  // --- KONFIG (PIN tymczasowo – przeniesiemy do env) ---
  const ADMIN_PIN = window.ADMIN_PIN || '2505';
  const AUTH_KEY = 'admin_auth_ok';

  // --- Helpery DOM ---
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Rozpoznaj kluczowe elementy nawet przy różnych ID/klasach
  function getEls() {
    const form =
      $('#loginForm') || $('#pinForm') || $('form[action="#pin"]') || $('form');
    const pin =
      $('#pin') ||
      $('[name="pin"]') ||
      $('input[type="password"], input[autocomplete="one-time-code"]');

    const loginCard = $('#loginCard') || $('#login') || $('.login,.auth');
    const app = $('#app') || $('.app') || document.body; // fallback

    const list =
      $('#bookingsList') ||
      $('[data-role="bookingsList"]') ||
      $('#list, .list, .bookings');

    const filter =
      $('#statusFilter') ||
      $('[data-role="statusFilter"]') ||
      $('#filter');

    const err = $('#loginError') || $('[data-role="loginError"]');

    return { form, pin, loginCard, app, list, filter, err };
  }

  // --- Format daty/godziny PL ---
  function fmtWhen(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('pl-PL', {
        dateStyle: 'full',
        timeStyle: 'short',
      });
    } catch {
      return iso || '';
    }
  }

  // --- Bezpieczny dostęp do Supabase (window.sb z supabase-client.js) ---
  function assertSB() {
    if (!window.sb) {
      throw new Error(
        'Supabase client (window.sb) nie jest dostępny. Upewnij się, że supabase-client.js jest załączony przed admin.js.'
      );
    }
    return window.sb;
  }

  // --- API: pobierz rezerwacje z widoku ---
  async function fetchBookings(status = 'all') {
    const sb = assertSB();
    let q = sb.from('bookings_view').select('*').order('when', { ascending: true }).limit(500);
    if (status && status !== 'all') q = q.eq('status', status);
    const { data, error, status: httpStatus } = await q;
    if (error) {
      // PostgREST 404 przy braku widoku
      throw new Error(
        `[fetchBookings] ${httpStatus || ''} ${error.code || ''}: ${error.message || error}`
      );
    }
    return data || [];
  }

  // --- Akcje admina (używają Netlify Functions – opcjonalnie) ---
  async function callFn(name, payload) {
    try {
      const res = await fetch(`/.netlify/functions/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const txt = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} – ${txt}`);
      try { return JSON.parse(txt); } catch { return { ok: true, raw: txt }; }
    } catch (e) {
      // Nie blokuj działania, tylko pokaż błąd
      console.warn(`[functions:${name}]`, e);
      throw e;
    }
  }

  async function confirmBooking(booking_id) {
    // Jeśli nie masz jeszcze funkcji – zakomentuj callFn, a tylko zmieniaj status lokalnie / w DB
    // return callFn('admin-confirm', { booking_id });
    // Minimalny fallback – bez Functions: ustaw status w DB, jeśli masz endpointy RLS dozwolone:
    const sb = assertSB();
    const { error } = await sb.from('bookings')
      .update({ status: 'Potwierdzona' })
      .eq('id', booking_id);
    if (error) throw error;
    return { ok: true };
  }

  async function cancelBooking(booking_id) {
    // return callFn('admin-cancel', { booking_id });
    const sb = assertSB();
    const { error } = await sb.from('bookings')
      .update({ status: 'Anulowana' })
      .eq('id', booking_id);
    if (error) throw error;
    return { ok: true };
  }

  // --- Render listy ---
  function renderBookings(listEl, rows) {
    if (!listEl) return;
    if (!rows || !rows.length) {
      listEl.innerHTML = `
        <div class="empty" style="padding:12px;color:#666;">
          Brak rezerwacji do wyświetlenia.
        </div>`;
      return;
    }

    const html = rows
      .map((r) => {
        const whenTxt = fmtWhen(r.when);
        return `
          <div class="booking-row" data-id="${r.booking_no}"
               style="border:1px solid #ddd;border-radius:8px;margin:8px 0;padding:10px;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;">
            <div class="info" style="min-width:0;">
              <div style="font-weight:600;">#${r.booking_no || ''} • ${r.service_name || ''}</div>
              <div>${whenTxt}</div>
              <div>${r.client_name || ''} &lt;${r.client_email || ''}&gt;</div>
              <div>Tel: ${r.phone || ''}</div>
              ${r.notes ? `<div style="color:#555;">Uwagi: ${r.notes}</div>` : ''}
              <div style="margin-top:4px;">
                <span class="status" style="padding:2px 8px;border-radius:999px;border:1px solid #ccc;font-size:12px;">
                  ${r.status || 'Oczekująca'}
                </span>
              </div>
            </div>
            <div class="actions" style="display:flex;gap:6px;">
              <button class="btn btn-ok" data-action="confirm"
                      style="padding:6px 10px;border:0;border-radius:8px;cursor:pointer;">Potwierdź</button>
              <button class="btn btn-cancel" data-action="cancel"
                      style="padding:6px 10px;border:0;border-radius:8px;background:#eee;cursor:pointer;">Anuluj</button>
            </div>
          </div>
        `;
      })
      .join('');

    listEl.innerHTML = html;
  }

  // --- Odświeżenie (z filtrem) ---
  async function refresh(els) {
    try {
      const val =
        (els.filter && (els.filter.value || els.filter.dataset.value)) || 'all';
      const rows = await fetchBookings(val);
      renderBookings(els.list, rows);
    } catch (e) {
      console.error('Błąd pobierania rezerwacji:', e);
      if (els.list)
        els.list.innerHTML = `<div style="color:#b00;padding:12px;">Błąd pobierania rezerwacji: ${e.message || e}</div>`;
    }
  }

  // --- Logowanie PIN ---
  function showApp(els) {
    if (els.loginCard) els.loginCard.style.display = 'none';
    if (els.app && els.app !== document.body) els.app.style.display = '';
    document.body.classList.add('authed');
    localStorage.setItem(AUTH_KEY, '1');
  }

  function showLogin(els) {
    if (els.app && els.app !== document.body) els.app.style.display = 'none';
    if (els.loginCard) els.loginCard.style.display = '';
    document.body.classList.remove('authed');
    localStorage.removeItem(AUTH_KEY);
  }

  function attachLogin(els) {
    if (!els.form || !els.pin) {
      console.warn(
        '[login] Brakuje formularza lub pola PIN – szukam #loginForm/#pinForm i #pin/[name=pin].'
      );
      return;
    }
    els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = String(els.pin.value || '').trim();
      if (!val) {
        if (els.err) {
          els.err.textContent = 'Wpisz PIN.'; els.err.style.display = '';
          setTimeout(() => (els.err.style.display = 'none'), 2000);
        }
        return;
      }
      if (val === ADMIN_PIN) {
        showApp(els);
        refresh(els);
      } else {
        if (els.err) {
          els.err.textContent = 'Zły PIN.'; els.err.style.display = '';
          setTimeout(() => (els.err.style.display = 'none'), 2000);
        }
        if (els.pin.select) els.pin.select();
      }
    });
  }

  // --- Zdarzenia UI ---
  function attachUI(els) {
    // filtr statusu
    if (els.filter) {
      els.filter.addEventListener('change', () => refresh(els));
    }
    // akcje confirm / cancel (delegacja)
    if (els.list) {
      els.list.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const row = e.target.closest('.booking-row');
        const id = row && row.getAttribute('data-id');
        if (!id) return;

        btn.disabled = true;
        try {
          if (btn.dataset.action === 'confirm') {
            await confirmBooking(id);
          } else if (btn.dataset.action === 'cancel') {
            await cancelBooking(id);
          }
          await refresh(els);
        } catch (err) {
          alert(`Błąd akcji: ${err.message || err}`);
          btn.disabled = false;
        }
      });
    }
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', () => {
    const els = getEls();

    // jeśli mamy supabase-client.js – pokaż krótki ping w konsoli
    try {
      if (window.sb) console.log('[supabase-client] OK');
    } catch {}

    attachLogin(els);
    attachUI(els);

    // auto-wznowienie sesji jeśli było zalogowane
    if (localStorage.getItem(AUTH_KEY) === '1') {
      showApp(els);
      refresh(els);
    } else {
      showLogin(els);
    }
  });
})();
