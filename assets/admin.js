/* =========================================
   Admin panel – dopasowany do Twojego HTML:
   - #pin-screen, #pin-input, #pin-btn, #pin-err
   - #list-screen, #rows (tbody), filtry: #status-filter #q #from #to #refresh
   - Supabase klient: window.sb (tworzony w assets/supabase-client.js)
   - Widok: bookings_view (kolumny: booking_no, status, when, service_name, client_name, client_email, phone, notes, created_at)
   ========================================= */

(function () {
  // --- KONFIG ---
  const PIN = '2505';           // PIN logowania (jak ustaliliśmy)
  const AUTH_KEY = 'adm_ok';    // flaga w localStorage, nie zmieniaj

  // --- UTIL ---
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  function fmtWhen(iso) {
    try {
      return new Date(iso).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' });
    } catch { return iso || ''; }
  }

  function assertSB() {
    if (!window.sb) {
      throw new Error('[admin] Brak Supabase client (window.sb). Upewnij się, że assets/supabase-client.js ładuje się PRZED admin.js');
    }
    return window.sb;
  }

  // --- FILTRY (lokalne) ---
  function matchesQuery(b, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return [
      b.client_name, b.client_email, b.phone, b.service_name, b.notes
    ].some(x => (x||'').toLowerCase().includes(q));
  }
  function inRange(iso, from, to) {
    if (!from && !to) return true;
    const t = new Date(iso).getTime();
    if (from && t < new Date(from).getTime()) return false;
    if (to) {
      const end = new Date(to); end.setHours(23,59,59,999);
      if (t > end.getTime()) return false;
    }
    return true;
  }

  // --- API: pobierz listę z widoku ---
  async function fetchBookings() {
    const sb = assertSB();
    const { data, error, status } = await sb
      .from('bookings_view')
      .select('booking_no, status, when, service_name, client_name, client_email, phone, notes, created_at')
      .order('when', { ascending: true })
      .limit(500);

    if (error) {
      console.error('[admin] Błąd pobierania rezerwacji:', status, error);
      throw new Error(error.message || 'Błąd pobierania');
    }
    return data || [];
  }
  window.fetchBookings = fetchBookings; // do debug

  // --- RENDER TABELI ---
  function renderRows(list) {
    const tbody = $('#rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    for (const b of list) {
      const st = (b.status || 'Oczekująca').toLowerCase();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtWhen(b.when)}</td>
        <td>${b.client_name || '-'}</td>
        <td>${b.service_name || '-'}</td>
        <td><span class="status ${st}">${b.status || 'Oczekująca'}</span></td>
        <td>${b.phone || '-'}</td>
        <td>${b.client_email || '-'}</td>
        <td>
          ${st.startsWith('oczek') || st === 'pending' ? `<button class="btn confirm-btn" data-id="${b.booking_no}">Potwierdź</button>` : ''}
          ${st !== 'anulowana' && st !== 'canceled' ? `<button class="btn cancel-btn" data-id="${b.booking_no}">Anuluj</button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  function applyFilters(items) {
    const status = $('#status-filter')?.value || '';
    const q = $('#q')?.value?.trim() || '';
    const from = $('#from')?.value || null;
    const to   = $('#to')?.value || null;

    return items.filter(b =>
      (!status || String(b.status||'').toLowerCase() === status.toLowerCase()) &&
      matchesQuery(b, q) &&
      inRange(b.when, from, to)
    );
  }

  async function initList() {
    const btn = $('#refresh');
    try {
      if (btn) btn.disabled = true;
      const data = await fetchBookings();
      const filtered = applyFilters(data);
      renderRows(filtered);
    } catch (e) {
      console.error(e);
      const tb = $('#rows');
      if (tb) tb.innerHTML = `<tr><td colspan="7" style="color:#b00;padding:8px;">${e.message || e}</td></tr>`;
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  window.initList = initList; // do debug

  // --- AKCJE: Potwierdź / Anuluj ---
  async function confirmBooking(id) {
    // WARIANT A (zalecany): Netlify Function z service_role
    try {
      const res = await fetch('/.netlify/functions/admin-confirm', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ id })
      });
      const out = await res.text();
      if (!res.ok) throw new Error(out);
      try { return JSON.parse(out); } catch { return { ok:true, raw: out }; }
    } catch (e) {
      console.warn('[admin-confirm] funkcja nieosiągalna – fallback bezpośredni:', e);
      // WARIANT B (fallback): bezpośrednio w DB (jeśli RLS pozwala)
      const sb = assertSB();
      const { error } = await sb.from('bookings')
        .update({ status: 'Potwierdzona', confirmed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return { ok: true };
    }
  }

  async function cancelBooking(id) {
    // WARIANT A: funkcja netlify
    try {
      const res = await fetch('/.netlify/functions/admin-cancel', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ id })
      });
      const out = await res.text();
      if (!res.ok) throw new Error(out);
      try { return JSON.parse(out); } catch { return { ok:true, raw: out }; }
    } catch (e) {
      console.warn('[admin-cancel] funkcja nieosiągalna – fallback bezpośredni:', e);
      // WARIANT B: bezpośrednio w DB
      const sb = assertSB();
      const { error } = await sb.from('bookings')
        .update({ status: 'Anulowana', canceled_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      // opcjonalnie: zwolnić slot – wymaga slot_id; w widoku go nie ma, więc pomijamy w fallbacku
      return { ok: true };
    }
  }

  // Delegacja klików – jeden listener na całe tbody
  function wireActions() {
    const tbody = $('#rows');
    if (!tbody) return;
    tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;

      btn.disabled = true;
      try {
        if (btn.classList.contains('confirm-btn')) {
          const res = await confirmBooking(id);
          if (!res?.ok) throw new Error('Nie udało się potwierdzić');
          alert('Rezerwacja potwierdzona ✅');
        } else if (btn.classList.contains('cancel-btn')) {
          const res = await cancelBooking(id);
          if (!res?.ok) throw new Error('Nie udało się anulować');
          alert('Rezerwacja anulowana ❌');
        }
        await initList();
      } catch (err) {
        console.error(err);
        alert(`Błąd akcji: ${err.message || err}`);
      } finally {
        btn.disabled = false;
      }
    });
  }

  // --- LOGOWANIE PIN ---
  function wireLogin() {
    const pinScr  = $('#pin-screen');
    const listScr = $('#list-screen');
    const btn     = $('#pin-btn');
    const inp     = $('#pin-input');
    const errBox  = $('#pin-err');

    function showList() {
      pinScr?.classList.add('hidden');
      listScr?.classList.remove('hidden');
      localStorage.setItem(AUTH_KEY, '1');
      initList();
    }

    function showErr(msg) {
      if (!errBox) return alert(msg);
      errBox.textContent = msg;
    }

    if (localStorage.getItem(AUTH_KEY) === '1') {
      showList();
      return;
    }

    const enter = () => {
      const val = String(inp?.value || '').trim();
      if (!val) { showErr('Wpisz PIN'); return; }
      if (val === PIN) {
        showList();
      } else {
        showErr('Nieprawidłowy PIN');
        inp?.select?.();
      }
    };

    btn?.addEventListener('click', enter);
    inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
  }

  // --- FILTRY / TOOLBAR ---
  function wireFilters() {
    $('#refresh')?.addEventListener('click', initList);
    $('#status-filter')?.addEventListener('change', initList);
    $('#q')?.addEventListener('input', () => initList());
    $('#from')?.addEventListener('change', initList);
    $('#to')?.addEventListener('change', initList);
  }

  // --- START ---
  document.addEventListener('DOMContentLoaded', () => {
    try { if (window.sb) console.log('[supabase-client] OK'); } catch {}
    wireLogin();
    wireFilters();
    wireActions();
  });
})();
